"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Cookie } from "lucide-react";

// Ayarlar › Çerez onayı — settings.cookie_consent_strict (migration 20261109000001)
//  KAPALI (deneme modu): seçim yapılana kadar tam ziyaret kaydı (IP dahil); "Reddet" → o ziyaret anonimleşir.
//  AÇIK (KVKK modu): istatistik izni verilene kadar yalnız kimliksiz sayım.
// Altında son 30 günün seçim oranları (Kabul / Red / Kısmi / Seçim yok) ve kimliksiz görüntüleme sayısı.
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function CookieConsentTab() {
  const [strict, setStrict] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [stats, setStats] = useState<{ accepted: number; rejected: number; custom: number; none: number; anonViews: number } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/settings", { headers: await authHeaders(), cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    setStrict(d?.settings?.cookie_consent_strict === true);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const count = async (f: (q: any) => any) => (await f((supabase as any).from("analytics_sessions").select("session_id", { count: "exact", head: true }).eq("is_bot", false).gte("started_at", since))).count || 0;
    const [accepted, rejected, custom, none, anon] = await Promise.all([
      count((q) => q.eq("consent", "accepted")),
      count((q) => q.eq("consent", "rejected")),
      count((q) => q.eq("consent", "custom")),
      count((q) => q.is("consent", null)),
      (supabase as any).from("analytics_anon_daily").select("views").gte("day", since.slice(0, 10)).limit(10000),
    ]);
    const anonViews = ((anon.data as any[]) || []).reduce((s, r) => s + Number(r.views || 0), 0);
    setStats({ accepted, rejected, custom, none, anonViews });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(v: boolean) {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ settings: { cookie_consent_strict: v } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || "Kaydedilemedi");
      setStrict(v);
      setMsg({ ok: true, text: "Kaydedildi. Ziyaretçilerde en geç 1–2 dakikada geçerli olur." });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Kaydedilemedi" });
    } finally { setSaving(false); }
  }

  if (strict === null) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  const total = stats ? stats.accepted + stats.rejected + stats.custom + stats.none : 0;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "—");

  return (
    <div className="space-y-6">
      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Cookie size={18} /> Çerez onayı</CardTitle>
          <CardDescription>Ziyaretçi çerez penceresinde seçim yapmadığında ziyaret nasıl kaydedilsin?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer ${!strict ? "border-olive-400 bg-olive-50/50" : ""}`}>
            <input type="radio" checked={!strict} onChange={() => setStrict(false)} className="mt-1" />
            <span>
              <b>Kapalı — deneme modu</b> (şu anki)
              <span className="block text-muted-foreground mt-1">Ziyaretçi seçim yapana kadar tam ziyaret kaydı tutulur (IP, cihaz, gezdiği sayfalar). &quot;Kabul Et&quot; → devam eder. &quot;Reddet&quot; → o ziyaretin kaydı anonimleşir (IP silinir), sonrası yalnız sayılır.</span>
            </span>
          </label>
          <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer ${strict ? "border-olive-400 bg-olive-50/50" : ""}`}>
            <input type="radio" checked={strict} onChange={() => setStrict(true)} className="mt-1" />
            <span>
              <b>Açık — KVKK modu</b> (canlıda önerilen)
              <span className="block text-muted-foreground mt-1">İstatistik izni verilene kadar yalnız kimliksiz sayım yapılır (IP ve kişi bilgisi yok). Tam ziyaret kaydı yalnız &quot;Kabul Et&quot; ya da istatistik izni verenlerde.</span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">Meta Pixel ve Google Analytics iki modda da yalnız izinle çalışır. Çerez penceresi iki modda da görünür.</p>
          <div className="flex items-center gap-3">
            <Button disabled={saving} onClick={() => save(strict)} className="gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
            </Button>
            {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle className="text-base">Son 30 gün — ziyaretçilerin seçimi</CardTitle>
          <CardDescription>Bot olmayan ziyaretler. Ayrıntı ve ziyaret bazında görünüm: İstatistikler (IP&apos;nin yanında).</CardDescription>
        </CardHeader>
        <CardContent>
          {!stats ? <Loader2 className="animate-spin text-slate-400" /> : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
              {[
                ["Kabul", stats.accepted, "text-green-700"],
                ["Kısmi", stats.custom, "text-blue-700"],
                ["Red", stats.rejected, "text-red-700"],
                ["Seçim yok", stats.none, "text-slate-600"],
              ].map(([l, n, c]) => (
                <div key={l as string} className="rounded-xl border p-3">
                  <p className={`text-2xl font-black ${c}`}>{pct(n as number)}</p>
                  <p className="text-xs text-muted-foreground">{l} · {n as number}</p>
                </div>
              ))}
              <div className="rounded-xl border p-3">
                <p className="text-2xl font-black text-slate-700">{stats.anonViews}</p>
                <p className="text-xs text-muted-foreground">kimliksiz görüntüleme</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
