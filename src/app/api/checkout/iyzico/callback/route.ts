import { NextRequest, NextResponse } from "next/server";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import { createAdminClient } from "@/lib/supabase-admin";
import { createIyzicoClient } from "@/lib/iyzico";
import { restoreOrderCredit } from "@/lib/store-credit";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yerihisset.com";

export async function POST(req: NextRequest) {
  // iyzico form POST olarak gönderir — token form field'ında gelir
  let token: string | null = null;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    token = params.get("token");
  } else {
    try {
      const json = await req.json();
      token = json.token;
    } catch {
      token = null;
    }
  }

  if (!token) {
    return NextResponse.redirect(`${SITE_URL}/checkout?hatali=1`, 303);
  }

  const supabase = createAdminClient();
  const iyzipay = createIyzicoClient();

  return new Promise<NextResponse>((resolve) => {
    iyzipay.checkoutFormAuth.retrieve({ locale: "tr", token }, async (err: any, result: any) => {
      if (err) {
        console.error("[iyzico/callback] retrieve error:", err);
        resolve(NextResponse.redirect(`${SITE_URL}/checkout?hatali=1`, 303));
        return;
      }

      const conversationId: string = result?.conversationId ?? "";
      const paymentStatus: string = result?.paymentStatus ?? "";
      const paymentId: string = result?.paymentId ?? "";

      // Siparişi conversationId üzerinden bul
      const { data: order } = await (supabase as any)
        .from("orders")
        .select("id, user_id, total_amount, order_number, payment_status, status")
        .eq("iyzico_conversation_id", conversationId)
        .single();

      if (!order) {
        console.error("[iyzico/callback] order not found for conversationId:", conversationId);
        resolve(NextResponse.redirect(`${SITE_URL}/checkout?hatali=1`, 303));
        return;
      }

      const successUrl = `${SITE_URL}/siparis-tamam?id=${order.id}`;

      if (paymentStatus === "SUCCESS") {
        // Aynı ödeme için İKİNCİ dönüş (iyzico tekrarı / tarayıcı yenileme) → yan etki yok
        // (stok, kupon sayacı ve e-postalar iki kez işlenmesin)
        if (order.payment_status === "paid") {
          resolve(NextResponse.redirect(successUrl, 303));
          return;
        }
        const wasCancelled = order.status === "cancelled"; // 30 dk dolup otomatik iptal edilmişti

        // Ödeme başarılı → siparişi onayla
        await (supabase as any)
          .from("orders")
          .update({
            status: "processing",
            payment_status: "paid",
            shipment_status: "preparing",
            iyzico_payment_id: String(paymentId),
          })
          .eq("id", order.id);

        // Kontrol notları: iyzico'nun onayladığı tutar ≠ sipariş tutarı, ya da süre dolup
        // iptal edilmiş sipariş sonradan ödendi → admin siparişte görür
        const notes: string[] = [];
        const iyzPrice = Number(result?.price ?? NaN);
        if (Number.isFinite(iyzPrice) && Math.abs(iyzPrice - Number(order.total_amount)) > 0.01) {
          notes.push(`⚠ iyzico tutarı (₺${iyzPrice.toFixed(2)}) sipariş tutarından (₺${Number(order.total_amount).toFixed(2)}) farklı — kontrol et`);
        }
        if (wasCancelled) notes.push("Ödeme süresi dolup otomatik iptal edilmişti; ödeme sonradan geldi → sipariş yeniden açıldı");
        if (result?.fraudStatus === 0) notes.push("iyzico bu ödemeyi incelemeye aldı (fraudStatus=0) — iyzico panelinden onayı bekle");
        for (const n of notes) {
          await (supabase as any).from("order_events").insert({ order_id: order.id, type: "note", note: n });
        }

        // ── STOK DÜŞÜMÜ (soft) ────────────────────────────────────────────────
        // Para çekildiği için siparişi ASLA reddetmiyoruz. Stok yetmezse (nadir
        // oversell yarışı) stok 0'a sabitlenir ve admin'e not düşülür.
        try {
          const { data: reduceRes } = await (supabase as any).rpc(
            "reduce_order_stock",
            { p_order_id: order.id, p_strict: false }
          );
          kickMarketplaceSync(); // stok değişti → pazaryerlerine (Trendyol) gönder
          const shortages = reduceRes?.shortages;
          if (Array.isArray(shortages) && shortages.length > 0) {
            console.error("[iyzico/callback] STOK EKSİĞİ order", order.id, shortages);
            const note = "⚠ STOK EKSİĞİ (ödeme alındı): " + shortages
              .map((s: any) => `${s.title || s.product_id} — gereken ${s.needed}, mevcut ${s.available}`)
              .join("; ");
            await (supabase as any).from("orders").update({ admin_note: note }).eq("id", order.id);
          }
        } catch (e) {
          console.error("[iyzico/callback] stok düşümü hatası:", e);
        }

        // Bildirim (non-blocking)
        Promise.allSettled([
          // Müşteri rolü + etiketler: ödeme işlenince veritabanı tetikleyicisi atar (20261015000001)
          import("@/lib/notifications").then(({ sendOrderNotification }) =>
            sendOrderNotification("order_placed", { orderId: order.id, userId: order.user_id })
          ),
          // Admin'e "yeni sipariş geldi" bildirimi (sonucu logla — teşhis için)
          import("@/lib/notifications").then(({ sendAdminNewOrderNotification }) =>
            sendAdminNewOrderNotification(order.id).then((r) => {
              if (r.status !== "sent") console.error("[admin-order-mail]", JSON.stringify(r));
              else console.log("[admin-order-mail] sent");
            })
          ),
          // Stoğu 0'a düşen ürün(ler) → admin'e "satış noktalarında kapat" uyarısı
          import("@/lib/notifications").then(({ alertOutOfStockForOrder }) =>
            alertOutOfStockForOrder(order.id)
          ),
          // Kupon kullanımını kaydet (supabase üzerinden)
          (async () => {
            const { data: ord } = await (supabase as any)
              .from("orders")
              .select("coupon_id, coupon_discount")
              .eq("id", order.id)
              .single();
            if (ord?.coupon_id) {
              const { data: coupon } = await supabase
                .from("coupons").select("used_count, per_user_limit").eq("id", ord.coupon_id).single();
              if (coupon) {
                await supabase.from("coupons").update({ used_count: coupon.used_count + 1 }).eq("id", ord.coupon_id);
                const { data: uc } = await supabase.from("user_coupons")
                  .select("id, use_count").eq("user_id", order.user_id).eq("coupon_id", ord.coupon_id).maybeSingle();
                if (uc) {
                  await supabase.from("user_coupons").update({
                    use_count: uc.use_count + 1, last_used_at: new Date().toISOString(), last_order_id: order.id,
                  }).eq("id", uc.id);
                } else {
                  await supabase.from("user_coupons").insert({
                    user_id: order.user_id, coupon_id: ord.coupon_id,
                    use_count: 1, last_used_at: new Date().toISOString(), last_order_id: order.id,
                  });
                }
              }
            }
          })(),
        ]).catch(() => {});

        // Misafir (şifresiz hesap) → "hesabını aktifleştir" e-postası (havale akışındaki gibi)
        (async () => {
          const { data: prof } = await (supabase as any)
            .from("profiles").select("email, first_name").eq("id", order.user_id).maybeSingle();
          if (!prof?.email) return;
          const { data: st } = await (supabase as any).rpc("account_password_state", { p_email: prof.email });
          if (st !== "passwordless") return;
          const { sendGuestActivationEmail, reportCustomerEmailFailure } = await import("@/lib/notifications");
          const r = await sendGuestActivationEmail({
            email: prof.email,
            name: prof.first_name ?? null,
            orderLabel: order.order_number ? `YH${order.order_number}` : null,
          });
          if (r.status !== "sent") {
            console.error("[guest-activation]", r.error);
            await reportCustomerEmailFailure({ orderId: order.id, email: prof.email, kind: "hesap aktivasyonu", reason: r.error });
          }
        })().catch((e) => console.error("[guest-activation]", e?.message || e));

        resolve(NextResponse.redirect(successUrl, 303));
      } else {
        // Sipariş zaten ödendi / iptal edildi (tekrar gelen dönüş) → dokunma
        if (order.payment_status !== "pending") {
          resolve(NextResponse.redirect(order.payment_status === "paid" ? successUrl : `${SITE_URL}/checkout?hatali=1`, 303));
          return;
        }
        // Ödeme başarısız / iptal → siparişi iptal et + rezerve stoğu iade et (F9)
        // + kullanılan YeriHisset Kredisi'ni cüzdana geri yükle
        await (supabase as any).rpc("restore_order_stock", { p_order_id: order.id });
        kickMarketplaceSync(); // stok değişti → pazaryerlerine (Trendyol) gönder
        await restoreOrderCredit(supabase, order.id);
        await (supabase as any)
          .from("orders")
          .update({ status: "cancelled", payment_status: "failed" })
          .eq("id", order.id);
        // Neden başarısız oldu → admin sipariş geçmişinde görür (müşteri ekranında genel mesaj)
        const reason = [result?.errorCode, result?.errorMessage].filter(Boolean).join(" — ") || paymentStatus || "bilinmiyor";
        await (supabase as any).from("order_events").insert({
          order_id: order.id, type: "note", note: `Kart ödemesi başarısız: ${reason}`,
        });

        resolve(NextResponse.redirect(`${SITE_URL}/checkout?hatali=1`, 303));
      }
    });
  });
}

// iyzico bazen GET ile de callback gönderebilir
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${SITE_URL}/checkout?hatali=1`, 303);

  const fakeReq = new NextRequest(req.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `token=${encodeURIComponent(token)}`,
  });
  return POST(fakeReq);
}
