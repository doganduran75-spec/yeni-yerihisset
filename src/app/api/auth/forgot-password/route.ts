import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { botVerdict, botResponse } from "@/lib/bot-guard";
import { sendPasswordRecoveryEmail } from "@/lib/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Şifremi unuttum — GoTrue'nun kendi SMTP'sine (auth/v1/recover) bağımlı olmadan
 * çalışır. Recovery linkini admin.generateLink ile üretir, markalı e-postayı
 * uygulama SMTP'si (nodemailer) ile gönderir. Tüm diğer e-postalarla aynı yol.
 *
 * Güvenlik: kullanıcı olsun olmasın cevap HER ZAMAN AYNI — { ok: true }, aynı hızda (güvenlik 2026-11-16: cevapta
 * emailStatus "skipped" / "sent" dönüyordu → hesabın var olup olmadığı belli oluyordu). Hesap arama + bağlantı +
 * e-posta cevaptan SONRA (after) çalışır; sonuç yalnız sunucu kaydında.
 */
async function sendRecovery(email: string) {
  const supabase = createAdminClient();
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

  // Üye var mı? (yoksa sessizce bitir — enumeration önleme)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name")
    .eq("email", email)
    .maybeSingle();
  if (!profile) return;

  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${storeUrl}/sifre-belirle` },
  } as any);

  // Supabase'in action_link'i yerine token_hash'i alıp linki KENDİ domainimizde
  // kuruyoruz → e-postada altyapı (supabase/auth/verify) görünmez.
  const hashedToken = (linkData as any)?.properties?.hashed_token;
  const actionUrl = hashedToken
    ? `${storeUrl}/sifre-belirle?token_hash=${hashedToken}&type=recovery`
    : null;
  if (linkErr || !actionUrl) {
    console.error("[forgot-password] generateLink hatası:", linkErr?.message || "Recovery linki üretilemedi");
    return;
  }
  const name = [(profile as any).first_name, (profile as any).last_name].filter(Boolean).join(" ") || null;
  const res = await sendPasswordRecoveryEmail({ to: email, name, actionUrl });
  if (res.status === "failed") console.error("[forgot-password] e-posta gönderilemedi:", res.error);
}

export async function POST(req: NextRequest) {
  // Toplu kötüye kullanıma karşı IP başına sınır
  if (rateLimited("forgot", clientIp(req), 5, 900000)) return NextResponse.json(TOO_MANY, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const blocked = botResponse("forgot-password", botVerdict(body, { minMs: 1500 }), clientIp(req));
  if (blocked) return blocked;
  const email = String(body.email || "").trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  after(() => sendRecovery(email).catch((e) => console.error("[forgot-password]", e?.message || e)));
  return NextResponse.json({ ok: true });
}
