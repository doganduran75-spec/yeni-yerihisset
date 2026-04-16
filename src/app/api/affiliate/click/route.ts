import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createHash } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { code, path, ip } = await req.json();

    if (!code) return NextResponse.json({ ok: false }, { status: 400 });

    const supabase = createAdminClient();

    // Affiliate profilini bul
    const { data: affiliate } = await supabase
      .from("affiliate_profiles")
      .select("id")
      .eq("code", code)
      .eq("status", "active")
      .single();

    if (!affiliate) return NextResponse.json({ ok: false }, { status: 404 });

    // IP hash (gizlilik için ham IP saklamıyoruz)
    const ipHash = ip
      ? createHash("sha256").update(ip + code).digest("hex").slice(0, 16)
      : null;

    // Tıklamayı kaydet
    await supabase.from("affiliate_clicks").insert({
      affiliate_id: affiliate.id,
      ip_hash: ipHash,
      path: path || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
