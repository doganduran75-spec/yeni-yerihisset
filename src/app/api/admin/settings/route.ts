import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Admin Ayarlar sayfası için TAM ayar satırı (SMTP şifresi, Kargonomi token vb.
// dahil). settings tablosunun gizli kolonları anon/authenticated rollerine
// kapalı (migration 20260926000001) → yalnız admin, sunucu üzerinden okur.
async function requireAdmin(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: "Oturum bulunamadı, lütfen tekrar giriş yap." }, { status: 401 }) };
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as any)?.role !== "admin") return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 403 }) };
  return { supabase };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await (supabase as any)
    .from("settings").select("*").order("id", { ascending: true }).limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data?.[0] ?? null });
}

// Kaydet: güncellenecek satırı SUNUCU bulur (istemciden gelen id'ye güvenilmez).
// Tek satırlık ayar deseni: satır varsa güncelle, yoksa oluştur.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = (await req.json().catch(() => ({}))) as { settings?: Record<string, unknown> };
  const payload: Record<string, unknown> = { ...(body.settings || {}) };
  delete payload.id;
  delete payload.created_at;
  payload.updated_at = new Date().toISOString();

  const { data: rows } = await (supabase as any).from("settings").select("id").limit(1);
  const hasRow = !!rows?.length;

  // Tek-satır deseni: (yanlışlıkla birden fazla satır oluşmuşsa bile) TÜM satırlar
  // aynı değeri alır → hangi okuyucu hangi satırı seçerse seçsin tutarlı kalır.
  const { error } = hasRow
    ? await (supabase as any).from("settings").update(payload).not("id", "is", null)
    : await (supabase as any).from("settings").insert(payload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
