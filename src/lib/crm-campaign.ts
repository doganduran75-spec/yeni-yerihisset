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
export function couponBoxHtml(c: { type: string; amount: number; min_order_amount?: number | null }, expires: Date | string, scope: string, note = true) {
  return `<div style="margin:22px 0;border:2px dashed #65a30d;border-radius:16px;padding:18px;text-align:center;background:#f7fee7">
  <div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#4d7c0f">SANA ÖZEL</div>
  <div style="font-size:26px;font-weight:900;color:#1a2e05;margin:6px 0">${escapeHtml(couponValueText(c))}</div>
  <div style="font-size:13px;color:#3f6212;line-height:1.6">${scope ? `${escapeHtml(scope)} · ` : ""}${Number(c.min_order_amount || 0) > 0 ? `${tl(Number(c.min_order_amount))} ve üstü · ` : ""}<b>${day(expires)}</b> tarihine kadar</div>
  ${note ? `<div style="font-size:12px;color:#4d7c0f;margin-top:8px">Kod yazmana gerek yok — giriş yaptığında sepetinde hazır.</div>` : ""}
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

export type ReminderCoupon = { name: string; type: string; amount: number; min_order_amount?: number | null; expires_at: string; scope?: string };

/** Hatırlatma gövdesi (kullanıcı 2026-10-25): yeni kupon veriyormuş gibi DEĞİL — hangi kupon(lar) ne zaman bitiyor,
 *  her birinin içeriği (ad, indirim, kapsam, alt limit) + sepete bağlantı. Kişi başına tek e-posta. */
export function couponReminderHtml(firstName: string | null | undefined, coupons: ReminderCoupon[]) {
  const name = escapeHtml(String(firstName || "").trim());
  const many = coupons.length > 1;
  const rows = coupons.map((c) => {
    const details = [c.scope, Number(c.min_order_amount || 0) > 0 ? `${tl(Number(c.min_order_amount))} ve üstü sepetlerde` : ""].filter(Boolean).join(" · ");
    return `<tr><td style="padding:12px 14px;border-bottom:1px solid #e5e7eb">
  <div style="font-size:15px;font-weight:800;color:#111827">${escapeHtml(c.name || "Kupon")} — ${escapeHtml(couponValueText(c))}</div>
  ${details ? `<div style="font-size:13px;color:#6b7280;margin-top:2px">${escapeHtml(details)}</div>` : ""}
  <div style="font-size:13px;color:#b45309;font-weight:700;margin-top:4px">${day(c.expires_at)} tarihinde sona eriyor</div>
</td></tr>`;
  }).join("");
  return `<h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">${many ? "Kuponlarının" : "Kuponunun"} süresi doluyor ⏳</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba${name ? ` ${name}` : ""}, hesabındaki ${many ? "şu kuponların" : "şu kuponun"} süresi birkaç gün içinde bitiyor. Bittikten sonra kullanılamaz.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;overflow:hidden">${rows}</table>
<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:12px 0 0">Kod yazmana gerek yok — giriş yaptığında sepetindeki “İndirimlerin” bölümünde hazır.</p>
${button(`${site()}/sepet?utm_source=crm&utm_medium=email&utm_campaign=kupon-hatirlatma`, "Sepetime git")}`;
}

/** Kuyruk cron'u (5 dk): bitmesine 3 gün kalan kişiye özel kuponlar → kişi başına TEK hatırlatma (kupon başına bir kez) */
export async function queueCouponReminders(sb: Sb): Promise<number> {
  const s = sb as any;
  const { data: rows, error } = await s.rpc("coupons_to_remind", { p_days: 3 });
  if (error || !rows?.length) return 0;
  const { data: st } = await s.from("settings").select("store_name, smtp_from_name, smtp_from_email, smtp_user").limit(1).maybeSingle();
  const storeName = st?.store_name || "YeriHisset";
  const byUser = new Map<string, any[]>();
  for (const r of rows as any[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) || []), r]);
  let n = 0;
  for (const list of byUser.values()) {
    // Önce işaretle (aynı anda iki cron çalışırsa çift gitmesin); yalnız işaretleyebildiklerimiz listelenir
    const mine: any[] = [];
    for (const r of list) {
      const { data } = await s.from("user_coupons").update({ reminded_at: new Date().toISOString() }).eq("id", r.uc_id).is("reminded_at", null).select("id");
      if (data?.length) mine.push(r);
    }
    if (!mine.length) continue;
    const coupons: ReminderCoupon[] = [];
    for (const r of mine) coupons.push({ name: r.coupon_name, type: r.coupon_type, amount: Number(r.amount), min_order_amount: r.min_order_amount,
      expires_at: r.expires_at, scope: await scopeText(sb, r.brand_ids, r.category_ids) });
    coupons.sort((x, y) => new Date(x.expires_at).getTime() - new Date(y.expires_at).getTime());
    const { error: qe } = await s.from("email_queue").insert({
      kind: "campaign", recipient_email: mine[0].email,
      subject: `${storeName} — ${coupons.length > 1 ? `${coupons.length} kuponunun` : "kuponunun"} süresi doluyor`,
      html_body: buildEmailDocument(couponReminderHtml(mine[0].first_name, coupons), storeName), from_name: st?.smtp_from_name || storeName,
      from_email: st?.smtp_from_email || st?.smtp_user || null, status: "pending",
    });
    if (!qe) n++;
  }
  return n;
}

/** "Kuponu hesabına ekle" (misafir): kupon eklendi + şifre belirle / giriş bağlantısı. İşlemsel (kişi istedi) —
 *  kampanya izni gerekmez. */
export async function sendClaimEmail(opts: { to: string; coupon: { name: string; type: string; amount: number; min_order_amount?: number | null };
  expires: string | null; added: boolean; actionUrl: string; mode: "created" | "passwordless" | "member" }) {
  const { sendSiteMail } = await import("./site-mail");
  const box = opts.expires ? couponBoxHtml(opts.coupon, opts.expires, "", false) : `<p style="font-size:18px;font-weight:900;color:#1a2e05;text-align:center;margin:18px 0">${escapeHtml(couponValueText(opts.coupon))}</p>`;
  const intro = opts.added ? "Kuponun hesabına eklendi 🎁" : "Bu kupon zaten hesabında 🎁";
  const howTo = opts.mode === "member"
    ? "Giriş yaptığında sepetinde hazır olacak."
    : "Kuponu kullanmak için hesabına bir şifre belirlemen yeterli; sonra sepetinde hazır olacak.";
  const body = `<h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">${intro}</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0">${howTo}</p>
${box}
${button(opts.actionUrl, opts.mode === "member" ? "Giriş yap" : "Şifre belirle")}
<p style="font-size:12px;color:#6b7280;line-height:1.6;margin:0">Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.</p>`;
  return sendSiteMail(opts.to, `${couponValueText(opts.coupon)} hesabında`, body);
}
