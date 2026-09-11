import nodemailer from "nodemailer";
import { createAdminClient } from "./supabase-admin";
import { buildSmtpConfig } from "./smtp-config";

export type NotificationTrigger =
  | "order_placed"
  | "order_paid"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "admin_reply";

export interface NotificationContext {
  orderId: string;
  userId: string;
  trackingNumber?: string;
}

// --- Template rendering ---

function replaceVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/** href'lerdeki linklere UTM parametreleri ekler */
function addUtmTracking(html: string, campaign: string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (_, url: string) => {
    const separator = url.includes("?") ? "&" : "?";
    return `href="${url}${separator}utm_source=email&utm_medium=transactional&utm_campaign=${campaign}"`;
  });
}

/** Email ürün satırları HTML'i */
function buildOrderItemsHtml(
  items: Array<{ title: string; quantity: number; unit_price: number; variantLabel?: string | null; sku?: string | null }>
): string {
  if (!items.length) return "";
  const rows = items
    .map(
      (item) => {
      const meta = [item.variantLabel, item.sku ? `Stok Kodu: ${item.sku}` : ""].filter(Boolean).join(" · ");
      const metaHtml = meta ? `<div style="font-size:12px;color:#94a3b8;margin-top:3px;font-family:monospace">${meta}</div>` : "";
      return `
      <tr>
        <td style="padding:8px 12px;font-size:14px;color:#334155;border-bottom:1px solid #e2e8f0;">${item.title}${metaHtml}</td>
        <td style="padding:8px 12px;font-size:14px;color:#64748b;text-align:center;border-bottom:1px solid #e2e8f0;">${item.quantity}</td>
        <td style="padding:8px 12px;font-size:14px;color:#334155;text-align:right;border-bottom:1px solid #e2e8f0;">₺${(item.unit_price * item.quantity).toFixed(2)}</td>
      </tr>`;
    })
    .join("");
  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Ürün</th>
          <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.05em;">Adet</th>
          <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">Tutar</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Sipariş kalemlerini e-posta için zenginleştir: ürün başlığı + numara/varyant
 * (variantLabel) + stok kodu (sku). Embed'siz, ayrı sorgularla (self-host PostgREST).
 */
async function fetchOrderLineItems(
  supabase: any,
  orderId: string
): Promise<Array<{ title: string; quantity: number; unit_price: number; variantLabel: string | null; sku: string | null }>> {
  const { data: oiRows } = await supabase
    .from("order_items")
    .select("quantity, unit_price, product_id, variant_id")
    .eq("order_id", orderId);
  const oi = (oiRows as any[]) || [];
  if (!oi.length) return [];

  const productIds = [...new Set(oi.map((i) => i.product_id).filter(Boolean))];
  const variantIds = [...new Set(oi.map((i) => i.variant_id).filter(Boolean))];

  const titleMap = new Map<string, string>();
  if (productIds.length) {
    const { data: ps } = await supabase.from("products").select("id, title").in("id", productIds);
    for (const p of (ps as any[]) || []) titleMap.set(p.id, p.title ?? "Ürün");
  }

  const vMap = new Map<string, { sku: string | null; optId: string | null }>();
  if (variantIds.length) {
    const { data: vs } = await supabase.from("product_variants").select("id, sku, variant_option_id").in("id", variantIds);
    for (const v of (vs as any[]) || []) vMap.set(v.id, { sku: v.sku ?? null, optId: v.variant_option_id ?? null });
  }

  const optIds = [...new Set([...vMap.values()].map((v) => v.optId).filter(Boolean))];
  const optMap = new Map<string, string>();
  if (optIds.length) {
    const { data: opts } = await supabase.from("variant_options").select("id, value, variant_groups(name)").in("id", optIds);
    for (const o of (opts as any[]) || []) {
      const gn = o.variant_groups?.name;
      optMap.set(o.id, gn ? `${gn}: ${o.value}` : (o.value ?? ""));
    }
  }

  return oi.map((i) => {
    const v = i.variant_id ? vMap.get(i.variant_id) : null;
    return {
      title: titleMap.get(i.product_id) ?? "Ürün",
      quantity: i.quantity,
      unit_price: i.unit_price,
      variantLabel: v?.optId ? (optMap.get(v.optId) ?? null) : null,
      sku: v?.sku ?? null,
    };
  });
}

/** Tam email HTML dokümanı (wrapper) */
function buildEmailDocument(bodyHtml: string, storeName: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${storeName}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:#1d4ed8;padding:28px 40px;text-align:center;">
              <span style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-1px;">
                Yeri<span style="color:#93c5fd;">Hisset</span>
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px 0;color:#94a3b8;font-size:12px;">
                Bu e-posta <strong>${storeName}</strong> tarafından otomatik olarak gönderilmiştir.
              </p>
              <p style="margin:0;color:#cbd5e1;font-size:11px;">
                © ${new Date().getFullYear()} ${storeName}. Tüm hakları saklıdır.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * HTML gövdeyi düz metne çevirir (multipart text/plain alternatifi için).
 * HTML-only mailler spam filtresinde puan kaybeder; text alternatifi eklemek
 * teslim edilebilirliği artırır.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2: $1")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n").map((l) => l.trim()).filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n")
    .trim();
}

