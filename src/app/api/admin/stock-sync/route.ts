import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Pazaryeri stok senkron görevleri (v1 manuel). Servis-rol ile; yalnız admin.
// GET: kanallar + bekleyen görevler (varyant etiketiyle) + son "yapıldı" logu.
// POST: {action} = done | reopen | update_channel.

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as any)?.role !== "admin") return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 403 }) };
  return { user, supabase };
}

// Varyant id'leri → "Grup: Değer" etiketi (ör. "Numara: 40")
async function variantLabels(supabase: any, variantIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!variantIds.length) return out;
  const { data } = await supabase
    .from("product_variants")
    .select("id, variant_options(value, variant_groups(name))")
    .in("id", variantIds);
  for (const v of (data as any[]) || []) {
    const val = v.variant_options?.value ?? "";
    const grp = v.variant_options?.variant_groups?.name ?? "";
    out[v.id] = val ? (grp ? `${grp}: ${val}` : val) : "";
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: channels } = await supabase
    .from("marketplace_channels")
    .select("id, name, manage_url, is_active, integration, sort_order")
    .order("sort_order");

  const { data: pending } = await supabase
    .from("stock_sync_tasks")
    .select("id, product_id, variant_id, channel_id, barcode, product_title, target_stock, reason, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(500);

  const { data: done } = await supabase
    .from("stock_sync_tasks")
    .select("id, variant_id, channel_id, barcode, product_title, method, done_at")
    .eq("status", "done")
    .order("done_at", { ascending: false })
    .limit(100);

  const vids = [...new Set([...(pending || []), ...(done || [])].map((t: any) => t.variant_id).filter(Boolean))];
  const labels = await variantLabels(supabase, vids as string[]);

  const enrich = (t: any) => ({ ...t, variant_label: t.variant_id ? (labels[t.variant_id] ?? "") : "" });

  return NextResponse.json({
    ok: true,
    channels: channels || [],
    pending: (pending || []).map(enrich),
    done: (done || []).map(enrich),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = await req.json() as {
    action?: string;
    taskId?: string;
    channelId?: string;
    manage_url?: string;
    is_active?: boolean;
  };

  if (body.action === "done" && body.taskId) {
    const { error } = await supabase.from("stock_sync_tasks")
      .update({ status: "done", method: "manual", done_at: new Date().toISOString(), done_by: user.id })
      .eq("id", body.taskId).eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reopen" && body.taskId) {
    const { error } = await supabase.from("stock_sync_tasks")
      .update({ status: "pending", method: null, done_at: null, done_by: null })
      .eq("id", body.taskId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "update_channel" && body.channelId) {
    const patch: Record<string, any> = {};
    if (body.manage_url !== undefined) patch.manage_url = body.manage_url;
    if (body.is_active !== undefined) patch.is_active = body.is_active;
    const { error } = await supabase.from("marketplace_channels").update(patch as any).eq("id", body.channelId); // patch alanları yukarıda beyaz listeden
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
