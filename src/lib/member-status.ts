/* eslint-disable @typescript-eslint/no-explicit-any */
// ÜYELİK DURUMU (migration 20261028000001) — iki eksen:
//   hesap: guest (şifresiz) · unverified (şifre var, e-posta doğrulanmadı) · member (şifre + doğrulanmış)
//   alışveriş: Barefoot Meraklısı / Tutkunu / Gurusu rolleri (slug musteri / mudavim / guru — ödenmiş sipariş, iş ortağı satışı)
// Ayrıcalıklar (Fırsatlar, hoş geldin kuponu, iş ortaklığı) yalnız "member"da açılır.
// Sipariş / giriş / Hesabım doğrulamadan bağımsızdır.
import { createAdminClient } from "@/lib/supabase-admin";
import { sendCouponAssignedNotification } from "@/lib/notifications";
import { mailboxKey } from "@/lib/email-identity";

/** Aynı posta kutusunun (Gmail +ek / nokta / googlemail) BAŞKA hesaplarının id'leri — hoş geldin kuponu bir kez */
async function sameMailboxUsers(sb: any, userId: string, email: string | null): Promise<string[]> {
  const key = mailboxKey(email);
  const at = key.lastIndexOf("@");
  if (at < 1) return [];
  const local = key.slice(0, at), domain = key.slice(at + 1);
  const esc = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
  // Aday: Gmail'de ilk harf + alan adı (noktalar her yerde olabilir), diğerlerinde "ad" ile başlayan (ad+ek@…)
  const pre = domain === "gmail.com" ? local.slice(0, 1) : local;
  const domains = domain === "gmail.com" ? ["gmail.com", "googlemail.com"] : [domain];
  const { data } = await sb.from("profiles").select("id, email")
    .or(domains.map((d) => `email.ilike.${esc(pre)}*@${esc(d)}`).join(",")).neq("id", userId).limit(2000);
  return ((data as any[]) || []).filter((p) => mailboxKey(p.email) === key).map((p) => p.id);
}

export type AccountState = "none" | "guest" | "unverified" | "member";

export async function getMemberStatus(userId: string): Promise<{ state: AccountState; level: number }> {
  const sb = createAdminClient() as any;
  const [{ data: state }, { data: level }] = await Promise.all([
    sb.rpc("member_account_state", { p_user: userId }),
    sb.rpc("member_level", { p_user: userId }),
  ]);
  return { state: (state as AccountState) || "none", level: Number(level || 0) };
}

/** Ayrıcalık isteyen uçlar için ortak ret yanıtı metni */
export const VERIFY_REQUIRED_MSG = "Bu özellik e-posta adresini doğruladığında açılır. Hesabım sayfasından doğrulama e-postası isteyebilirsin.";

/**
 * Hoş geldin kuponları (auto_assign_on_signup) — üye "member" olduğunda (e-postasını doğrulayınca)
 * bir kez atanır. WordPress'ten aktarılan eski müşteriler yeni değildir → atanmaz.
 * Zaten atanmış kupon tekrar atanmaz / e-posta tekrar gitmez.
 */
export async function assignSignupCoupons(userId: string): Promise<{ assigned: number; emailed: number; skipped?: string }> {
  const sb = createAdminClient() as any;
  const { state } = await getMemberStatus(userId);
  if (state !== "member") return { assigned: 0, emailed: 0, skipped: "doğrulama bekleniyor" };
  const { data: prof } = await sb.from("profiles").select("import_source, email").eq("id", userId).maybeSingle();
  if (prof?.import_source) return { assigned: 0, emailed: 0, skipped: "aktarılan müşteri" };

  const { data: coupons } = await sb.from("coupons").select("id").eq("auto_assign_on_signup", true).eq("is_active", true);
  if (!coupons?.length) return { assigned: 0, emailed: 0 };
  const { data: existing } = await sb.from("user_coupons").select("coupon_id").eq("user_id", userId);
  const have = new Set(((existing as any[]) || []).map((e) => e.coupon_id));
  // Aynı posta kutusunun başka hesabı bu kuponu aldıysa yeniden verilmez (ad+1@gmail.com ile çoğaltma)
  const twins = await sameMailboxUsers(sb, userId, prof?.email ?? null).catch(() => [] as string[]);
  if (twins.length) {
    const { data: tw } = await sb.from("user_coupons").select("coupon_id").in("user_id", twins.slice(0, 50));
    for (const e of (tw as any[]) || []) have.add(e.coupon_id);
  }

  let assigned = 0;
  let emailed = 0;
  for (const c of coupons as { id: string }[]) {
    if (have.has(c.id)) continue;
    const { error } = await sb.from("user_coupons").insert({ user_id: userId, coupon_id: c.id });
    if (error) continue;
    assigned++;
    const r = await sendCouponAssignedNotification(userId, c.id);
    if (r.status === "sent") emailed++;
  }
  return { assigned, emailed };
}
