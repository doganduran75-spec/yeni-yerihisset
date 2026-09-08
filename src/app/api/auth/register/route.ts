import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { issueEmailVerification } from "@/lib/email-verify";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Üyelik — GoTrue'nun confirmation e-postasına (bozuk self-host SMTP) bağımlı
 * DEĞİL. admin.createUser(email_confirm:true) ile kullanıcı ANINDA onaylı
 * oluşturulur; istemci hemen şifreyle giriş yapar. (F11/şifre akışıyla aynı
 * mantık: auth e-postaları GoTrue yerine gerekince app SMTP'siyle gider.)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // onay e-postası GÖNDERME — anında aktif
    user_metadata: { first_name: firstName, last_name: lastName },
  });

  if (error || !created?.user) {
    const msg = (error?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists") || (error as any)?.status === 422) {
      return NextResponse.json({ error: "Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin." }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || "Kayıt oluşturulamadı." }, { status: 400 });
  }

  // Profil garantiye al (trigger yoksa) — ad/soyad dahil, doğrulanmadı olarak
  await supabase.from("profiles").upsert(
    { id: created.user.id, email, first_name: firstName || null, last_name: lastName || null, email_verified: false } as any,
    { onConflict: "id" }
  );

  // Onay e-postası gönder (app SMTP + kendi token) — bloklamaz
  const mail = await issueEmailVerification(created.user.id, email, [firstName, lastName].filter(Boolean).join(" "));

  return NextResponse.json({ ok: true, userId: created.user.id, emailStatus: mail.status });
}
