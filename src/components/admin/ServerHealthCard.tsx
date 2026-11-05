"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Admin dashboard — SUNUCU SAĞLIĞI. Sunucudaki scripts/server-health.sh 15 dakikada bir
// disk, bellek, konteynerler, site süreçleri, SSL, güncellemeler ve SSH girişlerini
// kontrol eder; yedek ve pazaryeri senkronu da eklenir (src/lib/server-health.ts).
// Kırmızı / "yeni IP'den giriş" olunca yöneticiye ayrıca e-posta gider.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { ServerCog, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown, ChevronUp, Copy, Check as CheckIcon, LifeBuoy } from "lucide-react";

type Check = { key: string; label: string; status: "ok" | "warn" | "fail"; value: string; hint: string };

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} saat önce` : `${Math.round(h / 24)} gün önce`;
}

const ICON = {
  ok: <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />,
  warn: <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />,
  fail: <XCircle size={14} className="text-red-600 shrink-0 mt-0.5" />,
};

// "NE YAPMALIYIM?" — sarı / kırmızı kontrolün altında adım adım yol (kullanıcı 2026-11-05: Claude'a sormadan).
// Komutlar sunucuda SSH ile (root) çalıştırılır; komut çıktının sonunda tek bir SONUÇ satırı verir
// (scripts/server-update.sh). Hazır yolu olmayan uyarıda: çıktıyı / ekran görüntüsünü Claude'a gönder.
type Step = { t: string; cmd?: string };
const APP = "/opt/yerihisset-app";
const ASK = "Çıktının tamamını kopyalayıp Claude'a gönder (silme / yeniden başlatma kararını birlikte veririz).";
function runbook(c: Check): Step[] {
  const k = c.key;
  // Yalnız yeniden başlatma kaldıysa doğrudan --reboot; bekleyen güvenlik güncellemesi de varsa önce yükleme (aşağıdaki yol)
  if (k === "updates" && /yeniden başlatma/.test(c.value) && Number(c.value.match(/güvenlik: (\d+)/)?.[1] || 0) === 0) return [
    { t: "Sakin bir saat seç — site 2-3 dakika kapanır. Sunucuya SSH ile bağlan ve çalıştır:", cmd: `bash ${APP}/scripts/server-update.sh --reboot` },
    { t: "Önce her şeyin açılışta kendiliğinden kalkacağını denetler; hazırsa 10 saniye sonra yeniden başlatır (SSH bağlantın kopar, bu normal)." },
    { t: "5 dakika sonra bu sayfayı yenile (Ctrl+Shift+R). 15 dakika içindeki kontrolde kart yeşile dönmeli." },
    { t: "Çıktıda “SONUÇ: ✗ HATA” yazarsa yeniden başlatılmaz — " + ASK },
  ];
  if (k === "updates") return [
    { t: "Sunucuya SSH ile bağlan ve çalıştır (birkaç dakika sürer, site açık kalır):", cmd: `bash ${APP}/scripts/server-update.sh` },
    { t: "Çıktının sonundaki SONUÇ satırına bak:" },
    { t: "“✓ TAMAM” → bu sayfayı yenile (Ctrl+Shift+R); uyarı kalkar. İş bitti." },
    { t: "“↻ YENİDEN BAŞLATMA GEREKİYOR” → sakin bir saatte (site 2-3 dk kapanır) şunu çalıştır:", cmd: `bash ${APP}/scripts/server-update.sh --reboot` },
    { t: "“✗ HATA” → " + ASK },
    { t: "Docker güncellemesi varsa betik önce sorar (veritabanı ~1 dk kesilir): “e” ile devam et ya da sakin saate bırak." },
  ];
  if (k === "disk") return [
    { t: "Neyin yer kapladığını gör:", cmd: "df -h / && du -xh /var /opt /root 2>/dev/null | sort -rh | head -20" },
    { t: ASK },
  ];
  if (k === "memory" || k === "load") return [
    { t: "Neyin bellek / işlemci kullandığını gör:", cmd: "free -h && uptime && ps aux --sort=-%cpu | head -8 && docker stats --no-stream" },
    { t: ASK },
  ];
  if (k === "app") return [
    { t: "Site süreçlerinin durumu ve son kayıtlar:", cmd: "pm2 status && pm2 logs yerihisset --lines 40 --nostream" },
    { t: "Süreç “stopped / errored” ise yeniden başlat:", cmd: "pm2 restart yerihisset" },
    { t: "Düzelmezse ilk komutun çıktısını Claude'a gönder." },
  ];
  if (k === "containers") return [
    { t: "Konteynerlerin durumu:", cmd: "docker ps -a --format 'table {{.Names}}	{{.Status}}'" },
    { t: ASK },
  ];
  if (k === "clock") return [
    { t: "Saat durumu:", cmd: "timedatectl" },
    { t: ASK },
  ];
  return [{ t: "Bu uyarı için hazır adım yok — bu kartın ekran görüntüsünü Claude'a gönder." }];
}

function CopyCmd({ cmd }: { cmd: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-1 flex items-stretch gap-1">
      <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap rounded-md bg-slate-900 px-2 py-1.5 font-mono text-[11px] text-slate-100">{cmd}</code>
      <button
        type="button"
        title="Kopyala"
        onClick={() => { navigator.clipboard?.writeText(cmd).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
        className="shrink-0 rounded-md border bg-white px-2 text-slate-600 hover:bg-slate-50"
      >
        {done ? <CheckIcon size={13} className="text-emerald-600" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function Guide({ c }: { c: Check }) {
  const [open, setOpen] = useState(c.key === "updates");
  const steps = runbook(c);
  return (
    <div className="mt-2 pl-6">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900">
        <LifeBuoy size={13} /> Ne yapmalıyım? {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <ol className="mt-1.5 space-y-1.5 list-decimal pl-5 text-xs text-slate-700">
          {steps.map((s, i) => (
            <li key={i}>{s.t}{s.cmd && <CopyCmd cmd={s.cmd} />}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function ServerHealthCard() {
  const [d, setD] = useState<{ status: "ok" | "warn" | "fail"; checkedAt: string | null; checks: Check[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showOk, setShowOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch("/api/admin/server-health", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || "okunamadı");
        setD(j);
      } catch (e: any) {
        setErr(e?.message || "okunamadı");
      }
    })();
  }, []);

  const problems = d?.checks.filter((c) => c.status !== "ok") ?? [];
  const oks = d?.checks.filter((c) => c.status === "ok") ?? [];
  const border = !d ? "border-l-slate-300" : d.status === "fail" ? "border-l-red-500" : d.status === "warn" ? "border-l-amber-400" : "border-l-emerald-500";

  return (
    <Card className={`shadow-sm border-l-4 ${border}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <ServerCog size={18} className={d?.status === "fail" ? "text-red-500" : d?.status === "warn" ? "text-amber-500" : "text-emerald-600"} />
          Sunucu Sağlığı
        </CardTitle>
        {d && (
          d.status === "ok"
            ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 size={13} /> Sağlıklı</span>
            : d.status === "warn"
              ? <span className="flex items-center gap-1 text-xs font-bold text-amber-600"><AlertTriangle size={13} /> Dikkat</span>
              : <span className="flex items-center gap-1 text-xs font-bold text-red-600"><XCircle size={13} /> Sorun var</span>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-2 text-sm">
        {err ? (
          <p className="text-xs text-muted-foreground">Durum okunamadı ({err}). Migration 20261010000001 çalıştırıldı mı?</p>
        ) : !d ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2"><Loader2 size={14} className="animate-spin" /> Yükleniyor…</div>
        ) : (
          <>
            {problems.map((c) => (
              <div key={c.key} className={`rounded-xl p-2.5 ${c.status === "fail" ? "bg-red-50" : "bg-amber-50"}`}>
                <div className="flex gap-2">
                  {ICON[c.status]}
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-[13px]">{c.label}: <span className="font-normal">{c.value}</span></p>
                    {c.hint && <p className="text-xs text-slate-600 mt-0.5">→ {c.hint}</p>}
                  </div>
                </div>
                <Guide c={c} />
              </div>
            ))}
            <button onClick={() => setShowOk((v) => !v)} className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 py-1">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-600" /> {oks.length} kontrol sağlıklı</span>
              {showOk ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showOk && (
              <div className="space-y-1.5 pl-1">
                {oks.map((c) => (
                  <div key={c.key} className="flex gap-2 text-xs">
                    {ICON.ok}
                    <span><b className="text-slate-700">{c.label}:</b> <span className="text-slate-500">{c.value}</span></span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              {d.checkedAt
                ? `Son kontrol: ${new Date(d.checkedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} (${ago(d.checkedAt)}) · 15 dakikada bir`
                : "Sunucu kontrolü henüz kurulmadı"} · 40 dakikadan eskiyse kart kırmızıya döner ve e-posta gelir
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
