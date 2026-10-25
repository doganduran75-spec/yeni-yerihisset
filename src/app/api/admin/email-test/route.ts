/* eslint-disable @typescript-eslint/no-explicit-any */
// E-POSTA DENEMESİ (canlı öncesi "bütün e-postaları dene" — kullanıcı isteği). Yalnız yönetici.
//   POST { kind, order? }  → o e-posta, seçilen siparişin (YH no / pazaryeri no; boşsa son site siparişi) GERÇEK verisiyle
//                            YALNIZ yöneticinin kendi adresine gider (src/lib/mail-guard.ts › runWithMailRedirect:
//                            konu "[DENEME → asıl alıcı]"). Müşteriye gitmez; bildirim kaydı / işaretler yazılmaz.
//   POST { list: true }    → deneme yapılabilecek e-postalar
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { runWithMailRedirect } from "@/lib/mail-guard";
import { sendOrderNotification, sendCouponAssignedNotification, renderEmailTemplate, sendEmailVerification, sendPasswordRecoveryEmail,
  sendGuestActivationEmail, sendStockNotifySignupWelcome, sendBackInStockNotification, sendLeadMagnetWelcome, escapeHtml } from "@/lib/notifications";
import { sendAltDeliveredEmail, sendReturnLabelEmail } from "@/lib/after-sale-mail";
import { sendInvoiceEmail } from "@/lib/invoice-mail";
import { sendClaimEmail, campaignEmailHtml } from "@/lib/crm-campaign";
import { sendRawSiteMail } from "@/lib/site-mail";
import { afterSaleUrl } from "@/lib/after-sale";

