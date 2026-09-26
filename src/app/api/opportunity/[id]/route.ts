/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";

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

  // IP hash (KVKK: ham IP saklanmaz, geri çözülemez tek yönlü özet)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  const ipHash = ip
    ? createHash("sha256").update(`${ip}|opp|${id}`).digest("hex").slice(0, 16)
    : null;

  // Tıklama kaydı + sayaç. Sunucu yetkisiyle yazılır (anon RLS'e takılıyordu) ve
  // BEKLENİR — Supabase sorgusu await edilmezse hiç gönderilmez.
  const admin = createAdminClient();
  await Promise.all([
    admin.from("opportunity_clicks").insert({
      opportunity_id: id,
      ip_hash: ipHash,
      referrer: req.headers.get("referer") || null,
    } as any),
    (admin as any).from("partner_opportunities")
      .update({ click_count: (opp.click_count || 0) + 1 })
      .eq("id", id),
  ]).catch(() => { /* takip kritik değil, yönlendirme devam etsin */ });

  return NextResponse.redirect(opp.url);
}
