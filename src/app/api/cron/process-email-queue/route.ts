import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { buildSmtpConfig } from "@/lib/smtp-config";
import { createMailTransport, isEmailLockedError } from "@/lib/mail-guard";
import { MARKETING_KINDS, marketingEligible, unsubscribeUrl, withUnsubscribeFooter } from "@/lib/marketing-mail";
import { queueCouponReminders } from "@/lib/crm-campaign";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * #4 E-posta kuyruğu işleyici (cron). Tüm kampanya/toplu mail kuyruğundaki
 * bekleyenleri throttled gönderir; admin sayfa açık tutmasına gerek kalmaz.
 * İşlemsel mailler (sipariş/şifre/üyelik) buradan GEÇMEZ — onlar anında gider.
 * CRON_SECRET ile korunur. Örnek crontab (her 5 dk):
 *   curl -s -X POST -H "x-cron-secret: <secret>" http://localhost:3000/api/cron/process-email-queue
 */
const BATCH = 20;         // her çalışmada en fazla
const THROTTLE_MS = 1200; // gönderimler arası
const MAX_ATTEMPTS = 3;

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") // yalnız başlık: adres satırındaki anahtar erişim loglarına düşer;
  if (!secret || provided !== secret) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();

  const { data: settings } = await (supabase as any).from("settings").select("*").limit(1).maybeSingle();
  if (!settings?.smtp_host) return NextResponse.json({ error: "SMTP ayarları yok" }, { status: 500 });
  const storeName = settings.store_name || "YeriHisset";
  const fromName = settings.smtp_from_name || storeName;
  const smtpConfig = buildSmtpConfig(settings);

  // Kişiye özel kuponun bitmesine 3 gün kala hatırlatma (izinli + kullanılmamış, bir kez) → kuyruğa
  const reminders = await queueCouponReminders(supabase).catch(() => 0);

  // Bekleyenleri al (tüm kuyruk, en eski önce)
  const { data: pending } = await (supabase as any)
    .from("email_queue")
    .select("id, kind, campaign_id, recipient_email, subject, html_body, from_name, from_email, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH);

  const items: any[] = pending || [];
  if (items.length === 0) return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0, reminders });

  await (supabase as any).from("email_queue").update({ status: "processing" }).in("id", items.map((i) => i.id));

  const transporter = createMailTransport(smtpConfig as any);
  // Kampanya / sepet hatırlatması: yalnız izinliye (gönderim anında kontrol) + kişiye özel çıkış bağlantısı
  const eligible = await marketingEligible(supabase, items.filter((i) => MARKETING_KINDS.has(i.kind || "campaign")).map((i) => i.recipient_email));
  let sent = 0, failed = 0, retried = 0, skipped = 0;
  const touchedCampaigns = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.campaign_id) touchedCampaigns.add(item.campaign_id);
    const marketing = MARKETING_KINDS.has(item.kind || "campaign");
    const rcpt = marketing ? eligible.get(String(item.recipient_email || "").toLowerCase()) : null;
    if (marketing && !rcpt) {
      await (supabase as any).from("email_queue")
        .update({ status: "skipped", error_message: "kampanya izni yok", last_attempt_at: new Date().toISOString() }).eq("id", item.id);
      skipped++;
      continue;
    }
    const unsub = rcpt ? unsubscribeUrl(rcpt) : null;
    try {
      await transporter.sendMail({
        from: `"${item.from_name || fromName}" <${item.from_email || smtpConfig.auth.user}>`,
        to: item.recipient_email,
        subject: item.subject,
        html: marketing ? withUnsubscribeFooter(item.html_body, unsub, storeName) : item.html_body,
        headers: unsub ? {
          "List-Unsubscribe": `<${unsub}>`,
          "Precedence": "bulk",
        } : undefined,
      });
      await (supabase as any).from("email_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: (item.attempts ?? 0) + 1, last_attempt_at: new Date().toISOString() })
        .eq("id", item.id);
      sent++;
    } catch (err: any) {
      const attempts = (item.attempts ?? 0) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS || isEmailLockedError(err); // kilitliyse tekrar deneme
      await (supabase as any).from("email_queue")
        .update({ status: giveUp ? "failed" : "pending", attempts, last_attempt_at: new Date().toISOString(), error_message: err?.message || "hata" })
        .eq("id", item.id);
      if (giveUp) failed++; else retried++;
    }
    if (i < items.length - 1) await delay(THROTTLE_MS);
  }

  // Kampanya durumlarını güncelle (drenaj olduysa)
  for (const cid of touchedCampaigns) {
    const { count: rem } = await (supabase as any).from("email_queue")
      .select("id", { count: "exact", head: true }).eq("campaign_id", cid).in("status", ["pending", "processing"]);
    if ((rem ?? 0) === 0) {
      const { count: failedCount } = await (supabase as any).from("email_queue")
        .select("id", { count: "exact", head: true }).eq("campaign_id", cid).eq("status", "failed");
      await (supabase as any).from("email_campaigns").update({ status: (failedCount ?? 0) > 0 ? "partial" : "sent" }).eq("id", cid);
    } else {
      await (supabase as any).from("email_campaigns").update({ status: "sending" }).eq("id", cid);
    }
  }

  return NextResponse.json({ ok: true, processed: items.length, sent, failed, retried, skipped });
}

export const POST = run;
export const GET = run;
