import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendPasswordRecoveryEmail } from "@/lib/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Şifremi unuttum — GoTrue'nun kendi SMTP'sine (auth/v1/recover) bağımlı olmadan
 * çalışır. Recovery linkini admin.generateLink ile üretir, markalı e-postayı
 * uygulama SMTP'si (nodemailer) ile gönderir. Tüm diğer e-postalarla aynı yol.
 *
 * Güvenlik: kullanıcı olsun olmasın DAİMA generic başarı döner (e-posta enum yok).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

  // Üye var mı? (yoksa sessizce başarı dön — enumeration önleme)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name")
    .eq("email", email)
    .maybeSingle();

  let emailStatus: "sent" | "failed" | "skipped" = "skipped";
  let emailError: string | undefined;

  if (profile) {
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
      emailStatus = "failed";
      emailError = linkErr?.message || "Recovery linki üretilemedi";
      console.error("[forgot-password] generateLink hatası:", emailError);
    } else {
      const name = [(profile as any).first_name, (profile as any).last_name].filter(Boolean).join(" ") || null;
      const res = await sendPasswordRecoveryEmail({ to: email, name, actionUrl });
      emailStatus = res.status;
      emailError = res.error;
      if (res.status === "failed") console.error("[forgot-password] e-posta gönderilemedi:", res.error);
    }
  }

  // Kullanıcıya daima aynı mesaj (varlık sızdırma yok). emailStatus yalnız
  // teşhis için döner; login ekranı generic başarı gösterir.
  return NextResponse.json({ ok: true, emailStatus, emailError });
}
