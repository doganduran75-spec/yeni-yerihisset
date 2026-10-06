/* eslint-disable @typescript-eslint/no-explicit-any */
// SUNUCU SAĞLIĞI — dashboard kartı ve uyarı e-postası aynı hesabı kullanır.
// Kaynaklar:
//   * server_health_runs: sunucudaki scripts/server-health.sh (15 dk'da bir) → disk, bellek,
//     konteynerler, site süreçleri, SSL, güncellemeler, SSH girişleri…
//   * backup_runs: gece yedeği (yerel + Drive) ne zaman başarılı oldu
//   * cron_heartbeats: pazaryeri senkronu gibi zamanlanmış işler en son ne zaman çalıştı

export type HealthStatus = "ok" | "warn" | "fail";
export type HealthCheck = { key: string; label: string; status: HealthStatus; value: string; hint: string; alert?: boolean };
export type ServerHealth = { status: HealthStatus; checkedAt: string | null; checks: HealthCheck[] };

const RUN_STALE_MIN = 40;          // sağlık betiği 15 dk'da bir; 40 dk ses yoksa cron durmuş
const BACKUP_STALE_H = 26;         // gece yedeği
const HEARTBEATS: Record<string, { label: string; staleMin: number }> = {
  "marketplace-sync": { label: "Pazaryeri senkronu", staleMin: 15 }, // dakikada bir çalışır
};

const rank: Record<HealthStatus, number> = { ok: 0, warn: 1, fail: 2 };
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} dk önce` : m < 2880 ? `${Math.round(m / 60)} saat önce` : `${Math.round(m / 1440)} gün önce`;
};

export async function getServerHealth(sb: any): Promise<ServerHealth> {
  const checks: HealthCheck[] = [];

  // 1) Sunucu kontrolleri (son çalışma)
  const { data: run } = await sb.from("server_health_runs").select("created_at, checks").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) {
    checks.push({ key: "health_run", label: "Sağlık kontrolü", status: "warn", value: "henüz çalışmadı", hint: "Sunucuda: bash /opt/yerihisset-app/scripts/server-health.sh --install" });
  } else {
    const ageMin = (Date.now() - new Date(run.created_at).getTime()) / 60000;
    if (ageMin > RUN_STALE_MIN) {
      checks.push({ key: "health_run", label: "Sağlık kontrolü", status: "fail", value: `son çalışma ${ago(run.created_at)}`, hint: "Sunucudaki kontrol durmuş: sunucu kapalı olabilir ya da cron çalışmıyor." });
    }
    for (const c of (run.checks as HealthCheck[]) || []) checks.push(c);
  }

  // 2) Yedek
  const { data: backup } = await sb.from("backup_runs").select("created_at, offsite_ok").eq("kind", "backup").eq("ok", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!backup) {
    checks.push({ key: "backup", label: "Yedek", status: "fail", value: "başarılı yedek yok", hint: "Gece yedeği çalışmıyor; Yedekleme kartına bakın." });
  } else if (Date.now() - new Date(backup.created_at).getTime() > BACKUP_STALE_H * 3600_000) {
    checks.push({ key: "backup", label: "Yedek", status: "fail", value: `son başarılı yedek ${ago(backup.created_at)}`, hint: "Gece yedeği aksadı; Yedekleme kartına bakın." });
  } else {
    checks.push({ key: "backup", label: "Yedek", status: "ok", value: `${ago(backup.created_at)}${backup.offsite_ok ? " · Drive kopyası var" : ""}`, hint: "" });
  }

  // 3) Zamanlanmış işler
  const { data: beats } = await sb.from("cron_heartbeats").select("name, last_run_at, ok, message");
  for (const [name, cfg] of Object.entries(HEARTBEATS)) {
    const b = ((beats as any[]) || []).find((x) => x.name === name);
    if (!b) {
      checks.push({ key: `cron:${name}`, label: cfg.label, status: "warn", value: "henüz kayıt yok", hint: "İlk çalışmadan sonra görünür." });
    } else if (Date.now() - new Date(b.last_run_at).getTime() > cfg.staleMin * 60_000) {
      checks.push({ key: `cron:${name}`, label: cfg.label, status: "fail", value: `son çalışma ${ago(b.last_run_at)}`, hint: "Zamanlanmış iş durmuş; stoklar pazaryerlerine gitmiyor olabilir." });
    } else if (!b.ok) {
      checks.push({ key: `cron:${name}`, label: cfg.label, status: "warn", value: `çalışıyor, hata: ${String(b.message || "").slice(0, 120)}`, hint: "Ayarlar › Entegrasyonlar'da ayrıntı görülebilir." });
    } else {
      checks.push({ key: `cron:${name}`, label: cfg.label, status: "ok", value: `son çalışma ${ago(b.last_run_at)}`, hint: "" });
    }
  }

  // 4) Form spam koruması: son 24 saatte engellenen bot denemeleri (src/lib/bot-guard.ts)
  const { count: bots, error: botErr } = await sb.from("bot_blocks").select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
  if (!botErr) {
    const n = bots ?? 0;
    checks.push({
      key: "bot_blocks", label: "Form spam koruması",
      status: n > 500 ? "warn" : "ok",
      value: n ? `son 24 saatte ${n} bot denemesi engellendi` : "son 24 saatte bot denemesi yok",
      hint: n > 500 ? "Yoğun bot saldırısı sürüyor; hepsi engellendi. Uzun sürerse Cloudflare Turnstile eklenebilir." : "",
    });
  }

  const status = checks.reduce<HealthStatus>((w, c) => (rank[c.status] > rank[w] ? c.status : w), "ok");
  checks.sort((a, b) => rank[b.status] - rank[a.status]);
  return { status, checkedAt: run?.created_at ?? null, checks };
}

/** E-posta gerektiren sorunlar: kırmızılar + özel olarak işaretli uyarılar (ör. yeni IP'den giriş). */
export function alertKeys(h: ServerHealth): string[] {
  return h.checks.filter((c) => c.status === "fail" || c.alert).map((c) => c.key).sort();
}
