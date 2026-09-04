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
  items: Array<{ title: string; quantity: number; unit_price: number }>
): string {
  if (!items.length) return "";
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;font-size:14px;color:#334155;border-bottom:1px solid #e2e8f0;">${item.title}</td>
        <td style="padding:8px 12px;font-size:14px;color:#64748b;text-align:center;border-bottom:1px solid #e2e8f0;">${item.quantity}</td>
        <td style="padding:8px 12px;font-size:14px;color:#334155;text-align:right;border-bottom:1px solid #e2e8f0;">₺${(item.unit_price * item.quantity).toFixed(2)}</td>
      </tr>`
    )
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

// --- Ana fonksiyon ---

export async function sendOrderNotification(
  trigger: NotificationTrigger,
  context: NotificationContext
): Promise<{ channel: "email" | "push" | "skipped"; status: "sent" | "failed" | "skipped"; error?: string }> {
  const supabase = createAdminClient();

  // 1. Sipariş + kullanıcı bilgilerini getir
  const { data: order, error: orderError } = await (supabase
    .from("orders")
    .select(`
      id, total_amount, status, created_at, shipping_address, payment_method,
      profiles!orders_user_id_fkey (
        first_name, last_name, email
      ),
      order_items (
        quantity, unit_price,
        products (title)
      )
    `)
    .eq("id", context.orderId)
    .single() as any) as { data: any; error: any };

  if (orderError || !order) {
    return { channel: "skipped", status: "failed", error: "Sipariş bulunamadı" };
  }

  const profile = order.profiles as any;
  const customerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Değerli Müşterimiz";
  const customerEmail = profile?.email;
  const orderItems: Array<{ title: string; quantity: number; unit_price: number }> =
    ((order.order_items as any[]) || []).map((i: any) => ({
      title: i.products?.title ?? "Ürün",
      quantity: i.quantity,
      unit_price: i.unit_price,
    }));

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

  // 4. Email şablonunu getir
  const { data: template } = await supabase
    .from("email_templates")
    .select("subject, body_html, is_active")
    .eq("trigger", trigger)
    .single();

  if (!template?.is_active) {
    await logNotification(supabase, { ...context, trigger, channel: "skipped", status: "skipped", recipient: customerEmail || "" });
    return { channel: "skipped", status: "skipped" };
  }

  // 5. Template değişkenlerini doldur
  const trackingHtml = context.trackingNumber
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:0 0 24px 0;">
         <p style="margin:0 0 4px 0;color:#1e40af;font-size:13px;font-weight:700;">🚚 Kargo Takip No</p>
         <p style="margin:0;color:#1d4ed8;font-size:16px;font-weight:700;">${context.trackingNumber}</p>
       </div>`
    : "";

  // Havale/EFT siparişlerinde banka bilgisi bloğu
  const isBankTransfer = (order as any).payment_method === "bank_transfer";
  const bankInfo: string = settings?.bank_transfer_info ?? "";
  const bankInfoHtml =
    isBankTransfer && bankInfo
      ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:0 0 24px 0;">
           <p style="margin:0 0 8px 0;color:#92400e;font-size:13px;font-weight:700;">🏦 Havale / EFT Banka Bilgileri</p>
           <pre style="margin:0;color:#78350f;font-size:13px;font-family:monospace;white-space:pre-wrap;">${bankInfo}</pre>
           <p style="margin:12px 0 0 0;color:#92400e;font-size:12px;">Açıklama kısmına sipariş numaranızı (<strong>#${order.id.slice(0, 8).toUpperCase()}</strong>) yazmayı unutmayın.</p>
         </div>`
      : "";

  const vars: Record<string, string> = {
    customer_name: customerName,
    order_id: order.id.slice(0, 8).toUpperCase(),
    order_date: new Date(order.created_at).toLocaleDateString("tr-TR"),
    order_total: `₺${Number(order.total_amount).toFixed(2)}`,
    order_items_html: buildOrderItemsHtml(orderItems),
    shipping_address: order.shipping_address || "",
    tracking_html: trackingHtml,
    bank_info_html: bankInfoHtml,
    store_name: storeName,
    store_email: storeEmail,
    store_url: storeUrl,
  };

  const subject = replaceVariables(template.subject, vars);
  let bodyHtml = replaceVariables(template.body_html, vars);
  bodyHtml = addUtmTracking(bodyHtml, trigger);

  // --- Push bildirimi ---
  if (pushToken?.token) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          to: pushToken.token,
          title: subject,
          body: `Sipariş #${order.id.slice(0, 8).toUpperCase()}`,
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
    });
    return { status: "sent" };
  } catch (err: any) {
    return { status: "failed", error: err?.message || "Email gönderim hatası" };
  }
}