/**
 * Toplu/pazarlama maillerine List-Unsubscribe başlığı (Gmail/Yahoo toplu-gönderim
 * kuralları + itibar için). İşlemsel maillerde (sipariş/şifre) KULLANILMAZ.
 * Not: tam tek-tık abonelikten çıkış (URL + suppression listesi) go-live işi.
 */
function listUnsubHeader(settings: any): Record<string, string> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const addr = settings?.smtp_from_email || settings?.contact_email;
  return addr ? { "List-Unsubscribe": `<mailto:${addr}?subject=unsubscribe>` } : {};
}

/**
 * Teslimat adresini okunur HTML'e çevirir. Adres JSON string olarak saklanıyor
 * ({name, phone, address, district, city}); düz metinse aynen döner.
 */
function formatAddressHtml(raw: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!raw) return "";
  let a: any = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("{")) { try { a = JSON.parse(s); } catch { return s.replace(/\n/g, "<br>"); } }
    else return s.replace(/\n/g, "<br>");
  }
  const esc = (v: any) => String(v ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const line1 = [a.name].filter(Boolean).map(esc).join("");
  const line2 = esc(a.address);
  const line3 = [a.district, a.city].filter(Boolean).map(esc).join(" / ");
  const line4 = a.phone ? `Tel: ${esc(a.phone)}` : "";
  return [line1, line2, line3, line4].filter(Boolean).join("<br>");
}

// --- Ana fonksiyon ---

