import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * E-posta doğrulama — token ile profiles.email_verified'ı true yapar.
 * Token'ın kendisi yetkidir (giriş gerektirmez); tek kullanımlık (temizlenir).
 * Asenkron: kullanıcı linke ne zaman tıklarsa (1 saat sonra da) çalışır.
 */
export async function POST(req: NextRequest) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return NextResponse.json({ error: "Token gerekli" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("id, email_verified")
    .eq("email_verify_token", token)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Bağlantı geçersiz veya zaten kullanılmış." }, { status: 400 });
  }

  await (supabase as any).from("profiles").update({
    email_verified: true,
    email_verified_at: new Date().toISOString(),
    email_verify_token: null,
  }).eq("id", profile.id);

  return NextResponse.json({ ok: true });
}
