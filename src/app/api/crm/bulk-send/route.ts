import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";

// UTM parametreli link dönüşümü
function addUtmLinks(html: string, campaign: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  // Mutlak URL'ler
  let result = html.replace(/href="(https?:\/\/[^"]+)"/g, (_, url: string) => {
    const separator = url.includes("?") ? "&" : "?";
    return `href="${url}${separator}utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}"`;
  });
  // Göreli URL'ler (/products/... gibi)
  result = result.replace(/href="(\/[^"]+)"/g, (_, path: string) => {
    const separator = path.includes("?") ? "&" : "?";
    return `href="${siteUrl}${path}${separator}utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}"`;
  });
  return result;
}

function wrapHtml(body: string, storeName: string, unsubToken: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:#536430;padding:24px 40px;text-align:center;">
            <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-1px;">${storeName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="font-size:11px;color:#94a3b8;margin:0;">
              Bu emaili almak istemiyorsanız
              <a href="${siteUrl}/unsubscribe?token=${unsubToken}" style="color:#536430;">aboneliğinizi iptal edebilirsiniz</a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  // Auth kontrolü
  try {
    const cookieStore = await cookies();
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Auth hatası" }, { status: 500 });
  }

  const body = await req.json() as {
    campaign: string;       // utm_campaign değeri (örn: "yeni-urun-mayis")
    subject: string;
    html_body: string;
    recipient_type: "all" | "tag" | "manual";
    tag_option_id?: string; // tag ile filtrele
    emails?: string[];      // manuel liste
  };

  const { campaign, subject, html_body, recipient_type, tag_option_id, emails } = body;
  if (!campaign || !subject || !html_body) {
    return NextResponse.json({ error: "campaign, subject ve html_body zorunlu" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Settings'ten mağaza adı ve SMTP al
  const { data: settings } = await (supabase as any).from("settings").select("*").limit(1).single() as { data: any };
  if (!settings?.smtp_host) {
    return NextResponse.json({ error: "SMTP ayarları yapılandırılmamış" }, { status: 500 });
  }

  // Alıcı listesi
  let recipientEmails: string[] = [];

  if (recipient_type === "manual" && emails?.length) {
    recipientEmails = emails.filter((e) => e.includes("@"));
  } else if (recipient_type === "tag" && tag_option_id) {
    const { data: userTags } = await supabase
      .from("user_tags")
      .select("user_id")
      .eq("tag_option_id", tag_option_id);
    const userIds = (userTags || []).map((t: any) => t.user_id);
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email")
        .in("id", userIds);
      recipientEmails = (profiles || []).map((p: any) => p.email).filter(Boolean);
    }
  } else {
    // Tüm üyeler
    const { data: profiles } = await supabase.from("profiles").select("id, email");
    recipientEmails = (profiles || []).map((p: any) => p.email).filter(Boolean);
  }

  if (!recipientEmails.length) {
    return NextResponse.json({ error: "Alıcı bulunamadı" }, { status: 400 });
  }

  // SMTP bağlantısı
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port || 587,
    secure: settings.smtp_port === 465,
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
  });

  const storeName = settings.store_name || "YeriHisset";
  const fromEmail = settings.smtp_from || settings.smtp_user;

  // Kampanya kaydı oluştur
  const { data: campaignRecord } = await (supabase as any)
    .from("email_campaigns")
    .insert({
      campaign_slug: campaign,
      subject,
      html_body,
      recipient_count: recipientEmails.length,
      recipient_type,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // UTM eklenmiş HTML hazırla
  const utmHtml = addUtmLinks(html_body, campaign);

  // Gönderim
  let sent = 0;
  let failed = 0;

  for (const email of recipientEmails) {
    try {
      const unsubToken = Buffer.from(email).toString("base64url");
      const finalHtml = wrapHtml(utmHtml, storeName, unsubToken);

      await transporter.sendMail({
        from: `${storeName} <${fromEmail}>`,
        to: email,
        subject,
        html: finalHtml,
      });

      // Tıklama takibi için campaign_sends tablosuna kaydet
      if (campaignRecord?.id) {
        await (supabase as any).from("email_campaign_sends").insert({
          campaign_id: campaignRecord.id,
          recipient_email: email,
          status: "sent",
        });
      }
      sent++;
    } catch {
      failed++;
      if (campaignRecord?.id) {
        await (supabase as any).from("email_campaign_sends").insert({
          campaign_id: campaignRecord.id,
          recipient_email: email,
          status: "failed",
        });
      }
    }
  }

  return NextResponse.json({ ok: true, sent, failed, total: recipientEmails.length });
}