export async function sendOrderNotification(
  trigger: NotificationTrigger,
  context: NotificationContext
): Promise<{ channel: "email" | "push" | "skipped"; status: "sent" | "failed" | "skipped"; error?: string }> {
  const supabase = createAdminClient();

  // 1. Sipariş + ilişkileri EMBED'SİZ getir (self-host PostgREST embed kırılgan)
  const { data: order, error: orderError } = await (supabase
    .from("orders")
    .select("id, order_number, total_amount, status, created_at, shipping_address, payment_method, user_id")
    .eq("id", context.orderId)
    .maybeSingle() as any) as { data: any; error: any };

  if (orderError || !order) {
    return { channel: "skipped", status: "failed", error: "Sipariş bulunamadı" };
  }

  // Müşteri (profil)
  const uid = order.user_id || context.userId;
  let profile: any = null;
  if (uid) {
    const { data: p } = await (supabase as any).from("profiles")
      .select("first_name, last_name, email").eq("id", uid).maybeSingle();
    profile = p ?? null;
  }
  const customerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Değerli Müşterimiz";
  const customerEmail = profile?.email;

  // Kalemler + ürün başlığı + numara/varyant + stok kodu (ayrı sorgularla)
  const orderItems = await fetchOrderLineItems(supabase, context.orderId);

  // 2. Mağaza ayarlarını getir (SMTP + GA + mağaza adı + ödeme bilgileri)
  const { data: settings } = await (supabase.from("settings").select("*").single() as any) as { data: any };
  const storeName = settings?.store_name || "YeriHisset";
  const storeEmail = settings?.contact_email || "";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

  // 3. Push token var mı?
  const { data: pushToken } = await supabase
    .from("push_tokens")
    .select("token, platform")
    .eq("user_id", context.userId)
    .limit(1)
    .single();

  // 4. Değişkenler (şablon olsa da olmasa da lazım). Sipariş no: YH<sayı>.
  const shortId = (order as any).order_number ? `YH${(order as any).order_number}` : order.id.slice(0, 8).toUpperCase();
  const trackingHtml = context.trackingNumber
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:0 0 24px 0;">
         <p style="margin:0 0 4px 0;color:#1e40af;font-size:13px;font-weight:700;">🚚 Kargo Takip No</p>
         <p style="margin:0;color:#1d4ed8;font-size:16px;font-weight:700;">${context.trackingNumber}</p>
       </div>`
    : "";

  // Havale/EFT siparişlerinde banka bilgisi bloğu (KRİTİK)
  const isBankTransfer = (order as any).payment_method === "bank_transfer";
  const bankInfo: string = settings?.bank_transfer_info ?? "";
  const bankInfoHtml =
    isBankTransfer && bankInfo
      ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:0 0 24px 0;">
           <p style="margin:0 0 8px 0;color:#92400e;font-size:13px;font-weight:700;">🏦 Havale / EFT Banka Bilgileri</p>
           <pre style="margin:0;color:#78350f;font-size:13px;font-family:monospace;white-space:pre-wrap;">${bankInfo}</pre>
           <p style="margin:12px 0 0 0;color:#92400e;font-size:12px;">Açıklama kısmına sipariş numaranızı (<strong>${shortId}</strong>) yazmayı unutmayın.</p>
         </div>`
      : "";

  const addressHtml = formatAddressHtml((order as any).shipping_address);

  const vars: Record<string, string> = {
    customer_name: customerName,
    order_id: shortId,
    order_date: new Date(order.created_at).toLocaleDateString("tr-TR"),
    order_total: `₺${Number(order.total_amount).toFixed(2)}`,
    order_items_html: buildOrderItemsHtml(orderItems),
    shipping_address: addressHtml,
    tracking_html: trackingHtml,
    bank_info_html: bankInfoHtml,
    store_name: storeName,
    store_email: storeEmail,
    store_url: storeUrl,
  };

  // 5. Şablon getir — varsa kullan; YOKSA/PASİFSE yerleşik varsayılan
  // (özellikle havale sipariş onayı banka bilgisiyle GARANTİ gitsin).
  const { data: template } = await supabase
    .from("email_templates")
    .select("subject, body_html, is_active")
    .eq("trigger", trigger)
    .maybeSingle();

  let subject: string;
  let bodyHtml: string;
  if (template?.is_active) {
    subject = replaceVariables(template.subject, vars);
    bodyHtml = addUtmTracking(replaceVariables(template.body_html, vars), trigger);
  } else {
    const addrBlock = addressHtml
      ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 20px;font-size:13px;color:#475569"><b>Teslimat Adresi</b><br>${addressHtml}</div>`
      : "";
    const intro = trigger === "order_placed"
      ? (isBankTransfer
          ? "Siparişini aldık! Aşağıdaki banka bilgileriyle havale/EFT ödemeni yaptıktan sonra siparişini hazırlayıp kargoya vereceğiz."
          : "Siparişini aldık! En kısa sürede hazırlayıp kargoya vereceğiz.")
      : "Sipariş durumun güncellendi.";
    subject = `${storeName} — Siparişiniz alındı ${shortId}`;
    bodyHtml = `
      <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 12px">Siparişiniz alındı 🎉</h1>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 8px">Merhaba ${customerName}, ${intro}</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px">Sipariş No: <b>${shortId}</b> · Toplam: <b style="color:#166534">₺${Number(order.total_amount).toFixed(2)}</b></p>
      ${buildOrderItemsHtml(orderItems)}
      ${bankInfoHtml}
      ${addrBlock}
      ${trackingHtml}`;
  }

  // Havale sipariş onayında banka bilgisi GARANTİ: şablon {{bank_info_html}}
  // içermiyorsa (metinde blok yoksa) sona ekle — müşteri ödeme bilgisini alsın.
  if (trigger === "order_placed" && isBankTransfer && bankInfoHtml && !bodyHtml.includes("Havale / EFT Banka Bilgileri")) {
    bodyHtml += `
      <p style="font-size:14px;color:#374151;margin:20px 0 8px"><b>Ödemeni tamamlamak için</b> aşağıdaki hesaba havale/EFT yapabilirsin. Ödemen onaylanınca siparişin hazırlanır.</p>
      ${bankInfoHtml}`;
  }

  // --- Push bildirimi ---
  if (pushToken?.token) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          to: pushToken.token,
          title: subject,
          body: `Sipariş ${shortId}`,
          data: { orderId: context.orderId, trigger },
        }),
      });

      if (!res.ok) throw new Error(`Expo push hatası: ${res.status}`);

      await logNotification(supabase, { ...context, trigger, channel: "push", status: "sent", recipient: pushToken.token });
      return { channel: "push", status: "sent" };
    } catch (err: any) {
      // Push başarısız → email'e düş
      console.error("Push notification failed, falling back to email:", err);
    }
  }

  // --- Email gönderimi ---
  if (!customerEmail) {
    await logNotification(supabase, { ...context, trigger, channel: "skipped", status: "skipped", recipient: "" });
    return { channel: "skipped", status: "skipped" };
  }

  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "",
    smtp_port: settings?.smtp_port,
    smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user,
    smtp_password: settings?.smtp_password,
  });

  if (!smtpConfig.host || !smtpConfig.auth.user) {
    await logNotification(supabase, { ...context, trigger, channel: "email", status: "failed", recipient: customerEmail, error: "SMTP ayarları eksik" });
    return { channel: "email", status: "failed", error: "SMTP ayarları yapılandırılmamış" };
  }

  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to: customerEmail,
      subject,
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
    });

    await logNotification(supabase, { ...context, trigger, channel: "email", status: "sent", recipient: customerEmail });
    return { channel: "email", status: "sent" };
  } catch (err: any) {
    const error = err?.message || "Bilinmeyen hata";
    await logNotification(supabase, { ...context, trigger, channel: "email", status: "failed", recipient: customerEmail, error });
    return { channel: "email", status: "failed", error };
  }
}

async function logNotification(
  supabase: ReturnType<typeof createAdminClient>,
  data: {
    orderId: string;
    userId: string;
    trigger: string;
    channel: string;
    status: string;
    recipient: string;
    error?: string;
  }
) {
  await supabase.from("notification_log").insert({
    order_id: data.orderId,
    user_id: data.userId,
    trigger: data.trigger,
    channel: data.channel,
    status: data.status,
    recipient: data.recipient,
    error_message: data.error ?? null,
  });
}

