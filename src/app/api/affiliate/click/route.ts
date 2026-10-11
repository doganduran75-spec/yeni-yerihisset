import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createHash } from "crypto";
import { rateLimited, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const { code, path } = await req.json();

    if (!code) return NextResponse.json({ ok: false }, { status: 400 });
    // Sayaç şişirilmesin: aynı IP'den aynı ortağa 30 dk'da bir tıklama sayılır (fazlası sessizce yok sayılır)
    if (rateLimited(`affiliate-click:${String(code).slice(0, 40)}`, clientIp(req), 1, 30 * 60 * 1000)) return NextResponse.json({ ok: true });

    const supabase = createAdminClient();

    // Affiliate profilini bul
    const { data: affiliate } = await supabase
      .from("affiliate_profiles")
      .select("id, total_clicks")
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

    // Admin özetinde görünsün diye kolon sayacını da artır
    await (supabase as any).from("affiliate_profiles")
      .update({ total_clicks: Number((affiliate as any).total_clicks || 0) + 1 })
      .eq("id", affiliate.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
