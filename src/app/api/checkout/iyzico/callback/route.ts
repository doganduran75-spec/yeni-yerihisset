/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import { createAdminClient } from "@/lib/supabase-admin";
import { createIyzicoClient } from "@/lib/iyzico";
import { restoreOrderCredit } from "@/lib/store-credit";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yerihisset.com";

// Dönüş: yönlendirme yerine küçük bir sayfa. 3D Secure doğrulaması iyzico formunun içindeki bir çerçevede (iframe)
// tamamlanırsa 303 yönlendirmesi sonuç sayfasını o çerçevenin İÇİNDE açıyordu (beyaz ekran). Bu sayfa en üst
// pencereyi hedefe götürür; çerçeve yoksa aynı pencerede açar. Script çalışmazsa meta yenileme + bağlantı yedek.
// Başarısız dönüş adresi: neden = banka (banka / iyzico reddetti — mesajı gösterilir) · teknik (bizim tarafta sorun;
// para çekilmiş olabilir) · iptal (müşteri vazgeçti). Ödeme sayfası müşteriye net mesaj gösterir.
function failUrl(neden: "banka" | "teknik" | "iptal", mesaj?: string | null) {
  const q = new URLSearchParams({ hatali: "1", neden });
  if (mesaj) q.set("mesaj", String(mesaj).replace(/\s+/g, " ").slice(0, 140));
  return `${SITE_URL}/checkout?${q}`;
}

function go(url: string) {
  const u = JSON.stringify(url).replace(/</g, "\\u003c");
  const esc = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta http-equiv="refresh" content="2;url=${esc}"><title>Yönlendiriliyor…</title></head>`
    + `<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#3f6212">`
    + `<p>Ödeme sonucu açılıyor… <a href="${esc}" target="_top" style="color:#3f6212">devam</a></p>`
    + `<script>try{if(window.top&&window.top!==window.self){window.top.location.href=${u}}else{window.location.replace(${u})}}catch(e){window.location.replace(${u})}</script>`
    + `</body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// Dış sarmal: beklenmeyen bir hata 500 sayfası göstermesin — hata kaydedilir, müşteri ödeme sayfasına döner
// (para çekildiyse sipariş iyzico token'ı ile yeniden sorgulanabilir; ayrıntı pm2 loglarında "[iyzico/callback] HATA")
export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e: any) {
    console.error("[iyzico/callback] HATA:", e?.stack || e?.message || e);
    return go(failUrl("teknik"));
  }
}

async function handle(req: NextRequest) {
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
    return go(failUrl("iptal"));
  }

  const supabase = createAdminClient();
  const iyzipay = createIyzicoClient();

  return new Promise<NextResponse>((resolve) => {
    iyzipay.checkoutForm.retrieve({ locale: "tr", token }, async (err: any, result: any) => {
     try {
      if (err) {
        console.error("[iyzico/callback] retrieve error:", err);
        resolve(go(failUrl("teknik")));
        return;
      }

      // Teşhis: her dönüşte iyzico'nun cevabının özeti (kart bilgisi yok)
      console.log("[iyzico/callback] sonuç:", JSON.stringify({ status: result?.status, paymentStatus: result?.paymentStatus, errorCode: result?.errorCode, errorMessage: result?.errorMessage, conversationId: result?.conversationId, price: result?.paidPrice ?? result?.price }));
      const conversationId: string = result?.conversationId ?? "";
      const paymentStatus: string = result?.paymentStatus ?? "";
      const paymentId: string = result?.paymentId ?? "";

      // Siparişi bul: ödeme anahtarı (token — başlatmada siparişe yazılır) → sepet no (basketId = sipariş id) →
      // conversationId. (iyzico sonuç sorgusunda conversationId'yi yalnız istekte gönderilirse geri yollar → boş geliyordu)
      const cols = "id, user_id, total_amount, order_number, payment_status, status";
      let order: any = (await (supabase as any).from("orders").select(cols).eq("iyzico_token", token).maybeSingle()).data;
      if (!order && result?.basketId) order = (await (supabase as any).from("orders").select(cols).eq("id", String(result.basketId)).maybeSingle()).data;
      if (!order && conversationId) order = (await (supabase as any).from("orders").select(cols).eq("iyzico_conversation_id", conversationId).maybeSingle()).data;

      if (!order) {
        console.error("[iyzico/callback] sipariş bulunamadı:", JSON.stringify({ basketId: result?.basketId, conversationId, paymentStatus }));
        // Ödeme alınmış ama sipariş eşleşmemişse yöneticinin görmesi şart (Pano › Sistem › Hata alan müşteriler)
        await (supabase as any).from("client_errors").insert({ kind: "payment_unmatched", message: `iyzico ${paymentStatus || "?"} — sipariş bulunamadı (sepet ${result?.basketId || "?"}, ödeme no ${paymentId || "?"})`.slice(0, 300), path: "/checkout" });
        resolve(go(failUrl("teknik")));
        return;
      }

      const successUrl = `${SITE_URL}/siparis-tamam?id=${order.id}`;

      if (paymentStatus === "SUCCESS") {
        // Aynı ödeme için İKİNCİ dönüş (iyzico tekrarı / tarayıcı yenileme) → yan etki yok
        // (stok, kupon sayacı ve e-postalar iki kez işlenmesin)
        if (order.payment_status === "paid") {
          resolve(go(successUrl));
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
          // Meta Conversions API — satın alma (çerez onayı varsa; src/lib/meta-capi.ts)
          import("@/lib/meta-capi").then(({ sendMetaPurchaseFromOrder }) => sendMetaPurchaseFromOrder(order.id)),
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
          // Kupon kullanımını say (order_coupons; birden çok kupon — src/lib/coupon-rules.ts)
          import("@/lib/coupon-rules").then(({ countOrderCoupons }) => countOrderCoupons(supabase, order.id, order.user_id)),
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

        resolve(go(successUrl));
      } else {
        // Sipariş zaten ödendi / iptal edildi (tekrar gelen dönüş) → dokunma
        if (order.payment_status !== "pending") {
          resolve(go(order.payment_status === "paid" ? successUrl : failUrl("iptal")));
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
        // Pano › Sistem › "Hata alan müşteriler" (kart bilgisi yok, yalnız iyzico'nun gerekçesi)
        await (supabase as any).from("client_errors").insert({ kind: "payment_failed", message: String(reason).slice(0, 300), path: "/checkout", user_id: order.user_id ?? null, order_id: order.id });
        await (supabase as any).from("order_events").insert({
          order_id: order.id, type: "note", note: `Kart ödemesi başarısız: ${reason}`,
        });

        resolve(go(failUrl(result?.errorCode || result?.errorMessage ? "banka" : "iptal", result?.errorMessage)));
      }
     } catch (e: any) {
      console.error("[iyzico/callback] HATA (sonuç işlenirken):", e?.stack || e?.message || e);
      resolve(go(failUrl("teknik")));
     }
    });
  });
}

// iyzico bazen GET ile de callback gönderebilir
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return go(failUrl("iptal"));

  const fakeReq = new NextRequest(req.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `token=${encodeURIComponent(token)}`,
  });
  return POST(fakeReq);
}