/** Bir üyeye kupon atandığında "Yeni Kupon Tanımlandı" e-postası gönderir */
export async function sendCouponAssignedNotification(
  userId: string,
  couponId: string
): Promise<{ status: "sent" | "failed" | "skipped"; error?: string }> {
  const supabase = createAdminClient();

  const [{ data: profile }, { data: coupon }, { data: settings }, { data: template }] = await Promise.all([
    (supabase as any).from("profiles").select("first_name, last_name, email").eq("id", userId).maybeSingle(),
    (supabase as any).from("coupons").select("*").eq("id", couponId).maybeSingle(),
    (supabase as any).from("settings").select("*").limit(1).maybeSingle(),
    (supabase as any).from("email_templates").select("subject, body_html, is_active").eq("trigger", "coupon_assigned").maybeSingle(),
  ]);

  if (!profile?.email) return { status: "skipped", error: "Üye e-postası yok" };
  if (!coupon) return { status: "failed", error: "Kupon bulunamadı" };
  if (!template?.is_active) return { status: "skipped", error: "coupon_assigned şablonu pasif/yok" };

  const storeName = settings?.store_name || "YeriHisset";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  const customerName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Değerli Müşterimiz";

  const couponValue =
    coupon.type === "percentage" ? `%${coupon.amount} indirim`
      : coupon.type === "fixed" ? `₺${Number(coupon.amount).toFixed(2)} indirim`
      : coupon.type === "free_shipping" ? "Ücretsiz kargo"
      : "";

  const vars: Record<string, string> = {
    customer_name: customerName,
    coupon_code: coupon.code || "",
    coupon_name: coupon.name || "",
    coupon_description: coupon.description || "",
    coupon_value: couponValue,
    coupon_expires: coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString("tr-TR") : "",
    store_name: storeName,
    store_url: storeUrl,
  };

  const subject = replaceVariables(template.subject, vars);
  let bodyHtml = replaceVariables(template.body_html, vars);
  bodyHtml = addUtmTracking(bodyHtml, "coupon_assigned");

  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "",
    smtp_port: settings?.smtp_port,
    smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user,
    smtp_password: settings?.smtp_password,
  });
  if (!smtpConfig.host || !smtpConfig.auth.user) return { status: "failed", error: "SMTP ayarları eksik" };

  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to: profile.email,
      subject,
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
      headers: listUnsubHeader(settings),
    });
    return { status: "sent" };
  } catch (err: unknown) {
    return { status: "failed", error: err instanceof Error ? err.message : "Email gönderim hatası" };
  }
}

/** Admin cevabını müşteriye e-posta ile bildirir */
export async function sendAdminReplyNotification(
  userId: string,
  replyContent: string
): Promise<{ status: "sent" | "failed"; error?: string }> {
  const supabase = createAdminClient();

  // 1. Kullanıcı ve Mağaza ayarlarını getir
  const [userProfile, storeSettings] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name, email").eq("id", userId).single(),
    supabase.from("settings").select("*").single()
  ]);

  const profile = userProfile.data;
  const settings = storeSettings.data;

  if (!profile?.email) return { status: "failed", error: "Kullanıcı e-posta adresi bulunamadı" };

  const storeName = settings?.store_name || "YeriHisset";
  const customerName = profile.first_name || "Değerli Müşterimiz";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

  // 2. Email içeriğini oluştur
  const subject = `[${storeName}] Destek Ekibinden Yeni Mesaj`;
  const bodyHtml = `
    <div style="color: #334155;">
      <h2 style="color: #1d4ed8; margin-bottom: 24px;">Yeni Bir Mesajınız Var</h2>
      <p>Merhaba <strong>${customerName}</strong>,</p>
      <p>Destek ekibimiz bir mesajınızı yanıtladı:</p>
      
      <div style="background: #f1f5f9; padding: 20px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #1d4ed8; font-style: italic;">
        "${replyContent}"
      </div>
      
      <p style="margin-bottom: 32px;">Mesajın tamamını görmek ve cevap yazmak için hesabınıza giriş yapabilirsiniz.</p>
      
      <div style="text-align: center;">
        <a href="${storeUrl}/account?tab=messages" style="display: inline-block; background: #1d4ed8; color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">Mesajlarımı Görüntüle</a>
      </div>
      
      <p style="margin-top: 40px; font-size: 13px; color: #64748b;">
        Sorularınız için bu e-postayı yanıtlayabilir veya <a href="${storeUrl}" style="color: #1d4ed8;">sitemiz</a> üzerinden bize ulaşabilirsiniz.
      </p>
    </div>
  `;

  // 3. SMTP konfigürasyonu
  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "",
    smtp_port: settings?.smtp_port,
    smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user,
    smtp_password: settings?.smtp_password,
  });

  if (!smtpConfig.host || !smtpConfig.auth.user) {
    return { status: "failed", error: "SMTP ayarları yapılandırılmamış" };
  }

  // 4. Gönderim
  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to: profile.email,
      subject,
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
    });

    return { status: "sent" };
  } catch (err: any) {
    return { status: "failed", error: err?.message || "Email gönderim hatası" };
  }
}

/**
 * Lead-magnet (Fırsat) e-postası: kupon + şifre belirleme bağlantısı.
 * mode 'created' → yeni şifresiz üye (set-password linki gönderilir)
 * mode 'existing' → zaten üye (giriş linki + kupon hesabında bilgisi)
 */