const KINDS: { kind: string; group: string; label: string; order?: boolean }[] = [
  { kind: "order_placed", group: "Sipariş", label: "Sipariş alındı", order: true },
  { kind: "order_paid", group: "Sipariş", label: "Ödeme onaylandı", order: true },
  { kind: "order_shipped", group: "Sipariş", label: "Kargoya verildi (takip no)", order: true },
  { kind: "order_delivered", group: "Sipariş", label: "Teslim edildi + “oldu mu?”", order: true },
  { kind: "order_cancelled", group: "Sipariş", label: "İptal edildi", order: true },
  { kind: "invoice", group: "Sipariş", label: "Fatura (PDF ekli)", order: true },
  { kind: "order_recovery", group: "Sipariş", label: "Yarım kalan sipariş (ertesi sabah)", order: true },
  { kind: "alt_delivered", group: "Değişim / iade", label: "Değişim — hangisi oldu?", order: true },
  { kind: "return_label", group: "Değişim / iade", label: "İade kargo kodu", order: true },
  { kind: "review_request", group: "Satış sonrası", label: "Yorum isteme (yıldızlı)", order: true },
  { kind: "winback", group: "Satış sonrası", label: "Seni özledik (kupon)" },
  { kind: "cart_abandonment", group: "Satış sonrası", label: "Sepet hatırlatma" },
  { kind: "coupon_assigned", group: "Kupon / kampanya", label: "Kupon tanımlandı" },
  { kind: "campaign", group: "Kupon / kampanya", label: "CRM kampanyası (kupon kutulu)" },
  { kind: "coupon_reminder", group: "Kupon / kampanya", label: "Kuponun bitmesine 3 gün" },
  { kind: "claim", group: "Kupon / kampanya", label: "Kuponu hesabına ekle (misafir)" },
  { kind: "lead_magnet", group: "Kupon / kampanya", label: "Ücretsiz kargo (e-posta karşılığı)" },
  { kind: "email_verify", group: "Üyelik", label: "E-posta onayı" },
  { kind: "password_recovery", group: "Üyelik", label: "Şifre sıfırlama" },
  { kind: "guest_activation", group: "Üyelik", label: "Misafir hesabı etkinleştir" },
  { kind: "stock_welcome", group: "Stok", label: "Stok bildirimi kaydı" },
  { kind: "back_in_stock", group: "Stok", label: "Stoğa girdi" },
];

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role, email, first_name").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as any;
  if (body.list) return NextResponse.json({ ok: true, kinds: KINDS, to: me.email });
  const k = KINDS.find((x) => x.kind === body.kind);
  if (!k) return NextResponse.json({ error: "Bilinmeyen e-posta türü" }, { status: 400 });
  const to = String(me.email || "");
  if (!to) return NextResponse.json({ error: "Yönetici hesabında e-posta yok" }, { status: 400 });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");
  const { data: st } = await sb.from("settings").select("store_name").limit(1).maybeSingle();
  const storeName = st?.store_name || "YeriHisset";

  // Sipariş: girilen no (YH24127 / pazaryeri no / kimlik) ya da son site siparişi
  let order: any = null;
  if (k.order) {
    const q = String(body.order || "").trim();
    const sel = "id, order_number, user_id, cargo_tracking_number, cargo_provider";
    if (!q) order = (await sb.from("orders").select(sel).eq("channel", "site").is("import_source", null).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
    else if (/^[0-9a-f-]{36}$/i.test(q)) order = (await sb.from("orders").select(sel).eq("id", q).maybeSingle()).data;
    else if (/^YH\d+$/i.test(q)) order = (await sb.from("orders").select(sel).eq("order_number", Number(q.slice(2))).maybeSingle()).data;
    else order = (await sb.from("orders").select(sel).eq("external_order_number", q).limit(1).maybeSingle()).data;
    if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  }
  const orderNo = order ? (order.order_number ? `YH${order.order_number}` : String(order.id).slice(0, 8).toUpperCase()) : "";
  const name = escapeHtml(me.first_name || "Merhaba");
  const sampleCoupon = { name: "Deneme kuponu", type: "percentage", amount: 10, min_order_amount: 0 };
  const in7 = new Date(Date.now() + 7 * 86400_000);
  const tplSend = async (trigger: string, vars: Record<string, string>) => {
    const tpl = await renderEmailTemplate(trigger, { store_url: site, store_name: storeName, ...vars });
    if (!tpl) return { status: "failed", error: `“${trigger}” şablonu kapalı ya da yok (CRM › E-posta şablonları)` };
    return sendRawSiteMail(to, tpl.subject, tpl.html);
  };

  const run = async (): Promise<any> => {
    switch (k.kind) {
      case "order_placed": case "order_paid": case "order_delivered": case "order_cancelled":
        return sendOrderNotification(k.kind as any, { orderId: order.id, userId: order.user_id });
      case "order_shipped": {
        const code = order.cargo_tracking_number || "DENEME123456";
        return sendOrderNotification("order_shipped", { orderId: order.id, userId: order.user_id, trackingNumber: order.cargo_provider ? `${code} (${order.cargo_provider})` : code });
      }
      case "invoice": return sendInvoiceEmail(sb, order.id);
      case "order_recovery": return tplSend("order_recovery", { customer_name: name, order_id: orderNo });
      case "alt_delivered": return sendAltDeliveredEmail(order.id);
      case "return_label": return sendReturnLabelEmail(order.id, "surat", "DENEME123", false);
      case "review_request": {
        const url = `${site}/yorum?t=deneme`;
        const stars = [1, 2, 3, 4, 5].map((n) => `<a href="${url}&amp;p=${n}" style="display:inline-block;font-size:36px;line-height:1;color:#f59e0b;text-decoration:none;margin:0 4px">★</a>`).join("");
        return tplSend("review_request", { customer_name: name, product_names: "ayakkabın", stars_html: stars });
      }
      case "winback": return tplSend("winback", { customer_name: name, coupon_code: "DENEME10", coupon_percent: "10", coupon_expires: in7.toLocaleDateString("tr-TR") });
      case "cart_abandonment": return tplSend("cart_abandonment", { customer_name: name, items_html: `<p style="font-size:15px;color:#374151">• Deneme ürünü — 42</p>` });
      case "coupon_assigned": {
        const { data: c } = await sb.from("coupons").select("id").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!c) return { status: "failed", error: "Aktif kupon yok" };
        return sendCouponAssignedNotification(user.id, c.id);
      }
      case "campaign":
        return sendRawSiteMail(to, `${storeName} — Sana özel %10 indirim (deneme)`, campaignEmailHtml({
          bodyHtml: "<p>Merhaba {{ad}},</p><p>Seni özledik! Sana özel bir indirim tanımladık.</p>", firstName: me.first_name,
          coupon: sampleCoupon, expires: in7, scope: "", slug: "deneme", storeName }));
      case "coupon_reminder": {
        // Gerçek görünüm: yöneticinin hesabındaki aktif kişiye özel kuponlar (yoksa örnek iki kupon)
        const { couponReminderHtml, scopeText: sc } = await import("@/lib/crm-campaign");
        const { buildEmailDocument } = await import("@/lib/notifications");
        const { data: ucs } = await sb.from("user_coupons").select("expires_at, coupons(name, type, amount, min_order_amount, expires_at, brand_ids, category_ids, is_active)").eq("user_id", user.id).limit(5);
        const list: any[] = [];
        for (const u of (ucs as any[]) || []) {
          const c = u.coupons;
          if (!c?.is_active) continue;
          list.push({ name: c.name, type: c.type, amount: Number(c.amount), min_order_amount: c.min_order_amount,
            expires_at: u.expires_at || c.expires_at || new Date(Date.now() + 3 * 86400_000).toISOString(), scope: await sc(sb, c.brand_ids, c.category_ids) });
        }
        if (!list.length) list.push(
          { name: "Seni özledik %10", type: "percentage", amount: 10, expires_at: new Date(Date.now() + 2 * 86400_000).toISOString() },
          { name: "Kasım kampanyası", type: "fixed", amount: 150, min_order_amount: 1500, expires_at: new Date(Date.now() + 3 * 86400_000).toISOString(), scope: "yalnız Dodura" });
        return sendRawSiteMail(to, `${storeName} — ${list.length > 1 ? `${list.length} kuponunun` : "kuponunun"} süresi doluyor`, buildEmailDocument(couponReminderHtml(me.first_name, list), storeName));
      }
      case "claim": return sendClaimEmail({ to, coupon: sampleCoupon, expires: in7.toISOString(), added: true, actionUrl: `${site}/sifre-belirle`, mode: "created" });
      case "lead_magnet": return sendLeadMagnetWelcome({ to, name: me.first_name, couponCode: "KARGOBEDAVA", couponValue: "Ücretsiz kargo", actionUrl: `${site}/sifre-belirle`, mode: "created" });
      case "email_verify": return sendEmailVerification({ to, name: me.first_name, verifyUrl: `${site}/eposta-onay?deneme=1` });
      case "password_recovery": return sendPasswordRecoveryEmail({ to, name: me.first_name, actionUrl: `${site}/sifre-belirle` });
      case "guest_activation": return sendGuestActivationEmail({ email: to, name: me.first_name, orderLabel: orderNo || "YH00000" });
      case "stock_welcome": return sendStockNotifySignupWelcome({ to, name: me.first_name, productTitle: "Deneme ürünü", productUrl: `${site}/magaza`, variantLabel: "42" });
      case "back_in_stock": return sendBackInStockNotification({ to, name: me.first_name, productTitle: "Deneme ürünü", productUrl: `${site}/magaza` });
    }
    return { status: "failed", error: "Desteklenmiyor" };
  };

  try {
    const r = await runWithMailRedirect(to, run);
    const okSent = r?.status === "sent" || r?.channel === "email" && r?.status === "sent";
    return NextResponse.json({ ok: okSent, to, status: r?.status, error: r?.error, order: orderNo || null, link: k.kind === "order_delivered" && order ? afterSaleUrl(order.id) : undefined });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
