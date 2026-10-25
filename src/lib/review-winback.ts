/* eslint-disable @typescript-eslint/no-explicit-any */
// YORUM İSTEME + "SENİ ÖZLEDİK" — ayarlardan yönetilir (settings.review_request / settings.winback; migration 20261124).
//   Yorum: kullanmaya başladıktan (oldu cevabı; cevap yoksa deneme bitişi) delay_days sonra TEK e-posta (hatırlatma yok).
//     E-postada tıklanabilir yıldızlar → /yorum?t=…&p=N (giriş gerekmez) → Genel puan + ayardaki sorular + yorum.
//     Cevaplar soru metniyle birlikte saklanır (order_reviews.answers) → sorular sonradan değişse de okunur.
//   Seni özledik: idle_days gelmeyip dönen (trg_detect_winback), kampanya izni olan, wait_hours içinde almayan üyeye
//     kişiye özel percent% / valid_days günlük kupon hesabına tanımlanır + e-posta (kampanya kuyruğu: izin gönderimde
//     yeniden denetlenir, abonelikten çık bağlantısı eklenir). cooldown_days içinde ikinci kez gitmez.
// Dakikalık cron (marketplace-sync) saatte bir çalıştırır.

import { randomBytes } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase-admin";
import { renderEmailTemplate, escapeHtml } from "@/lib/notifications";
import { TRIAL_DAYS } from "@/lib/order-next-step";
import { generateCouponCode } from "@/lib/coupon-code";
type Sb = ReturnType<typeof createAdminClient>;

export type ReviewQuestion = { key: string; label: string; type: "stars" | "choice"; options?: string[] };
export type ReviewConfig = { enabled: boolean; delay_days: number; questions: ReviewQuestion[] };
export type WinbackConfig = { enabled: boolean; idle_days: number; wait_hours: number; percent: number; valid_days: number; cooldown_days: number };

const DAY = 86400_000;
const storeUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

export function cleanQuestions(q: unknown): ReviewQuestion[] {
  return (Array.isArray(q) ? q : []).map((x: any, i: number) => ({
    key: String(x?.key || `q${i + 1}`).replace(/[^a-z0-9_]/gi, "").slice(0, 30) || `q${i + 1}`,
    label: String(x?.label || "").trim().slice(0, 80),
    type: (x?.type === "choice" ? "choice" : "stars") as ReviewQuestion["type"],
    ...(x?.type === "choice" ? { options: (Array.isArray(x?.options) ? x.options : []).map((o: any) => String(o).trim().slice(0, 40)).filter(Boolean).slice(0, 6) } : {}),
  })).filter((x) => x.label && (x.type === "stars" || (x.options?.length ?? 0) >= 2)).slice(0, 6);
}

export async function loadConfigs(sb: Sb) {
  const { data: s } = await (sb as any).from("settings").select("store_name, smtp_from_name, smtp_from_email, smtp_user, review_request, winback").order("id").limit(1).maybeSingle();
  const r = s?.review_request || {};
  const w = s?.winback || {};
  return {
    settings: s || {},
    review: { enabled: r.enabled !== false, delay_days: Math.max(1, Number(r.delay_days) || 15), questions: cleanQuestions(r.questions) } as ReviewConfig,
    winback: {
      enabled: w.enabled !== false, idle_days: Math.max(7, Number(w.idle_days) || 90), wait_hours: Math.max(0, Number(w.wait_hours ?? 2)),
      percent: Math.min(90, Math.max(1, Number(w.percent) || 10)), valid_days: Math.max(1, Number(w.valid_days) || 10), cooldown_days: Math.max(1, Number(w.cooldown_days) || 180),
    } as WinbackConfig,
  };
}

function from(s: any) {
  const name = s?.store_name || "YeriHisset";
  return { from_name: s?.smtp_from_name || name, from_email: s?.smtp_from_email || s?.smtp_user || "" };
}

// ── Yorum isteme ────────────────────────────────────────────────────────────

