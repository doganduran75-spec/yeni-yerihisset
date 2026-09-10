import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Analitik bakımı: dünün günlük özetini üret + retention temizliği (event 180g,
// oturum 365g). Günde bir çalıştırılır. CRON_SECRET ile korunur.
//   x-cron-secret: <CRON_SECRET>  →  GET/POST /api/cron/analytics-maintenance
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const supabase = createAdminClient();

  const rollup = await (supabase as any).rpc("rollup_analytics_daily");
  if (rollup.error) {
    console.error("[cron/analytics] rollup", rollup.error);
    return NextResponse.json({ error: rollup.error.message }, { status: 500 });
  }
  const prune = await (supabase as any).rpc("prune_analytics");
  if (prune.error) {
    console.error("[cron/analytics] prune", prune.error);
    return NextResponse.json({ error: prune.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pruned: prune.data });
}

export const POST = run;
export const GET = run;
