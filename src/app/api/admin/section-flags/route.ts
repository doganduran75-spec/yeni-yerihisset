import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// FIRSATLAR / BİLGİ BANKASI AÇ-KAPA (kullanıcı 2026-11-15, MIG 20261186) — yalnız yönetici.
//   POST { field: "opportunities_enabled" | "kb_enabled", value: boolean }
const FIELDS = new Set(["opportunities_enabled", "kb_enabled"]);

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!FIELDS.has(body.field) || typeof body.value !== "boolean") return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  const { error } = await sb.from("settings").update({ [body.field]: body.value }).not("id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