export async function sendLeadMagnetWelcome(params: {
  to: string;
  name?: string | null;
  couponCode?: string | null;
  couponValue?: string | null;
  actionUrl?: string | null; // set-password veya giriş linki
  mode: "created" | "existing";
}): Promise<{ status: "sent" | "failed" | "skipped"; error?: string }> {
  const supabase = createAdminClient();
  const { data: settings } = await (supabase as any).from("settings").select("*").limit(1).maybeSingle();
  const storeName = settings?.store_name || "YeriHisset";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  const name = (params.name || "").trim() || "Merhaba";

  const couponBlock = params.couponCode
    ? `<div style="margin:24px 0;padding:20px;border:2px dashed #6b7f3a;border-radius:16px;text-align:center;background:#f7f9f0">
         <p style="margin:0 0 6px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Kupon Kodunuz</p>
         <p style="margin:0;font-size:26px;font-weight:800;letter-spacing:4px;color:#4d5e2a">${params.couponCode}</p>
         ${params.couponValue ? `<p style="margin:8px 0 0;font-size:14px;color:#6b7f3a;font-weight:700">${params.couponValue}</p>` : ""}
       </div>`
    : "";

  const cta = params.actionUrl
    ? `<div style="text-align:center;margin:28px 0">
         <a href="${params.actionUrl}" style="display:inline-block;background:#6b7f3a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:14px;font-weight:800;font-size:15px">
           ${params.mode === "created" ? "Şifremi Belirle ve Giriş Yap" : "Giriş Yap"}
         </a>
       </div>`
    : "";

  const intro = params.mode === "created"
    ? `Tebrikler ${name}! Ücretsiz kargo fırsatın hesabına tanımlandı. Kullanmak için tek yapman gereken şifreni belirleyip giriş yapmak.`
    : `Merhaba ${name}, bu e-posta zaten kayıtlı. Ücretsiz kargo kuponun hesabına tanımlandı — giriş yapıp alışverişte kullanabilirsin.`;

  const bodyHtml = `
    <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 12px">🎉 Ücretsiz Kargo Senin Oldu!</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 8px">${intro}</p>
    ${couponBlock}
    ${cta}
    <p style="font-size:13px;color:#9ca3af;line-height:1.6;margin:16px 0 0">
      Bu e-postayı ${storeName} kampanyasına e-posta adresini bıraktığın için aldın.
    </p>`;

  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "",
    smtp_port: settings?.smtp_port,
    smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user,
    smtp_password: settings?.smtp_password,
  });
  if (!smtpConfig.host || !smtpConfig.auth.user) return { status: "failed", error: "SMTP ayarları eksik" };

  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to: params.to,
      subject: "Ücretsiz kargo kuponunuz hazır 🎁",
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
      headers: listUnsubHeader(settings),
    });
    return { status: "sent" };
  } catch (err: any) {
    return { status: "failed", error: err?.message || "Email gönderim hatası" };
  }
}

/**
 * ADMIN'e "Stok 0 oldu" uyarısı — bir ürün/varyant satışla 0'a düşünce, satış
 * noktaları entegrasyonu gelene kadar admin ELDEN kapatabilsin diye.
 */
export async function sendAdminOutOfStockAlert(
  items: Array<{ title: string; variantLabel?: string | null; sku?: string | null; barcode?: string | null }>
): Promise<{ status: "sent" | "failed" | "skipped"; error?: string }> {
  if (!items.length) return { status: "skipped" };
  const supabase = createAdminClient();
  const { data: settings } = await (supabase.from("settings").select("*").limit(1).maybeSingle() as any) as { data: any };
  const storeName = settings?.store_name || "YeriHisset";
  const to = settings?.admin_notify_email || settings?.contact_email || settings?.smtp_from_email || settings?.smtp_user;
  if (!to) return { status: "skipped", error: "Admin e-posta adresi ayarlı değil" };

  const rows = items.map((i) => {
    const label = [i.title, i.variantLabel].filter(Boolean).join(" · ");
    const sku = i.sku ? ` <span style="font-family:monospace;color:#94a3b8">(${i.sku})</span>` : "";
    const barcode = i.barcode ? `<div style="font-size:12px;color:#94a3b8;font-family:monospace;margin-top:2px">Barkod: ${i.barcode}</div>` : "";
    return `<li style="margin:0 0 8px;font-size:14px;color:#334155"><b>${label}</b>${sku}${barcode}</li>`;
  }).join("");

  const bodyHtml = `
    <h1 style="font-size:22px;font-weight:800;color:#b91c1c;margin:0 0 12px">⚠️ Stok 0 oldu</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px">
      Aşağıdaki ürün(ler) son satışla <b>tükendi</b>. Satış noktalarında (Trendyol, Instagram vb.)
      <b>ürünü kapatmayı</b> unutma — aksi halde olmayan stoktan sipariş gelebilir.
    </p>
    <ul style="margin:0 0 16px;padding-left:20px">${rows}</ul>
    <p style="font-size:13px;color:#9ca3af;margin:0">Stok girişi yaptığında bekleyenlere otomatik "stok geldi" e-postası gider.</p>`;

  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "", smtp_port: settings?.smtp_port, smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user, smtp_password: settings?.smtp_password,
  });
  if (!smtpConfig.host || !smtpConfig.auth.user) return { status: "failed", error: "SMTP ayarları eksik" };

  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to,
      subject: `⚠️ Stok 0 — ${items.length} ürün tükendi, satış noktalarında kapat`,
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
    });
    return { status: "sent" };
  } catch (err: any) {
    return { status: "failed", error: err?.message || "Email gönderim hatası" };
  }
}

/**
 * Bir siparişin kalemlerinden stoğu 0'a düşenleri bulup admin'e uyarı gönderir.
 * reduce_order_stock çağrıldıktan SONRA çağrılmalı (stok güncel).
 */
