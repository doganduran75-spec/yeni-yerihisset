/* eslint-disable @typescript-eslint/no-explicit-any */
// SUNUCU SAĞLIĞI UYARI E-POSTASI: kırmızı sorun ya da "yeni IP'den giriş" varsa yöneticiye
// e-posta — yalnız YENİ sorun çıkınca ya da sorun 24 saattir sürüyorsa (hatırlatma); hepsi
// düzelince "giderildi". Çağıranlar: /api/cron/server-health (sağlık betiği, 15 dk) ve
// /api/cron/marketplace-sync (15 dk'da bir) → sağlık betiği durursa da uyarı gider.
import { getServerHealth, alertKeys } from "@/lib/server-health";
import { sendAdminSystemAlert } from "@/lib/notifications";

const REMIND_H = 24;

export async function evaluateHealthAlerts(sb: any): Promise<{ status: string; alerts: string[]; sent: string | null }> {
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
  return { status: health.status, alerts: keys, sent };
}
