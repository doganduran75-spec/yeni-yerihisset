/* eslint-disable @typescript-eslint/no-explicit-any */
// DENEME HATIRLATMASI (kullanıcı 2026-11-11): teslimden 4 gün sonra hâlâ "oldu / değişim / iade" demeyen müşteriye TEK
// e-posta — "Ayakkabınız oldu mu?" + aynı üç düğme + kalan gün. Daha geç kalanlar istisna (14 gün dolunca yönetici bakar).
// Şablon: email_templates 'trial_reminder' (migration 20261178; panelden düzenlenir / kapatılır). Dakikalık cron saatte bir.
// Gönderilmeyen: açık değişim / iade talebi, iptal, e-postasız, satış sonrası bu sistemde olmayan (afterSaleHere değil).
import type { createAdminClient } from "@/lib/supabase-admin";
import { renderEmailTemplate, escapeHtml } from "@/lib/notifications";
import { afterSaleUrl } from "@/lib/after-sale";
import { TRIAL_DAYS, trialReminderDue, REMIND_AFTER_DAYS } from "@/lib/order-next-step";

type Sb = ReturnType<typeof createAdminClient>;
const DAY = 86400_000;
export { trialReminderDue };
/** E-postadaki üç düğme (teslim e-postasındakiyle aynı bağlantılar) */
export function fitButtonsHtml(orderId: string): string {
  const btn = (href: string, label: string, bg: string, fg = "#fff", border = bg) =>
    `<a href="${href}" style="display:inline-block;margin:4px;background:${bg};color:${fg};border:1px solid ${border};text-decoration:none;padding:11px 18px;border-radius:12px;font-weight:700;font-size:14px">${label}</a>`;
  return `<div style="text-align:center;margin:10px 0 0">
    ${btn(afterSaleUrl(orderId, "oldu"), "Oldu, çok rahat", "#4d7c0f")}
    ${btn(afterSaleUrl(orderId, "degisim"), "Numara değişimi", "#ffffff", "#365314", "#a3e635")}
    ${btn(afterSaleUrl(orderId, "iade"), "İade etmek istiyorum", "#ffffff", "#6b7280", "#d1d5db")}
  </div>`;
}

export async function processTrialReminders(sb: Sb) {
  const s = sb as any;
  const now = Date.now();
  const { data } = await s.from("orders")
    .select("id, order_number, channel, import_source, kargonomi_shipment_id, kargonomi_tracking_code, status, shipment_status, fit_status, delivered_at, trial_reminded_at, customer_email, customer_name, profiles(email, first_name), order_cases(closed_at)")
    .eq("fit_status", "trial").eq("shipment_status", "delivered").is("trial_reminded_at", null)
    .lte("delivered_at", new Date(now - REMIND_AFTER_DAYS * DAY).toISOString())
    .gte("delivered_at", new Date(now - TRIAL_DAYS * DAY).toISOString())
    .order("delivered_at").limit(50);
  const { data: st } = await s.from("settings").select("store_name, smtp_from_name, smtp_from_email, smtp_user").order("id").limit(1).maybeSingle();
  const storeName = st?.store_name || "YeriHisset";
  let sent = 0;
  for (const o of (data as any[]) || []) {
    const has_open_case = ((o.order_cases as any[]) || []).some((c) => !c.closed_at);
    const email = o.profiles?.email || o.customer_email;
    // Uygun değilse de işaretle (bir daha bakılmasın); yalnız süresi henüz gelmemişler tekrar denenir
    if (!trialReminderDue({ ...o, has_open_case }, now) || !email) {
      await s.from("orders").update({ trial_reminded_at: new Date().toISOString() }).eq("id", o.id);
      continue;
    }
    const left = Math.max(1, TRIAL_DAYS - Math.floor((now - new Date(o.delivered_at).getTime()) / DAY));
    const name = o.profiles?.first_name || String(o.customer_name || "").split(" ")[0] || "Merhaba";
    const tpl = await renderEmailTemplate("trial_reminder", {
      customer_name: escapeHtml(name), order_id: o.order_number ? `YH${o.order_number}` : String(o.id).slice(0, 8),
      days_left: String(left), fit_buttons_html: fitButtonsHtml(o.id),
      store_name: storeName, store_url: (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, ""),
    });
    await s.from("orders").update({ trial_reminded_at: new Date().toISOString() }).eq("id", o.id);
    if (!tpl) continue; // şablon kapalı
    await s.from("email_queue").insert({ kind: "trial_reminder", recipient_email: email, to_name: name, subject: tpl.subject, html_body: tpl.html,
      from_name: st?.smtp_from_name || storeName, from_email: st?.smtp_from_email || st?.smtp_user || "", status: "pending" });
    await s.from("order_events").insert({ order_id: o.id, type: "note", note: `“Ayakkabınız oldu mu?” hatırlatması gönderildi (teslimden ${REMIND_AFTER_DAYS} gün sonra)` });
    sent++;
  }
  return { sent };
}
