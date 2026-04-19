import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/opportunity/[id]
 * Fırsat tıklamasını logla ve hedef URL'e yönlendir.
 * Tüm harici partner linki bu URL üzerinden geçer → her tıklama DB'ye kaydedilir.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fırsatı bul
  const { data: opp } = await supabase
    .from("partner_opportunities")
    .select("id, url, click_count")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (!opp) {
    return NextResponse.redirect(
      new URL("/", process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com")
    );
  }

  // IP hash (KVKK uyumu — anonim)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const ipHash = ip
    ? Buffer.from(ip).toString("base64url").slice(0, 16)
    : null;

  // Tıklama kaydı — fire and forget, yönlendirmeyi bekletme
  void supabase.from("opportunity_clicks").insert({
    opportunity_id: id,
    ip_hash: ipHash,
    referrer: req.headers.get("referer") || null,
  });

  // Click count artır
  void supabase
    .from("partner_opportunities")
    .update({ click_count: (opp.click_count || 0) + 1 })
    .eq("id", id);

  return NextResponse.redirect(opp.url);
}
