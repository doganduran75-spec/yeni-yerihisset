import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { evaluateHealthAlerts } from "@/lib/server-health-alerts";
import { verifySmtp } from "@/lib/mail-health";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sunucudaki scripts/server-health.sh her çalışmadan sonra çağırır (x-cron-secret).
// Uyarı mantığı: src/lib/server-health-alerts.ts (pazaryeri cron'u da 15 dk'da bir çağırır →
// sağlık betiği durursa bile "Sağlık kontrolü çalışmıyor" e-postası gider).
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const sb = createAdminClient() as any;
  // SMTP girişini doğrula (e-posta göndermez) → Pano › Sistem › E-posta
  const smtp = await verifySmtp(sb).catch((e) => ({ ok: false, error: String(e?.message || e) }));
  const r = await evaluateHealthAlerts(sb);
  return NextResponse.json({ ok: true, smtp: smtp.ok, ...r });
}

export const POST = run;
