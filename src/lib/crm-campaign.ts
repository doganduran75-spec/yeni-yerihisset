/* eslint-disable @typescript-eslint/no-explicit-any */
// CRM › KAMPANYALAR (kullanıcı kararları 2026-10-24): kitle → kişiye özel kupon (süre atandığı andan) → e-posta
// (yalnız kampanya izni olana; gönderimi kuyruk cron'u yapar, izni gönderim anında yeniden denetler) → rapor.
// Kuponun bitmesine 3 gün kala hatırlatma (bütün kişiye özel kuponlar, izinli + kullanılmamış, bir kez).
// E-posta metinleri canlıya almadan önce kullanıcıyla gözden geçirilecek.
import { createAdminClient } from "./supabase-admin";
import { buildEmailDocument, escapeHtml } from "./notifications";

type Sb = ReturnType<typeof createAdminClient>;

export type CampaignCoupon = {
  name: string;
  type: "percentage" | "fixed" | "free_shipping";
  amount: number;
  min_order_amount?: number;
  max_discount_amount?: number | null;
  brand_ids?: string[] | null;
  category_ids?: string[] | null;
  valid_days: number; // atandığı andan itibaren
};

const site = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");
const tl = (n: number) => `₺${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
const day = (d: Date | string) => new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });

export function couponValueText(c: { type: string; amount: number }) {
  return c.type === "percentage" ? `%${Number(c.amount)} indirim` : c.type === "fixed" ? `${tl(c.amount)} indirim` : "Ücretsiz kargo";
}

/** E-postadaki kupon kutusu: kod YOK — "sepetinde hazır" */
export function couponBoxHtml(c: { type: string; amount: number; min_order_amount?: number | null }, expires: Date | string, scope: string) {
  return `<div style="margin:22px 0;border:2px dashed #65a30d;border-radius:16px;padding:18px;text-align:center;background:#f7fee7">
  <div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#4d7c0f">SANA ÖZEL</div>
  <div style="font-size:26px;font-weight:900;color:#1a2e05;margin:6px 0">${escapeHtml(couponValueText(c))}</div>
  <div style="font-size:13px;color:#3f6212;line-height:1.6">${scope ? `${escapeHtml(scope)} · ` : ""}${Number(c.min_order_amount || 0) > 0 ? `${tl(Number(c.min_order_amount))} ve üstü · ` : ""}<b>${day(expires)}</b> tarihine kadar</div>
  <div style="font-size:12px;color:#4d7c0f;margin-top:8px">Kod yazmana gerek yok — giriş yaptığında sepetinde hazır.</div>
</div>`;
}

const button = (href: string, label: string) =>
  `<div style="text-align:center;margin:22px 0"><a href="${href}" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:15px">${label}</a></div>`;

/** Kişiye özel kampanya e-postası (tam belge — kuyruk olduğu gibi gönderir, çıkış bağlantısını cron ekler) */
export function campaignEmailHtml(opts: { bodyHtml: string; firstName?: string | null; coupon?: { type: string; amount: number; min_order_amount?: number | null } | null;
  expires?: Date | string | null; scope?: string; slug: string; storeName: string }) {
  const name = escapeHtml(String(opts.firstName || "").trim());
  const utm = `utm_source=crm&utm_medium=email&utm_campaign=${encodeURIComponent(opts.slug)}`;
  let body = String(opts.bodyHtml || "").replace(/\{\{\s*ad\s*\}\}/gi, name);
  // Site bağlantılarına kampanya etiketi (raporda kaynak görünsün)
  body = body.replace(/href="((?:https?:\/\/[^"]*yerihisset[^"]*)|(?:\/[^"]*))"/gi, (_m, url: string) => {
    const full = url.startsWith("/") ? `${site()}${url}` : url;
    return `href="${full}${full.includes("?") ? "&" : "?"}${utm}"`;
  });
  const box = opts.coupon && opts.expires ? couponBoxHtml(opts.coupon, opts.expires, opts.scope || "") : "";
  const html = `${body}${box}${button(`${site()}/sepet?${utm}`, opts.coupon ? "Sepetime git" : "Alışverişe başla")}`;
  return buildEmailDocument(html, opts.storeName);
}

/** Kapsam metni: "Barebarics, Sneaker" */
export async function scopeText(sb: Sb, brandIds?: string[] | null, categoryIds?: string[] | null) {
  const s = sb as any;
  const names: string[] = [];
  if (brandIds?.length) names.push(...(((await s.from("brands").select("name").in("id", brandIds)).data as any[]) || []).map((b) => b.name));
  if (categoryIds?.length) names.push(...(((await s.from("categories").select("name").in("id", categoryIds)).data as any[]) || []).map((c) => c.name));
  return names.length ? `yalnız ${names.join(", ")}` : "";
}

/** Kuyruk cron'u (5 dk): bitmesine 3 gün kalan kişiye özel kuponlar için hatırlatma kuyruğa (bir kez) */
export async function queueCouponReminders(sb: Sb): Promise<number> {
  const s = sb as any;
  const { data: rows, error } = await s.rpc("coupons_to_remind", { p_days: 3 });
  if (error || !rows?.length) return 0;
  const { data: st } = await s.from("settings").select("store_name, smtp_from_name, smtp_from_email, smtp_user").limit(1).maybeSingle();
  const storeName = st?.store_name || "YeriHisset";
  let n = 0;
  for (const r of rows as any[]) {
    // Önce işaretle (aynı anda iki cron çalışırsa çift gitmesin)
    const { data: mine } = await s.from("user_coupons").update({ reminded_at: new Date().toISOString() }).eq("id", r.uc_id).is("reminded_at", null).select("id");
    if (!mine?.length) continue;
    const name = escapeHtml(String(r.first_name || "").trim());
    const body = `<h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">Kuponunun bitmesine 3 gün kaldı ⏳</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0">Merhaba${name ? ` ${name}` : ""}, sana özel <b>${escapeHtml(r.coupon_name || "kuponun")}</b> ${day(r.expires_at)} tarihinde sona eriyor. Kullanmak istersen sepetinde seni bekliyor.</p>
${couponBoxHtml({ type: r.coupon_type, amount: Number(r.amount) }, r.expires_at, "")}
${button(`${site()}/sepet?utm_source=crm&utm_medium=email&utm_campaign=kupon-hatirlatma`, "Sepetime git")}`;
    const { error: qe } = await s.from("email_queue").insert({
      kind: "campaign", recipient_email: r.email, subject: `${storeName} — kuponunun bitmesine 3 gün kaldı`,
      html_body: buildEmailDocument(body, storeName), from_name: st?.smtp_from_name || storeName,
      from_email: st?.smtp_from_email || st?.smtp_user || null, status: "pending",
    });
    if (!qe) n++;
  }
  return n;
}
