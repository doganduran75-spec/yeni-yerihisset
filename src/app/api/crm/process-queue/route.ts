import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { buildSmtpConfig } from "@/lib/smtp-config";
import nodemailer from "nodemailer";

/** N milisaniye bekle */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  // Auth
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = await req.json() as { campaignId: string; batchSize?: number };
  const { campaignId, batchSize = 5 } = body;

  if (!campaignId) return NextResponse.json({ error: "campaignId zorunlu" }, { status: 400 });

  // Kampanya iptal edilmiş mi?
  const { data: campaign } = await (supabase as any)
    .from("email_campaigns")
    .select("id, status, subject")
    .eq("id", campaignId)
    .single();

  if (!campaign) return NextResponse.json({ error: "Kampanya bulunamadı" }, { status: 404 });
  if (campaign.status === "cancelled") {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, remaining: 0, cancelled: true });
  }

  // SMTP ayarları
  const { data: settings } = await (supabase as any).from("settings").select("*").limit(1).single();
  if (!settings?.smtp_host) {
    return NextResponse.json({ error: "SMTP ayarları yapılandırılmamış" }, { status: 500 });
  }

  const storeName: string = settings.store_name || "YeriHisset";
  const fromName: string = settings.smtp_from_name || storeName;
  const smtpConfig = buildSmtpConfig(settings);

  // Bekleyen emailler — batch kadar al
  const { data: pending } = await (supabase as any)
    .from("email_queue")
    .select("id, recipient_email, subject, html_body, from_name, from_email")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  const items: any[] = pending || [];

  // Hiç pending yoksa kalan sayıyı döndür
  if (items.length === 0) {
    const { count } = await (supabase as any)
      .from("email_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    const remaining = count ?? 0;

    // Tüm gönderim tamamlandıysa kampanyayı "sent" yap
    if (remaining === 0) {
      const { count: failedCount } = await (supabase as any)
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "failed");

      await (supabase as any)
        .from("email_campaigns")
        .update({ status: failedCount > 0 ? "partial" : "sent" })
        .eq("id", campaignId);
    }

    return NextResponse.json({ processed: 0, sent: 0, failed: 0, remaining, done: remaining === 0 });
  }

  // Processing olarak işaretle (race condition önlemi)
  const ids = items.map((i: any) => i.id);
  await (supabase as any)
    .from("email_queue")
    .update({ status: "processing" })
    .in("id", ids);

  // Nodemailer transporter
  const transporter = nodemailer.createTransport(smtpConfig as any);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      await transporter.sendMail({
        from: `"${item.from_name || fromName}" <${item.from_email || smtpConfig.auth.user}>`,
        to: item.recipient_email,
        subject: item.subject,
        html: item.html_body,
        headers: {
          // Anti-spam başlıkları
          "List-Unsubscribe": `<${siteUrl}/unsubscribe?email=${encodeURIComponent(item.recipient_email)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "Precedence": "bulk",
          "X-Mailer": "YeriHisset Mailer",
          "X-Campaign-Id": campaignId,
        },
      });

      await (supabase as any)
        .from("email_queue")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", item.id);

      sent++;
    } catch (err: any) {
      const errMsg = err?.message || "Bilinmeyen hata";
      errors.push(`${item.recipient_email}: ${errMsg}`);

      await (supabase as any)
        .from("email_queue")
        .update({ status: "failed", error_message: errMsg })
        .eq("id", item.id);

      failed++;
    }

    // Emailler arası 1.5 saniye bekle (spam önlemi)
    if (items.indexOf(item) < items.length - 1) {
      await delay(1500);
    }
  }

  // Kalan pending sayısını hesapla
  const { count: remainingCount } = await (supabase as any)
    .from("email_queue")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  const remaining = remainingCount ?? 0;

  // Kampanya tamamlandı mı?
  if (remaining === 0) {
    const { count: processingCount } = await (supabase as any)
      .from("email_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "processing");

    // Processing olan yoksa tamamlandı
    if ((processingCount ?? 0) === 0) {
      const { count: failedCount } = await (supabase as any)
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "failed");

      await (supabase as any)
        .from("email_campaigns")
        .update({ status: failedCount > 0 ? "partial" : "sent" })
        .eq("id", campaignId);
    }
  } else {
    // Kampanya durumunu "sending" olarak güncelle
    await (supabase as any)
      .from("email_campaigns")
      .update({ status: "sending" })
      .eq("id", campaignId);
  }

  return NextResponse.json({
    processed: items.length,
    sent,
    failed,
    remaining,
    done: remaining === 0,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/** Kampanya iptal etme */
export async function DELETE(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { campaignId } = await req.json();
  if (!campaignId) return NextResponse.json({ error: "campaignId zorunlu" }, { status: 400 });

  // Pending ve processing kayıtları iptal et
  await (supabase as any)
    .from("email_queue")
    .update({ status: "cancelled" })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "processing"]);

  await (supabase as any)
    .from("email_campaigns")
    .update({ status: "cancelled" })
    .eq("id", campaignId);

  return NextResponse.json({ ok: true });
}
