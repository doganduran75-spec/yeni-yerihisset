"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Admin dashboard — Yedekleme durumu. Sunucudaki gece yedeği ve haftalık
// geri-yükleme testi sonuçlarını public.backup_runs tablosuna yazar (bkz.
// scripts/db-backup.sh, scripts/db-backup-test.sh, docs/FELAKET-KURTARMA.md).
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { DatabaseBackup, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

const STALE_BACKUP_H = 26;      // gece yedeği bundan eskiyse → cron çalışmıyor
const STALE_TEST_DAYS = 8;      // haftalık test bundan eskiyse → uyarı

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} saat önce`;
  return `${Math.round(h / 24)} gün önce`;
}
function size(b?: number | null): string {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

export default function BackupStatusCard() {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [lastBackup, setLastBackup] = useState<any>(null);
  const [lastOk, setLastOk] = useState<any>(null);
  const [lastTest, setLastTest] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("backup_runs").select("*").order("created_at", { ascending: false }).limit(30);
      if (error) { setMissing(true); setLoading(false); return; }
      const rows = (data as any[]) || [];
      const backups = rows.filter((r) => r.kind === "backup");
      setLastBackup(backups[0] ?? null);
      setLastOk(backups.find((r) => r.ok) ?? null);
      setLastTest(rows.find((r) => r.kind === "restore_test") ?? null);
      setRecent(backups.slice(0, 7));
      setLoading(false);
    })();
  }, []);

  const backupStale = !lastOk || (Date.now() - new Date(lastOk.created_at).getTime()) > STALE_BACKUP_H * 3600_000;
  const lastFailed = lastBackup && !lastBackup.ok;
  const testStale = !lastTest || (Date.now() - new Date(lastTest.created_at).getTime()) > STALE_TEST_DAYS * 86400_000;
  const problem = !loading && !missing && (backupStale || lastFailed || (lastTest && !lastTest.ok));
  const border = loading || missing ? "border-l-slate-300" : problem ? "border-l-red-500" : "border-l-emerald-500";

  return (
    <Card className={`shadow-sm border-l-4 ${border}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup size={18} className={problem ? "text-red-500" : "text-emerald-600"} />
          Yedekleme
        </CardTitle>
        {!loading && !missing && (
          problem
            ? <span className="flex items-center gap-1 text-xs font-bold text-red-600"><AlertTriangle size={13} /> Kontrol et</span>
            : <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 size={13} /> Sağlıklı</span>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-3 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2"><Loader2 size={14} className="animate-spin" /> Yükleniyor…</div>
        ) : missing ? (
          <p className="text-xs text-muted-foreground">Yedek kayıt tablosu henüz yok (migration 20260928000001 çalıştırılmalı).</p>
        ) : (
          <>
            {/* Son yedek */}
            <div className={`rounded-xl p-3 ${backupStale || lastFailed ? "bg-red-50" : "bg-emerald-50/60"}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Son başarılı yedek</p>
              {lastOk ? (
                <>
                  <p className="font-bold text-slate-900">{new Date(lastOk.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {ago(lastOk.created_at)}</p>
                  <p className="text-xs text-slate-500">
                    Sunucu {lastOk.local_ok ? "✓" : "✗"} · Google Drive (şifreli) {lastOk.offsite_ok ? "✓" : "✗"} · Veritabanı {size(lastOk.db_bytes)} · Görseller {size(lastOk.storage_bytes)}
                  </p>
                </>
              ) : <p className="font-bold text-red-700">Hiç başarılı yedek kaydı yok</p>}
              {backupStale && lastOk && (
                <p className="text-xs font-bold text-red-700 mt-1">⚠ {STALE_BACKUP_H} saatten eski — gece yedeği çalışmamış olabilir.</p>
              )}
              {lastFailed && (
                <p className="text-xs font-bold text-red-700 mt-1">⚠ Son deneme başarısız: {lastBackup.message}</p>
              )}
            </div>

            {/* Son geri yükleme testi */}
            <div className={`rounded-xl p-3 ${lastTest && !lastTest.ok ? "bg-red-50" : "bg-slate-50"}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Son geri yükleme testi</p>
              {lastTest ? (
                <>
                  <p className="font-bold text-slate-900">{lastTest.ok ? "✓ Başarılı" : "✗ Sorunlu"} · {ago(lastTest.created_at)}</p>
                  <p className="text-xs text-slate-500">{lastTest.message}</p>
                  {testStale && <p className="text-xs text-amber-700 mt-1">Haftalık test {STALE_TEST_DAYS} günden eski.</p>}
                </>
              ) : <p className="text-xs text-slate-500">Henüz otomatik test kaydı yok.</p>}
            </div>

            {/* Son 7 gece */}
            {recent.length > 0 && (
              <div className="flex items-center gap-1" title="Son yedekler (soldan yeniye)">
                {[...recent].reverse().map((r) => (
                  <span key={r.id} title={`${new Date(r.created_at).toLocaleString("tr-TR")} — ${r.ok ? "OK" : r.message}`}
                    className={`h-2 flex-1 rounded-full ${r.ok ? "bg-emerald-400" : "bg-red-400"}`} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
