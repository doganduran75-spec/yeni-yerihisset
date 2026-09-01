import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createIyzicoClient } from "@/lib/iyzico";

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
        .select("id, user_id, total_amount")
        .eq("iyzico_conversation_id", conversationId)
        .single();

      if (!order) {
        console.error("[iyzico/callback] order not found for conversationId:", conversationId);
        resolve(NextResponse.redirect(`${SITE_URL}/checkout?hatali=1`, 303));
        return;
      }

      if (paymentStatus === "SUCCESS") {
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

        // ── STOK DÜŞÜMÜ (soft) ────────────────────────────────────────────────
        // Para çekildiği için siparişi ASLA reddetmiyoruz. Stok yetmezse (nadir
        // oversell yarışı) stok 0'a sabitlenir ve admin'e not düşülür.
        try {
          const { data: reduceRes } = await (supabase as any).rpc(
            "reduce_order_stock",
            { p_order_id: order.id, p_strict: false }
          );
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

        // Müşteri rolü ata + etiketler + bildirim (non-blocking)
        Promise.allSettled([
          import("@/lib/user-roles").then(({ assignRole }) => assignRole(order.user_id, "musteri")),
          import("@/lib/notifications").then(({ sendOrderNotification }) =>
            sendOrderNotification("order_placed", { orderId: order.id, userId: order.user_id })
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

        resolve(NextResponse.redirect(`${SITE_URL}/siparis-tamam?id=${order.id}`, 303));
      } else {
        // Ödeme başarısız / iptal
        await (supabase as any)
          .from("orders")
          .update({ status: "cancelled", payment_status: "failed" })
          .eq("id", order.id);

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
