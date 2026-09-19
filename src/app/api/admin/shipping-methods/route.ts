import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as any)?.role !== "admin") return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 403 }) };
  return { supabase };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { data } = await auth.supabase.from("shipping_methods").select("*").order("sort_order");
  return NextResponse.json({ ok: true, methods: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const body = await req.json() as { action?: string; method?: any; id?: string };

  if (body.action === "delete" && body.id) {
    const { error } = await supabase.from("shipping_methods").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save" && body.method) {
    const m = body.method;
    const payload: any = {
      name: (m.name || "").trim(),
      description: (m.description || "").trim() || null,
      fee: Number(m.fee) || 0,
      free_over: m.free_over === "" || m.free_over == null ? null : Number(m.free_over),
      is_active: m.is_active !== false,
      sort_order: Number(m.sort_order) || 0,
    };
    if (!payload.name) return NextResponse.json({ error: "İsim zorunlu" }, { status: 400 });
    if (m.id) {
      const { error } = await supabase.from("shipping_methods").update(payload).eq("id", m.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase.from("shipping_methods").insert(payload);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
