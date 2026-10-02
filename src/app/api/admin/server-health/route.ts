import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { getServerHealth } from "@/lib/server-health";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Dashboard "Sunucu Sağlığı" kartı — yalnız admin.
export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await getServerHealth(sb)) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Okunamadı" }, { status: 500 });
  }
}
