"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Ayarlar › Entegrasyonlar: Trendyol (stok senkronu) + Kargonomi (kargo).
// Ayarlar /api/admin/settings ile okunur/yazılır (gizli kolonlar yalnız sunucuda).
// Her kart YALNIZ kendi alanlarını kaydeder (başka sekmenin ayarını ezmez).
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import {
  Loader2, Save, Eye, EyeOff, Truck, Store, RefreshCw, Send, PlugZap, AlertTriangle, CheckCircle2, Info, RotateCcw,
} from "lucide-react";

type IntegrationSettings = {
  trendyol_enabled: boolean;
  trendyol_seller_id: string;
  trendyol_api_key: string;
  trendyol_api_secret: string;
  trendyol_stage: boolean;
  kargonomi_enabled: boolean;
  kargonomi_api_token: string;
  kargonomi_warehouse_id: string;
};

const DEFAULTS: IntegrationSettings = {
  trendyol_enabled: false, trendyol_seller_id: "", trendyol_api_key: "", trendyol_api_secret: "", trendyol_stage: false,
  kargonomi_enabled: true, kargonomi_api_token: "", kargonomi_warehouse_id: "",
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const fmtTime = (s: string | null) =>
  s ? new Date(s).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-2 rounded-full h-8 text-xs font-bold transition-colors ${on ? "bg-green-600 text-white flex-row-reverse pl-3 pr-1" : "bg-slate-200 text-slate-600 pl-1 pr-3"} disabled:opacity-50`}
      aria-pressed={on}
    >
      <span className="w-6 h-6 rounded-full bg-white shadow" />
      {on ? "Açık" : "Kapalı"}
    </button>
  );
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-10" autoComplete="off" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-700">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function IntegrationsTab() {
  const [s, setS] = useState<IntegrationSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<"trendyol" | "kargonomi" | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const set = (f: Partial<IntegrationSettings>) => setS((p) => ({ ...p, ...f }));

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/integrations/trendyol", { headers: await authHeaders(), cache: "no-store" });
      const j = await r.json();
      if (r.ok) setStatus(j);
    } catch { /* durum kritik değil */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/settings", { headers: await authHeaders(), cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Ayarlar okunamadı");
        const d = j.settings || {};
        setS({
          trendyol_enabled: !!d.trendyol_enabled,
          trendyol_seller_id: d.trendyol_seller_id ?? "",
          trendyol_api_key: d.trendyol_api_key ?? "",
          trendyol_api_secret: d.trendyol_api_secret ?? "",
          trendyol_stage: !!d.trendyol_stage,
          kargonomi_enabled: d.kargonomi_enabled !== false,
          kargonomi_api_token: d.kargonomi_api_token ?? "",
          kargonomi_warehouse_id: d.kargonomi_warehouse_id ?? "",
        });
      } catch (e: any) {
        setLoadError(e?.message || "Ayarlar okunamadı");
      } finally {
        setLoading(false);
      }
    })();
    loadStatus();
  }, [loadStatus]);

  // Trendyol açıkken durum paneli 15 sn'de bir tazelensin
  useEffect(() => {
    if (!s.trendyol_enabled) return;
    const t = setInterval(loadStatus, 15000);
    return () => clearInterval(t);
  }, [s.trendyol_enabled, loadStatus]);

  async function save(which: "trendyol" | "kargonomi", patch?: Partial<IntegrationSettings>) {
    if (loadError) {
      siteAlert({ title: "Ayarlar yüklenemedi", message: "Mevcut ayarlar okunamadığı için kayıt yapılmadı. Sayfayı yenileyip tekrar dene.", tone: "danger" });
      return false;
    }
    const next = { ...s, ...(patch || {}) };
    const keys = (Object.keys(next) as (keyof IntegrationSettings)[]).filter((k) => k.startsWith(which + "_"));
    const payload: Record<string, unknown> = {};
    for (const k of keys) payload[k] = typeof next[k] === "string" ? (next[k] as string).trim() : next[k];
    setSavingKey(which);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ settings: payload }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Kaydedilemedi");
      setS(next);
      loadStatus();
      return true;
    } catch (e: any) {
      siteAlert({ title: "Kaydedilemedi", message: e?.message || "Kaydedilemedi", tone: "danger" });
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleTrendyol(on: boolean) {
    if (on && !(s.trendyol_seller_id && s.trendyol_api_key && s.trendyol_api_secret)) {
      siteAlert({ title: "Bilgiler eksik", message: "Açmadan önce Satıcı ID, API Key ve API Secret'ı girip kaydet.", tone: "danger" });
      return;
    }
    if (!on && !(await siteConfirm({ title: "Trendyol senkronu kapatılsın mı?", message: "Kapalıyken stok değişiklikleri Trendyol'a gönderilmez; değişiklikler kuyrukta bekler ve tekrar açtığında gönderilir.", confirmText: "Kapat" }))) return;
    const ok = await save("trendyol", { trendyol_enabled: on });
    if (ok && on) {
      siteAlert({
        title: "Trendyol senkronu açık",
        message: "Bundan sonra stok değişiklikleri otomatik gönderilecek. İlk kez açtıysan “Tüm stokları gönder” ile Trendyol'u sitedeki stoklarla bir kez eşitle.",
        tone: "success",
      });
    }
  }

  async function act(action: "test" | "sync" | "full" | "retry") {
    if (action === "full" && !(await siteConfirm({
      title: "Tüm stoklar gönderilsin mi?",
      message: `Barkodlu ${status?.variants?.withBarcode ?? "tüm"} varyantın sitedeki stoğu Trendyol'a yazılacak (Trendyol'daki stok, sitedekiyle değiştirilir). Aynı gönderimi 15 dakika içinde tekrarlama.`,
      confirmText: "Gönder",
    }))) return;
    setBusy(action);
    try {
      const r = await fetch("/api/admin/integrations/trendyol", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "İşlem başarısız");
      if (action === "test") {
        siteAlert({ title: "Bağlantı başarılı", message: `Trendyol hesabına bağlanıldı${j.totalProducts != null ? ` — Trendyol'da ${j.totalProducts} ürün görünüyor` : ""}.`, tone: "success" });
      } else if (j.skipped === "disabled") {
        siteAlert({ message: "Trendyol senkronu kapalı — önce açın.", tone: "danger" });
      } else if (j.skipped === "no_credentials") {
        siteAlert({ message: "Trendyol bilgileri eksik.", tone: "danger" });
      } else if (j.errors?.length) {
        siteAlert({ title: "Gönderimde hata", message: j.errors[0], tone: "danger" });
      } else {
        const q = action === "full" ? `${j.queued} varyant kuyruğa alındı. ` : "";
        siteAlert({ message: `${q}${j.sent} barkod Trendyol'a gönderildi. Sonuçlar birkaç saniye içinde aşağıda görünür.`, tone: "success" });
      }
    } catch (e: any) {
      siteAlert({ title: action === "test" ? "Bağlantı başarısız" : "Hata", message: e?.message || "İşlem başarısız", tone: "danger" });
    } finally {
      setBusy(null);
      loadStatus();
    }
  }

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const c = status?.counts || {};
  const inFlight = (c.pending || 0) + (c.sending || 0) + (c.sent || 0);

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Ayarlar okunamadı: {loadError}</p>
      )}

      {/* ─── Trendyol ─── */}
      <Card className="shadow-sm border-muted">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store size={20} className="text-orange-500" /> Trendyol — Stok Senkronu
              </CardTitle>
              <CardDescription className="mt-1">
                Sitede bir ürünün stoğu değişince (ürün sayfası, site siparişi, iptal/iade, toplu içe aktarma) aynı barkodlu ürünün
                Trendyol stoğu otomatik güncellenir.
              </CardDescription>
            </div>
            <Toggle on={s.trendyol_enabled} onChange={toggleTrendyol} disabled={savingKey === "trendyol"} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Satıcı ID (Cari ID)</label>
              <Input value={s.trendyol_seller_id} onChange={(e) => set({ trendyol_seller_id: e.target.value.replace(/\D/g, "") })} placeholder="Örn: 123456" inputMode="numeric" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <SecretInput value={s.trendyol_api_key} onChange={(v) => set({ trendyol_api_key: v })} placeholder="••••••••••••" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">API Secret</label>
              <SecretInput value={s.trendyol_api_secret} onChange={(v) => set({ trendyol_api_secret: v })} placeholder="••••••••••••" />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 text-sm text-orange-900 space-y-2">
            <p className="font-semibold">Bu bilgileri nereden alırım?</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-orange-800">
              <li><a href="https://partner.trendyol.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">partner.trendyol.com</a> satıcı paneline giriş yap.</li>
              <li>Sağ üstte hesap menüsü → <strong>Hesap Bilgilerim</strong> → <strong>Entegrasyon Bilgileri</strong>.</li>
              <li><strong>Satıcı ID</strong>, <strong>API Key</strong> ve <strong>API Secret</strong>'ı kopyalayıp buraya yapıştır. (Secret yalnız oluşturulurken bir kez gösterilir; kaybettiysen yenisini oluştur.)</li>
              <li><strong>Kaydet</strong> → <strong>Bağlantıyı Test Et</strong> → sonra sağ üstten senkronu <strong>Aç</strong>.</li>
            </ol>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={s.trendyol_stage} onChange={(e) => set({ trendyol_stage: e.target.checked })} className="h-3.5 w-3.5" />
            Test ortamı (Trendyol stage — yalnız Trendyol'un verdiği test hesabıyla; normalde işaretsiz)
          </label>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save("trendyol").then((ok) => { if (ok) siteAlert({ message: "Trendyol bilgileri kaydedildi.", tone: "success" }); })} disabled={savingKey === "trendyol"} className="gap-2">
              {savingKey === "trendyol" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Kaydet
            </Button>
            <Button variant="outline" onClick={() => act("test")} disabled={!!busy} className="gap-2">
              {busy === "test" ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />} Bağlantıyı Test Et
            </Button>
          </div>

          {/* Durum paneli */}
          <div className="rounded-xl border bg-slate-50/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                Senkron Durumu
                {!s.trendyol_enabled && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">KAPALI — değişiklikler kuyrukta bekler</span>}
              </p>
              <button onClick={loadStatus} className="text-xs text-muted-foreground hover:text-slate-800 flex items-center gap-1"><RefreshCw size={12} /> Yenile</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg bg-white border p-3"><p className="text-xl font-black text-amber-600">{inFlight}</p><p className="text-[11px] text-muted-foreground">Gönderilecek / doğrulanıyor</p></div>
              <div className="rounded-lg bg-white border p-3"><p className="text-xl font-black text-green-600">{c.ok || 0}</p><p className="text-[11px] text-muted-foreground">Trendyol'da güncel</p></div>
              <div className="rounded-lg bg-white border p-3"><p className="text-xl font-black text-red-600">{c.failed || 0}</p><p className="text-[11px] text-muted-foreground">Hatalı</p></div>
              <div className="rounded-lg bg-white border p-3"><p className="text-xl font-black text-slate-700">{status?.variants?.withoutBarcode ?? "—"}</p><p className="text-[11px] text-muted-foreground">Barkodsuz varyant (gönderilemez)</p></div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
              <span>Son gönderim: <b>{fmtTime(status?.lastSentAt ?? null)}</b></span>
              <span>Son doğrulama: <b>{fmtTime(status?.lastConfirmedAt ?? null)}</b></span>
              <span>Barkodlu varyant: <b>{status?.variants?.withBarcode ?? "—"}</b></span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => act("sync")} disabled={!!busy || !s.trendyol_enabled} className="gap-1.5">
                {busy === "sync" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Bekleyenleri şimdi gönder
              </Button>
              <Button size="sm" variant="outline" onClick={() => act("full")} disabled={!!busy || !s.trendyol_enabled} className="gap-1.5">
                {busy === "full" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Tüm stokları gönder (eşitle)
              </Button>
              {(c.failed || 0) > 0 && (
                <Button size="sm" variant="outline" onClick={() => act("retry")} disabled={!!busy || !s.trendyol_enabled} className="gap-1.5 text-red-700 border-red-200">
                  {busy === "retry" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Hatalıları tekrar dene
                </Button>
              )}
            </div>

            {(status?.failures?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-red-700 flex items-center gap-1"><AlertTriangle size={13} /> Sorunlu kayıtlar</p>
                <div className="rounded-lg border bg-white divide-y max-h-72 overflow-y-auto">
                  {status.failures.map((f: any) => (
                    <div key={f.id} className="px-3 py-2 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="font-semibold text-slate-800">{f.title}{f.label ? ` · ${f.label}` : ""}</span>
                      <span className="font-mono text-slate-500">{f.barcode}</span>
                      <span className="text-slate-500">stok {f.desired_qty}</span>
                      <span className={f.status === "failed" ? "text-red-600" : "text-amber-600"}>
                        {f.status === "failed" ? "Hata" : `Tekrar denenecek (${f.attempts}. deneme)`}: {f.error || "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  “Barkod bulunamadı” türü hatalar: bu barkod Trendyol'da yok ya da farklı yazılmış → ürün sayfasındaki barkodu Trendyol'dakiyle aynı yap.
                </p>
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-900 space-y-1.5">
            <p className="font-semibold text-sm flex items-center gap-1.5"><Info size={14} /> Nasıl çalışır?</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Eşleştirme <b>barkodla</b> yapılır: ürün sayfasındaki varyant barkodu, Trendyol'daki ürünün barkoduyla aynı olmalı.</li>
              <li>Stok değişince birkaç saniye içinde gönderilir; ayrıca dakikada bir otomatik kontrol, kaçan veya hata alanları tekrar dener.</li>
              <li>Yalnız <b>stok</b> gönderilir; Trendyol fiyatına dokunulmaz.</li>
              <li className="text-amber-800"><b>Önemli:</b> Trendyol'da gelen siparişler şimdilik sitedeki stoğu <b>düşürmez</b>. Trendyol'da satış olunca sitedeki stoğu elle azalt — yoksa bir sonraki gönderim Trendyol stoğunu eski sayıya geri yazar. (Sonraki adım: Trendyol siparişlerini otomatik çekip stoğu düşürmek.)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ─── Kargonomi ─── */}
      <Card className="shadow-sm border-muted">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck size={20} className="text-blue-600" /> Kargonomi — Kargo
              </CardTitle>
              <CardDescription className="mt-1">
                Siparişler ekranındaki “Kargoya Ver (Kargonomi)” için API bağlantısı. Token ve Depo ID Kargonomi panelinden alınır.
              </CardDescription>
            </div>
            <Toggle on={s.kargonomi_enabled} onChange={(v) => save("kargonomi", { kargonomi_enabled: v })} disabled={savingKey === "kargonomi"} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">API Token (Bearer)</label>
              <SecretInput value={s.kargonomi_api_token} onChange={(v) => set({ kargonomi_api_token: v })} placeholder="••••••••••••••••••••" />
              <p className="text-xs text-muted-foreground">Kargonomi Panel → Entegrasyonlar → API Anahtarları</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Depo ID (Warehouse ID)</label>
              <Input value={s.kargonomi_warehouse_id} onChange={(e) => set({ kargonomi_warehouse_id: e.target.value })} placeholder="Örn: 123" />
              <p className="text-xs text-muted-foreground">Kargonomi Panel → Depolar bölümündeki depo numarası</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 text-sm text-orange-800 space-y-2">
            <p className="font-semibold flex items-center gap-2"><Truck size={15} /> Kargonomi Bağlantı Adımları</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-orange-700">
              <li><a href="https://app.kargonomi.com.tr" target="_blank" rel="noopener noreferrer" className="underline font-medium">app.kargonomi.com.tr</a> adresine giriş yapın.</li>
              <li>Sağ üst menüden <strong>Entegrasyonlar → API Anahtarları</strong> bölümüne gidin.</li>
              <li>Yeni bir API anahtarı oluşturun ve yukarıdaki <strong>API Token</strong> alanına yapıştırın.</li>
              <li><strong>Depolar</strong> bölümünden sevkiyatın yapılacağı deponun ID numarasını alın.</li>
              <li>Kaydedin. Siparişler ekranındaki <strong>Kargoya Ver</strong> butonu artık çalışır.</li>
            </ol>
          </div>

          {!s.kargonomi_enabled ? (
            <div className="flex items-center gap-2 bg-slate-100 border rounded-lg px-4 py-3 text-sm text-slate-600 font-medium">
              <Info size={16} className="shrink-0" /> Kargonomi kapalı — “Kargoya Ver (Kargonomi)” çalışmaz; manuel kargo işaretleme kullanılabilir.
            </div>
          ) : s.kargonomi_api_token && s.kargonomi_warehouse_id ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 font-medium">
              <CheckCircle2 size={16} className="shrink-0 text-green-600" /> Kargonomi yapılandırılmış. Siparişler ekranından kargo oluşturabilirsiniz.
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button onClick={() => save("kargonomi").then((ok) => { if (ok) siteAlert({ message: "Kargonomi bilgileri kaydedildi.", tone: "success" }); })} disabled={savingKey === "kargonomi"} className="gap-2">
              {savingKey === "kargonomi" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Kaydet
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
