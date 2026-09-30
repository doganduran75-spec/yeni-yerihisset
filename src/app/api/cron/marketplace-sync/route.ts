import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { processMarketplaceStock } from "@/lib/marketplace/sync";

// Pazaryeri stok kuyruğu (Trendyol + Hepsiburada) — YEDEK tetik: anlık tetik
// kaçarsa gönderir, başarısızları bekleyerek tekrar dener, sonuçları doğrular.
// Sistem cron'u DAKİKADA BİR çağırır; yalnız x-cron-secret başlığıyla.
// Ayrıca senkron geçmişinin 180 günden eskisini siler.
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const reports = await processMarketplaceStock(supabase);
  for (const r of reports) {
    if (r.errors.length) console.error(`[cron/marketplace-sync:${r.channel}]`, r.errors.join(" | "));
  }
  await (supabase as any).from("marketplace_stock_log")
    .delete().lt("created_at", new Date(Date.now() - 180 * 86400_000).toISOString());
  return NextResponse.json({ ok: true, reports });
}

export const GET = run;
export const POST = run;