/** Kullanıma başlama: "oldu" cevabı; yoksa deneme bitişi (teslim + TRIAL_DAYS) */
export function usageStart(o: { fit_status?: string | null; fit_answered_at?: string | null; delivered_at?: string | null }) {
  if (o.fit_status === "ok" && o.fit_answered_at) return new Date(o.fit_answered_at).getTime();
  return o.delivered_at ? new Date(o.delivered_at).getTime() + TRIAL_DAYS * DAY : null;
}

export async function processReviewRequests(sb: Sb) {
  const s = sb as any;
  const { settings, review } = await loadConfigs(sb);
  if (!review.enabled) return { sent: 0 };
  const now = Date.now();
  const { data } = await s.from("orders")
    .select("id, order_number, user_id, status, shipment_status, refunded_amount, fit_status, fit_answered_at, delivered_at, profiles(email, first_name), order_items(products(title)), order_cases(closed_at)")
    .eq("channel", "site").is("import_source", null).is("review_requested_at", null).eq("shipment_status", "delivered")
    .lte("delivered_at", new Date(now - review.delay_days * DAY).toISOString())
    .gte("delivered_at", new Date(now - (review.delay_days + TRIAL_DAYS + 60) * DAY).toISOString())
    .order("delivered_at").limit(50);
  let sent = 0;
  for (const o of (data as any[]) || []) {
    const start = usageStart(o);
    const email = o.profiles?.email;
    const skip = !start || start + review.delay_days * DAY > now || o.status === "cancelled" || Number(o.refunded_amount || 0) > 0
      || ["return", "exchange"].includes(o.fit_status) || ((o.order_cases as any[]) || []).some((c) => !c.closed_at) || !email;
    if (skip) {
      // Kesin uygun değilse (iade / iptal / e-posta yok) bir daha bakma; süre dolmadıysa sonra tekrar
      if (start && start + review.delay_days * DAY <= now) await s.from("orders").update({ review_requested_at: new Date().toISOString() }).eq("id", o.id);
      continue;
    }
    const { count } = await s.from("order_reviews").select("id", { count: "exact", head: true }).eq("order_id", o.id);
    const token = randomBytes(16).toString("hex");
    await s.from("orders").update({ review_requested_at: new Date().toISOString(), review_token: token }).eq("id", o.id);
    if (count) continue; // zaten yorum yazmış
    const url = `${storeUrl()}/yorum?t=${token}`;
    const stars = [1, 2, 3, 4, 5].map((n) =>
      `<a href="${url}&amp;p=${n}" title="${n} yıldız" style="display:inline-block;font-size:36px;line-height:1;color:#f59e0b;text-decoration:none;margin:0 4px">★</a>`).join("");
    const names = [...new Set(((o.order_items as any[]) || []).map((i) => i.products?.title).filter(Boolean))].slice(0, 2).join(" ve ") || "ayakkabın";
    const vars = { customer_name: escapeHtml(o.profiles?.first_name || "Merhaba"), product_names: escapeHtml(names), stars_html: stars, store_url: storeUrl(), store_name: settings?.store_name || "YeriHisset" };
    const tpl = await renderEmailTemplate("review_request", vars);
    if (!tpl) continue; // şablon kapalı → gönderme
    await s.from("email_queue").insert({ kind: "review_request", recipient_email: email, to_name: o.profiles?.first_name || null,
      subject: tpl.subject, html_body: tpl.html, ...from(settings), status: "pending" });
    sent++;
  }
  return { sent };
}

/** /yorum sayfası: bağlantıdaki siparişi oku (yalnız gösterilecek bilgiler) */
export async function reviewContext(sb: Sb, token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const s = sb as any;
  const { data: o } = await s.from("orders").select("id, user_id, profiles(first_name), order_items(product_id, products(title, images, image_url))")
    .eq("review_token", token).maybeSingle();
  if (!o) return null;
  const { count } = await s.from("order_reviews").select("id", { count: "exact", head: true }).eq("order_id", o.id);
  const { review } = await loadConfigs(sb);
  const items = ((o.order_items as any[]) || []).map((i) => ({ title: i.products?.title || "Ürün", image: i.products?.images?.[0] || i.products?.image_url || null }));
  return { order: o, firstName: o.profiles?.first_name || "", items, questions: review.questions, done: !!count };
}