export async function alertOutOfStockForOrder(orderId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: oi } = await (supabase as any).from("order_items")
    .select("product_id, variant_id").eq("order_id", orderId);
  const items = (oi as any[]) || [];
  if (!items.length) return;

  const out: Array<{ title: string; variantLabel?: string | null; sku?: string | null; barcode?: string | null }> = [];

  const variantIds = [...new Set(items.filter((i) => i.variant_id).map((i) => i.variant_id))];
  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];

  // Ürün başlıkları (tüm kalemler için)
  const titleMap = new Map<string, string>();
  if (productIds.length) {
    const { data: ps } = await (supabase as any).from("products").select("id, title, stock").in("id", productIds);
    for (const p of (ps as any[]) || []) {
      titleMap.set(p.id, p.title ?? "Ürün");
      // Varyantsız ürün: stoğu 0 ise ekle
      if (items.some((i) => i.product_id === p.id && !i.variant_id) && Number(p.stock ?? 0) <= 0) {
        out.push({ title: p.title ?? "Ürün", variantLabel: null, sku: null });
      }
    }
  }

  if (variantIds.length) {
    // Varyantlar (embed'siz) — stok 0 olanları bul
    const { data: vs } = await (supabase as any).from("product_variants")
      .select("id, stock, sku, barcode, product_id, variant_option_id").in("id", variantIds);
    const zeroVs = ((vs as any[]) || []).filter((v) => Number(v.stock ?? 0) <= 0);
    // Varyant değer + grup adı ayrı çek
    const optIds = [...new Set(zeroVs.map((v) => v.variant_option_id).filter(Boolean))];
    const optMap = new Map<string, string>();
    if (optIds.length) {
      const { data: opts } = await (supabase as any).from("variant_options")
        .select("id, value, variant_groups(name)").in("id", optIds);
      for (const o of (opts as any[]) || []) {
        const gn = o.variant_groups?.name; // tek seviye embed genelde çalışır; yoksa değer yeterli
        optMap.set(o.id, gn ? `${gn}: ${o.value}` : (o.value ?? ""));
      }
    }
    for (const v of zeroVs) {
      out.push({ title: titleMap.get(v.product_id) ?? "Ürün", variantLabel: optMap.get(v.variant_option_id) ?? null, sku: v.sku, barcode: v.barcode ?? null });
    }
  }

  if (out.length) await sendAdminOutOfStockAlert(out);
}

/**
 * ADMIN'e "Yeni Sipariş" bildirimi — sipariş oluşunca mağaza sahibine gider.
 * Alıcı: settings.admin_notify_email varsa o, yoksa settings.contact_email.
 * İşlemseldir (abonelik çıkışı yok). Müşteriye giden order_placed'den ayrıdır.
 */
