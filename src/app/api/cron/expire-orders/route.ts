import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// F9: Ödenmemiş siparişleri otomatik iptal + stok iade.
// Dış zamanlayıcı (sistem cron) çağırır. CRON_SECRET ile korunur.
// Örnek crontab (her 15 dk): "15dk'da bir" -> POST /api/cron/expire-orders
// başlık: x-cron-secret: <CRON_SECRET>
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any).rpc("expire_unpaid_orders");
  if (error) {
    console.error("[cron/expire-orders]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export const POST = run;
export const GET = run; // cron kolaylığı
