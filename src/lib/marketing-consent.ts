/* eslint-disable @typescript-eslint/no-explicit-any */
// KAMPANYA E-POSTASI İZNİ (migration 20261029000001).
// İzin profiles.marketing_consent'te; her değişiklik marketing_consent_log'a (ispat) yazılır.
// E-postadaki bağlantı (/kampanya-izni?t=…) giriş gerektirmez: t = kullanıcı kimliği + imza.
// Bağlantı açılınca izin HEMEN verilmez (e-posta tarayıcıları bağlantıları önceden açar) —
// sayfadaki düğmeye basılınca verilir.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-admin";

export type ConsentSource = "account" | "checkout" | "email_link" | "admin";

const key = () => `marketing-consent:${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`;
const sig = (userId: string) => createHmac("sha256", key()).update(userId).digest("base64url").slice(0, 32);

export function consentToken(userId: string): string {
  return `${userId}.${sig(userId)}`;
}

export function verifyConsentToken(token: string): string | null {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/i.exec(String(token || ""));
  if (!m) return null;
  const want = Buffer.from(sig(m[1]));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got) ? m[1] : null;
}

export function consentUrl(userId: string, optOut = false): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");
  return `${site}/kampanya-izni?t=${consentToken(userId)}${optOut ? "&cik=1" : ""}`;
}

/** İzni ver / geri al. Değişmediyse kayıt yazmaz. */
export async function setMarketingConsent(userId: string, granted: boolean, source: ConsentSource): Promise<{ ok: boolean; changed: boolean }> {
  const sb = createAdminClient() as any;
  const { data: p } = await sb.from("profiles").select("email, marketing_consent").eq("id", userId).maybeSingle();
  if (!p) return { ok: false, changed: false };
  if (!!p.marketing_consent === granted) return { ok: true, changed: false };
  const now = new Date().toISOString();
  const { error } = await sb.from("profiles").update({ marketing_consent: granted, marketing_consent_at: now, marketing_consent_source: source }).eq("id", userId);
  if (error) return { ok: false, changed: false };
  await sb.from("marketing_consent_log").insert({ user_id: userId, email: p.email ?? null, granted, source });
  return { ok: true, changed: true };
}
