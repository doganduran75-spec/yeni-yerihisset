import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { evaluateHealthAlerts } from "@/lib/server-health-alerts";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sunucudaki scripts/server-health.sh her çalışmadan sonra çağırır (x-cron-secret).
// Uyarı mantığı: src/lib/server-health-alerts.ts (pazaryeri cron'u da 15 dk'da bir çağırır →
// sağlık betiği durursa bile "Sağlık kontrolü çalışmıyor" e-postası gider).
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const r = await evaluateHealthAlerts(createAdminClient() as any);
  return NextResponse.json({ ok: true, ...r });
}

export const POST = run;
