import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createHash } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { code, path } = await req.json();

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

    // Gerçek IP'yi sunucuda header'dan al (istemci kendi IP'sini bilemez /
    // güvenilmez). Caddy/proxy x-forwarded-for veya x-real-ip set eder.
    const fwd = req.headers.get("x-forwarded-for");
    const ip = fwd ? fwd.split(",")[0].trim() : (req.headers.get("x-real-ip") || null);

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
