import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { issueEmailVerification } from "@/lib/email-verify";
import { formMailAllowed } from "@/lib/form-mail-quota";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * E-postamı düzelt — kayıt sırasında yanlış yazılan adresi düzeltir.
 * GoTrue kullanıcı e-postasını günceller (email_confirm:true → giriş çalışır),
 * profiles.email güncellenir, bayrak sıfırlanır ve YENİ adrese onay maili gider.
 *
 * Hız sınırı (güvenlik 2026-11-16): her değişiklik yeni adrese site adına e-posta gönderdiği için sınırsızken
 * başkalarının adresine e-posta yağdırmakta kullanılabiliyordu. Sayaç veritabanında (MIG 20261189 form_mail_allowed —
 * tüm uygulama işlemleri ortak): hesap başına 24 saatte en çok 3 değişiklik + aynı adrese 24 saatte en çok 3 form e-postası.
 */
const CHANGE_EMAIL_PER_DAY = 3;

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const newEmail = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Başka bir üye bu e-postayı kullanıyor mu?
  const { data: clash } = await (supabase as any)
    .from("profiles").select("id").ilike("email", newEmail).neq("id", user.id).maybeSingle();
  if (clash) return NextResponse.json({ error: "Bu e-posta başka bir hesapta kayıtlı." }, { status: 409 });

  // Hesap başına sınır (anahtar: hesap kimliği; sayaç form_mail_log'da) + hedef adres başına sınır
  const accountOk = await (supabase as any)
    .rpc("form_mail_allowed", { p_email: `change-email:${user.id}`, p_form: "change-email", p_max: CHANGE_EMAIL_PER_DAY, p_hours: 24 })
    .then((r: any) => (r.error ? true : r.data === true)); // fonksiyon yoksa (migration çalışmadı) akış bozulmasın
  if (!accountOk) {
    return NextResponse.json({ error: "E-posta adresini bugün yeterince değiştirdin. Lütfen yarın tekrar dene ya da bize yaz." }, { status: 429 });
  }
  if (!(await formMailAllowed(supabase, newEmail, "change-email"))) {
    return NextResponse.json({ error: "Bu adrese bugün yeterince e-posta gönderildi. Lütfen yarın tekrar dene." }, { status: 429 });
  }

  // GoTrue kullanıcısını güncelle (anında onaylı — giriş kesilmesin)
  const { error: upErr } = await supabase.auth.admin.updateUserById(user.id, {
    email: newEmail, email_confirm: true,
  } as any);
  if (upErr) {
    // Ayrıntı yalnız sunucu kaydına (güvenlik 2026-11-16)
    console.error("[change-email]", upErr.message);
    if (/already|exists|registered/i.test(upErr.message)) return NextResponse.json({ error: "Bu e-posta başka bir hesapta kayıtlı." }, { status: 409 });
    return NextResponse.json({ error: "E-posta güncellenemedi, lütfen biraz sonra tekrar dene." }, { status: 400 });
  }

  const { data: p } = await (supabase as any)
    .from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
  await (supabase as any).from("profiles").update({ email: newEmail }).eq("id", user.id);

  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ");
  const mail = await issueEmailVerification(user.id, newEmail, name);
  return NextResponse.json({ ok: true, emailStatus: mail.status });
}