/** Yorumu kaydet (admin onayı bekler) */
export async function submitReview(sb: Sb, token: string, body: { overall: number; answers: Record<string, unknown>; comment?: string }) {
  const ctx = await reviewContext(sb, token);
  if (!ctx) return { error: "Bağlantı geçersiz." };
  if (ctx.done) return { ok: true, already: true };
  const overall = Math.round(Number(body.overall));
  if (!(overall >= 1 && overall <= 5)) return { error: "Genel puanı seç." };
  const answers = ctx.questions.map((q) => {
    const v = body.answers?.[q.key];
    const value = q.type === "stars" ? (Number(v) >= 1 && Number(v) <= 5 ? Math.round(Number(v)) : null) : (q.options?.includes(String(v)) ? String(v) : null);
    return { key: q.key, label: q.label, type: q.type, value };
  }).filter((a) => a.value != null);
  const quality = answers.find((a) => a.key === "quality" && a.type === "stars")?.value as number | undefined;
  const { error } = await (sb as any).from("order_reviews").insert({
    order_id: ctx.order.id, user_id: ctx.order.user_id, product_id: ctx.order.order_items?.[0]?.product_id ?? null,
    rating_overall: overall, answers, comment: String(body.comment || "").trim().slice(0, 2000) || null,
    ...(quality ? { rating_quality: quality } : {}), source: "email", is_approved: false,
  });
  if (error) {
    if (String(error.code) === "23505") return { ok: true, already: true };
    return { error: error.message };
  }
  return { ok: true };
}

// ── Seni özledik ────────────────────────────────────────────────────────────

const code = generateCouponCode; // tahmin edilemez (src/lib/coupon-code.ts)

export async function processWinback(sb: Sb) {
  const s = sb as any;
  const { settings, winback: w } = await loadConfigs(sb);
  if (!w.enabled) return { sent: 0 };
  const now = Date.now();
  const { data } = await s.from("profiles").select("id, email, first_name, marketing_consent, winback_detected_at, winback_sent_at")
    .not("winback_detected_at", "is", null).lte("winback_detected_at", new Date(now - w.wait_hours * 3600_000).toISOString()).limit(50);
  let sent = 0;
  for (const p of (data as any[]) || []) {
    const clear = () => s.from("profiles").update({ winback_detected_at: null }).eq("id", p.id);
    const recent = p.winback_sent_at && now - new Date(p.winback_sent_at).getTime() < w.cooldown_days * DAY;
    if (!p.marketing_consent || !p.email || recent) { await clear(); continue; }
    const { count: bought } = await s.from("orders").select("id", { count: "exact", head: true }).eq("user_id", p.id).gte("created_at", p.winback_detected_at);
    if (bought) { await clear(); continue; } // döndü ve aldı → gerek yok
    const expires = new Date(now + w.valid_days * DAY);
    const { data: cp, error } = await s.from("coupons").insert({
      code: code(), name: `Seni özledik %${w.percent}`, description: "Uzun aradan sonra dönen üyeye kişiye özel",
      type: "percentage", amount: w.percent, is_personal: true, per_user_limit: 1, max_uses: 1, expires_at: expires.toISOString(), is_active: true,
    }).select("id, code").single();
    if (error || !cp) continue;
    await s.from("user_coupons").insert({ user_id: p.id, coupon_id: cp.id, max_uses: 1 });
    const tpl = await renderEmailTemplate("winback", {
      customer_name: escapeHtml(p.first_name || "Merhaba"), coupon_code: cp.code, coupon_percent: String(w.percent),
      coupon_expires: expires.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }), store_url: storeUrl(), store_name: settings?.store_name || "YeriHisset",
    });
    if (tpl) {
      await s.from("email_queue").insert({ kind: "campaign", recipient_email: p.email, to_name: p.first_name || null,
        subject: tpl.subject, html_body: tpl.html, ...from(settings), status: "pending" });
    }
    await s.from("profiles").update({ winback_detected_at: null, winback_sent_at: new Date().toISOString() }).eq("id", p.id);
    sent++;
  }
  return { sent };
}
