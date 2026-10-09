import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { assignSignupCoupons } from "@/lib/member-status";

/* eslint-disable @typescript-eslint/no-explicit-any */

// E-POSTA DOĞRULANDI say: kullanıcı e-postasına gelen bağlantıyla (şifremi unuttum / şifre
// belirle / aktivasyon) oturum açtıysa adresin sahibi olduğunu kanıtlamıştır.
// Kanıt: erişim anahtarındaki "amr" (kimlik doğrulama yöntemi) e-posta bağlantısı türünden
// biri olmalı — şifreyle giriş yapan kişi bu uçla kendini doğrulanmış YAPAMAZ.
// Çağıran: /sifre-belirle (bağlantı doğrulanınca).
const EMAIL_PROOF = new Set(["recovery", "otp", "magiclink", "invite", "email/signup", "email_change"]);

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  // Anahtarı Supabase doğrular (imza / süre); ardından içindeki amr okunur
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user?.email) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  let amr: any[] = [];
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    amr = Array.isArray(payload?.amr) ? payload.amr : [];
  } catch { /* okunamazsa kanıt yok */ }
  const proved = amr.some((a) => EMAIL_PROOF.has(String(a?.method ?? a)));
  if (!proved) return NextResponse.json({ ok: false, reason: "no-email-proof" });

  const sb = createAdminClient() as any;
  const { data: p } = await sb.from("profiles").select("email, email_verified").eq("id", user.id).maybeSingle();
  // Şifre belirlendi + e-posta kanıtlandı → "Üye" (hoş geldin kuponları; aktarılan müşteriye verilmez)
  if (!p || p.email_verified) {
    if (p) await assignSignupCoupons(user.id).catch(() => {});
    return NextResponse.json({ ok: true, already: !!p?.email_verified });
  }
  // Profildeki adres, bağlantının gittiği (oturumdaki) adresle aynı olmalı
  if (String(p.email || "").toLowerCase() !== user.email.toLowerCase()) return NextResponse.json({ ok: false, reason: "email-mismatch" });

  await sb.from("profiles").update({
    email_verified: true,
    email_verified_at: new Date().toISOString(),
    email_verify_token: null,
  }).eq("id", user.id);
  await assignSignupCoupons(user.id).catch((e) => console.error("[mark-verified] kupon:", e?.message || e));
  return NextResponse.json({ ok: true });
}
