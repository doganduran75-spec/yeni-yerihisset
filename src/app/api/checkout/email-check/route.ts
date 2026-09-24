import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Misafir checkout'ta e-posta alanından çıkınca "bu e-posta zaten üye mi?" hızlı
// kontrolü — müşteri tüm formu doldurduktan sonra "zaten üyesin" duymasın.
// Güvenlik: yalnız evet/hayır döner (isim vb. yok). Bu bilgi sipariş gönderiminde
// zaten açığa çıkıyor (409), yine de toplu tarama (e-posta listesi deneme) için
// IP başına hız sınırı var. Not: sınır pm2 instance başına bellekte tutulur.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 15;
const hits = new Map<string, { n: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return false;
  }
  h.n++;
  return h.n > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  // Sınır aşıldıysa sessizce "bilinmiyor" — form yine çalışır, kontrol siparişte yapılır
  if (limited(ip)) return NextResponse.json({ exists: null });

  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const e = (email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ exists: null });

  const supabase = createAdminClient();
  const { data } = await (supabase as any).from("profiles").select("id").eq("email", e).maybeSingle();
  return NextResponse.json({ exists: !!data?.id });
}
