import { NextRequest, NextResponse } from "next/server";
import { processMarketplaceStock } from "@/lib/marketplace/sync";

// Pazaryeri stok kuyruğu — YEDEK tetik (anlık tetik kaçarsa / başarısızlar
// tekrar denensin / Trendyol sonuçları doğrulansın). Sistem cron'u DAKİKADA BİR
// çağırır; yalnız x-cron-secret başlığıyla.
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const report = await processMarketplaceStock();
  if (report.errors.length) console.error("[cron/marketplace-sync]", report.errors.join(" | "));
  return NextResponse.json({ ok: true, ...report });
}

export const GET = run;
export const POST = run;
