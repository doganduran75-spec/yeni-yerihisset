import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Analitik bakımı: dünün günlük özetini üret + retention temizliği (event 180g,
// oturum 365g). Günde bir çalıştırılır. CRON_SECRET ile korunur.
//   x-cron-secret: <CRON_SECRET>  →  GET/POST /api/cron/analytics-maintenance
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") // yalnız başlık: adres satırındaki anahtar erişim loglarına düşer;
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
  // Müşteri hata kayıtları (pano › Sistem) 90 günden eskiyse sil
  await (supabase as any).from("client_errors").delete().lt("created_at", new Date(Date.now() - 90 * 86400000).toISOString());
  // KVKK saklama süresi (docs/HUKUKI-METINLER-NOTLAR.md C5): e-posta gönderim kayıtları ve kuyruk 1 yıl
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString();
  await (supabase as any).from("notification_log").delete().lt("created_at", yearAgo);
  await (supabase as any).from("email_queue").delete().lt("created_at", yearAgo).in("status", ["sent", "failed", "skipped"]);
  return NextResponse.json({ ok: true, pruned: prune.data });
}

export const POST = run;
export const GET = run;
