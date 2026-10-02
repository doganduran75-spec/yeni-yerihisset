import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerHealth, alertKeys } from "@/lib/server-health";
import { sendAdminSystemAlert } from "@/lib/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sunucudaki scripts/server-health.sh her çalışmadan sonra çağırır (x-cron-secret).
// Sorun (kırmızı ya da "yeni IP'den giriş") varsa yöneticiye e-posta: yalnız YENİ sorun
// çıkınca ya da sorun 24 saattir sürüyorsa (hatırlatma). Hepsi düzelince "düzeldi" e-postası.
const REMIND_H = 24;

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const sb = createAdminClient() as any;
  const health = await getServerHealth(sb);
  const keys = alertKeys(health);

  const { data: state } = await sb.from("server_health_alerts").select("last_keys, last_sent_at").eq("id", 1).maybeSingle();
  const prev: string[] = state?.last_keys ?? [];
  const fresh = keys.filter((k) => !prev.includes(k));
  const remind = keys.length > 0 && (!state?.last_sent_at || Date.now() - new Date(state.last_sent_at).getTime() > REMIND_H * 3600_000);
  const resolved = keys.length === 0 && prev.length > 0;

  let sent: string | null = null;
  if (fresh.length || remind || resolved) {
    const problems = health.checks.filter((c) => keys.includes(c.key));
    const r = await sendAdminSystemAlert(
      resolved
        ? "✅ Sunucu sorunları giderildi"
        : `⚠️ Sunucu uyarısı: ${problems.map((p) => p.label).slice(0, 3).join(", ")}${problems.length > 3 ? "…" : ""}`,
      resolved ? [] : problems,
      fresh,
    );
    sent = r.status;
    if (r.status === "sent") {
      await sb.from("server_health_alerts").upsert({ id: 1, last_keys: keys, last_sent_at: new Date().toISOString() });
    }
  } else if (keys.join() !== prev.join()) {
    await sb.from("server_health_alerts").upsert({ id: 1, last_keys: keys, last_sent_at: state?.last_sent_at ?? null });
  }

  return NextResponse.json({ ok: true, status: health.status, alerts: keys, sent });
}

export const POST = run;