export async function sendAdminNewOrderNotification(
  orderId: string
): Promise<{ status: "sent" | "failed" | "skipped"; error?: string }> {
  const supabase = createAdminClient();

  // EMBED YOK — self-host PostgREST embed'leri kırılgan; ilişkileri ayrı çek.
  const { data: order } = await (supabase
    .from("orders")
    .select("id, order_number, total_amount, status, created_at, shipping_address, payment_method, user_id")
    .eq("id", orderId)
    .maybeSingle() as any) as { data: any };

  if (!order) return { status: "skipped", error: "Sipariş bulunamadı" };

  const { data: settings } = await (supabase.from("settings").select("*").limit(1).maybeSingle() as any) as { data: any };
  const storeName = settings?.store_name || "YeriHisset";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  const to = settings?.admin_notify_email || settings?.contact_email || settings?.smtp_from_email || settings?.smtp_user;
  if (!to) return { status: "skipped", error: "Admin e-posta adresi ayarlı değil" };

  // Müşteri (profil)
  let profile: any = null;
  if (order.user_id) {
    const { data: p } = await (supabase as any).from("profiles")
      .select("first_name, last_name, email, phone").eq("id", order.user_id).maybeSingle();
    profile = p ?? null;
  }
  const customerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "—";

  // Sipariş kalemleri + ürün başlığı + numara/varyant + stok kodu (ayrı sorgularla)
  const items = await fetchOrderLineItems(supabase, orderId);
  const shortId = (order as any).order_number ? `YH${(order as any).order_number}` : order.id.slice(0, 8).toUpperCase();
  const payLabel = order.payment_method === "bank_transfer" ? "Havale/EFT" : "Kart (iyzico)";

  const bodyHtml = `
    <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 12px">🛒 Yeni Sipariş — ${shortId}</h1>
    <table style="width:100%;font-size:14px;color:#374151;margin:0 0 16px">
      <tr><td style="padding:3px 0;color:#6b7280">Müşteri</td><td style="padding:3px 0;font-weight:700">${customerName}</td></tr>
      <tr><td style="padding:3px 0;color:#6b7280">E-posta</td><td style="padding:3px 0">${profile?.email ?? "—"}</td></tr>
      <tr><td style="padding:3px 0;color:#6b7280">Telefon</td><td style="padding:3px 0">${profile?.phone ?? "—"}</td></tr>
      <tr><td style="padding:3px 0;color:#6b7280">Ödeme</td><td style="padding:3px 0;font-weight:700">${payLabel}</td></tr>
      <tr><td style="padding:3px 0;color:#6b7280">Tutar</td><td style="padding:3px 0;font-weight:800;color:#166534">₺${Number(order.total_amount).toFixed(2)}</td></tr>
    </table>
    ${buildOrderItemsHtml(items)}
    ${formatAddressHtml(order.shipping_address) ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;color:#475569"><b>Teslimat:</b><br>${formatAddressHtml(order.shipping_address)}</div>` : ""}
    <div style="text-align:center;margin:8px 0 0">
      <a href="${storeUrl}/admin/orders" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:800;font-size:14px">Siparişi Yönet</a>
    </div>`;

  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "",
    smtp_port: settings?.smtp_port,
    smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user,
    smtp_password: settings?.smtp_password,
  });
  if (!smtpConfig.host || !smtpConfig.auth.user) return { status: "failed", error: "SMTP ayarları eksik" };

  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to,
      subject: `🛒 Yeni Sipariş ${shortId} — ₺${Number(order.total_amount).toFixed(2)} (${payLabel})`,
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
    });
    return { status: "sent" };
  } catch (err: any) {
    return { status: "failed", error: err?.message || "Email gönderim hatası" };
  }
}

/**
 * E-posta doğrulama (onay) e-postası — app SMTP ile. Kendi token'ımızla
 * çalışır (GoTrue'ya bağlı değil). Link tıklanınca profiles.email_verified true.
 */
export async function sendEmailVerification(params: {
  to: string;
  name?: string | null;
  verifyUrl: string;
}): Promise<{ status: "sent" | "failed"; error?: string }> {
  const supabase = createAdminClient();
  const { data: settings } = await (supabase as any).from("settings").select("*").limit(1).maybeSingle();
  const storeName = settings?.store_name || "YeriHisset";
  const name = (params.name || "").trim() || "Merhaba";

  const bodyHtml = `
    <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 12px">E-postanı Onayla</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 8px">
      ${name}, ${storeName} hesabın oluşturuldu. Sipariş ve kargo bildirimlerini doğru adresine iletebilmemiz için e-postanı onaylaman yeterli.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${params.verifyUrl}" style="display:inline-block;background:#6b7f3a;color:#fff;text-decoration:none;padding:14px 34px;border-radius:14px;font-weight:800;font-size:15px">
        E-postamı Onayla
      </a>
    </div>
    <p style="font-size:13px;color:#9ca3af;line-height:1.6;margin:16px 0 0">
      Alışverişe devam etmek için onay şart değil; istediğin zaman onaylayabilirsin. Bu hesabı sen oluşturmadıysan bu e-postayı yok say.
    </p>`;

  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "",
    smtp_port: settings?.smtp_port,
    smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user,
    smtp_password: settings?.smtp_password,
  });
  if (!smtpConfig.host || !smtpConfig.auth.user) return { status: "failed", error: "SMTP ayarları eksik" };

  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to: params.to,
      subject: `${storeName} — E-postanı onayla`,
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
    });
    return { status: "sent" };
  } catch (err: any) {
    return { status: "failed", error: err?.message || "Email gönderim hatası" };
  }
}

/**
 * Şifre sıfırlama e-postası — uygulama SMTP'si (nodemailer) ile gönderilir.
 * GoTrue'nun kendi SMTP'sine (auth/v1/recover) bağımlı DEĞİL; recovery linki
 * admin.generateLink ile üretilir, markalı e-postayla bu fonksiyon gönderir.
 */
export async function sendPasswordRecoveryEmail(params: {
  to: string;
  name?: string | null;
  actionUrl: string;
}): Promise<{ status: "sent" | "failed"; error?: string }> {
  const supabase = createAdminClient();
  const { data: settings } = await (supabase as any).from("settings").select("*").limit(1).maybeSingle();
  const storeName = settings?.store_name || "YeriHisset";
  const name = (params.name || "").trim() || "Merhaba";

  const bodyHtml = `
    <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 12px">Şifre Sıfırlama</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 8px">
      Merhaba ${name}, hesabın için şifre sıfırlama talebi aldık. Yeni şifreni oluşturmak için aşağıdaki butona tıklaman yeterli.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${params.actionUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:14px 36px;border-radius:14px;font-weight:800;font-size:15px">
        Yeni Şifre Oluştur
      </a>
    </div>
    <p style="font-size:13px;color:#9ca3af;line-height:1.6;margin:16px 0 0">
      Bu talebi sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez. Güvenliğin için bu bağlantı kısa süre sonra geçerliliğini yitirir.
    </p>`;

  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "",
    smtp_port: settings?.smtp_port,
    smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user,
    smtp_password: settings?.smtp_password,
  });
  if (!smtpConfig.host || !smtpConfig.auth.user) return { status: "failed", error: "SMTP ayarları eksik" };

  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to: params.to,
      subject: `${storeName} — Şifre sıfırlama bağlantın`,
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
    });
    return { status: "sent" };
  } catch (err: any) {
    return { status: "failed", error: err?.message || "Email gönderim hatası" };
  }
}

/**
 * Stok bildirimi KAYIT ONAYI — kişi ilk kez "stok gelince haber ver" deyip
 * e-posta bırakınca ANINDA gider. Ürün fotosu + kısa barefoot tanıtımı +
 * "listemize kaydoldunuz" mesajı. (Stok gelince giden bildirimden ayrıdır.)
 */
export async function sendStockNotifySignupWelcome(params: {
  to: string;
  name?: string | null;
  productTitle: string;
  productUrl: string;
  productImage?: string | null;
  variantLabel?: string | null;
}): Promise<{ status: "sent" | "failed"; error?: string }> {
  const supabase = createAdminClient();
  const { data: settings } = await (supabase as any).from("settings").select("*").limit(1).maybeSingle();
  const storeName = settings?.store_name || "YeriHisset";
  const name = (params.name || "").trim() || "Merhaba";
  const forWhat = params.variantLabel
    ? `<b>${params.productTitle}</b> (${params.variantLabel})`
    : `<b>${params.productTitle}</b>`;

  const imageBlock = params.productImage
    ? `<div style="text-align:center;margin:8px 0 20px">
         <img src="${params.productImage}" alt="${params.productTitle}" width="260"
           style="max-width:260px;width:100%;border-radius:16px;border:1px solid #eef1e6" />
       </div>`
    : "";

  const bodyHtml = `
    <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 12px">Listemize kaydoldunuz 🌱</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px">
      ${name}, ${forWhat} için stok bildirimi talebinizi aldık. Ürün <b>stoğa girer girmez ilk siz haberdar olacaksınız</b> — kaçırmazsınız.
    </p>
    ${imageBlock}
    <div style="background:#f7f9f0;border:1px solid #e6ecd3;border-radius:16px;padding:16px 18px;margin:0 0 8px">
      <p style="font-size:14px;color:#4d5e2a;font-weight:800;margin:0 0 6px">Barefoot (çıplak ayak) nedir?</p>
      <p style="font-size:13px;color:#5b6b3a;line-height:1.6;margin:0">
        Geniş burun, sıfır topuk farkı ve esnek ince taban ile ayağın doğal hareketini destekleyen ayakkabılardır.
        Ayak parmakları rahatça yayılır, duruş ve denge güçlenir — âdeta yalınayak yürüyormuş hissi verir.
      </p>
    </div>
    <div style="text-align:center;margin:24px 0 6px">
      <a href="${params.productUrl}" style="display:inline-block;background:#6b7f3a;color:#fff;text-decoration:none;padding:13px 30px;border-radius:14px;font-weight:800;font-size:15px">
        Ürünü İncele
      </a>
    </div>
    <p style="font-size:13px;color:#9ca3af;line-height:1.6;margin:16px 0 0">
      Bu e-postayı, ${storeName}'te bu ürün için "stok gelince haber ver" talebinde bulunduğunuz için aldınız.
    </p>`;

  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "",
    smtp_port: settings?.smtp_port,
    smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user,
    smtp_password: settings?.smtp_password,
  });
  if (!smtpConfig.host || !smtpConfig.auth.user) return { status: "failed", error: "SMTP ayarları eksik" };

  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to: params.to,
      subject: `Kaydınız alındı: ${params.productTitle} stoğa girince haber vereceğiz`,
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
      headers: listUnsubHeader(settings),
    });
    return { status: "sent" };
  } catch (err: any) {
    return { status: "failed", error: err?.message || "Email gönderim hatası" };
  }
}

/**
 * "Stok geldi" bildirimi — beklediği ürün tekrar stoğa girince müşteriye gider.
 */
export async function sendBackInStockNotification(params: {
  to: string;
  name?: string | null;
  productTitle: string;
  productUrl: string;
}): Promise<{ status: "sent" | "failed"; error?: string }> {
  const supabase = createAdminClient();
  const { data: settings } = await (supabase as any).from("settings").select("*").limit(1).maybeSingle();
  const storeName = settings?.store_name || "YeriHisset";
  const name = (params.name || "").trim() || "Merhaba";

  const bodyHtml = `
    <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 12px">🎉 İyi haber! Ürün tekrar stokta</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 8px">
      ${name}, beklediğin <b>${params.productTitle}</b> yeniden stoklarımızda. Stoklar sınırlı olabilir — kaçırmadan göz at.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${params.productUrl}" style="display:inline-block;background:#6b7f3a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:14px;font-weight:800;font-size:15px">
        Ürüne Git
      </a>
    </div>
    <p style="font-size:13px;color:#9ca3af;line-height:1.6;margin:16px 0 0">
      Bu e-postayı, ${storeName}'te bu ürün için "stok gelince haber ver" talebinde bulunduğun için aldın.
    </p>`;

  const smtpConfig = buildSmtpConfig({
    smtp_host: settings?.smtp_host || "",
    smtp_port: settings?.smtp_port,
    smtp_secure: settings?.smtp_secure,
    smtp_user: settings?.smtp_user,
    smtp_password: settings?.smtp_password,
  });
  if (!smtpConfig.host || !smtpConfig.auth.user) return { status: "failed", error: "SMTP ayarları eksik" };

  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"${settings?.smtp_from_name || storeName}" <${settings?.smtp_from_email || smtpConfig.auth.user}>`,
      to: params.to,
      subject: `Tekrar stokta: ${params.productTitle}`,
      html: buildEmailDocument(bodyHtml, storeName),
      text: htmlToText(bodyHtml),
      headers: listUnsubHeader(settings),
    });
    return { status: "sent" };
  } catch (err: any) {
    return { status: "failed", error: err?.message || "Email gönderim hatası" };
  }
}
