import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Admin Ayarlar sayfası için TAM ayar satırı (SMTP şifresi, Kargonomi token vb.
// dahil). settings tablosunun gizli kolonları anon/authenticated rollerine
// kapalı (migration 20260926000001) → yalnız admin, sunucu üzerinden okur.
export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { data, error } = await (supabase as any)
    .from("settings").select("*").order("updated_at", { ascending: true }).limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data?.[0] ?? null });
}
