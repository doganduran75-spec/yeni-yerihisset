import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimited, clientIp } from "@/lib/rate-limit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Misafir checkout'ta e-posta alanından çıkınca "bu e-posta zaten üye mi?" hızlı
// kontrolü — müşteri tüm formu doldurduktan sonra "zaten üyesin" duymasın.
// Güvenlik: yalnız evet/hayır döner (isim vb. yok). Bu bilgi sipariş gönderiminde
// zaten açığa çıkıyor (409), yine de toplu tarama (e-posta listesi deneme) için
// IP başına hız sınırı var. Not: sınır pm2 instance başına bellekte tutulur.
export async function POST(req: NextRequest) {
  // Sınır aşıldıysa sessizce "bilinmiyor" — form yine çalışır, kontrol siparişte yapılır
  if (rateLimited("email-check", clientIp(req), 15, 10 * 60 * 1000)) return NextResponse.json({ exists: null });

  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const e = (email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ exists: null });

  // exists: şifreli üye → giriş gerekir. known: şifresi henüz belirlenmemiş hesap (eski siteden
  // aktarılan müşteri / önceki misafir) → misafir olarak devam eder, sipariş o hesaba bağlanır.
  const supabase = createAdminClient();
  const { data: state } = await (supabase as any).rpc("account_password_state", { p_email: e });
  if (state === "password") return NextResponse.json({ exists: true });
  if (state === "passwordless") return NextResponse.json({ exists: false, known: true });
  return NextResponse.json({ exists: false });
}
