"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Ayarlar › Entegrasyonlar: Trendyol + Hepsiburada (stok senkronu) + Kargonomi (kargo).
// Ayarlar /api/admin/settings ile okunur/yazılır (gizli kolonlar yalnız sunucuda).
// Her kart YALNIZ kendi alanlarını kaydeder (başka kartın/sekmenin ayarını ezmez).
// Kanal durumu/işlemleri: /api/admin/integrations/<kanal>.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import HepsiburadaTestCenter from "@/components/admin/settings/HepsiburadaTestCenter";
import {
  Loader2, Save, Eye, EyeOff, Truck, Store, RefreshCw, Send, PlugZap, AlertTriangle, CheckCircle2, Info, RotateCcw, History,
} from "lucide-react";

type IntegrationSettings = {
  trendyol_enabled: boolean;
  trendyol_seller_id: string;
  trendyol_api_key: string;
  trendyol_api_secret: string;
  trendyol_stage: boolean;
  hepsiburada_enabled: boolean;
  hepsiburada_merchant_id: string;
  hepsiburada_service_key: string;
  hepsiburada_username: string;
  hepsiburada_match_field: "barcode" | "sku";
  hepsiburada_stage: boolean;
  kargonomi_enabled: boolean;
  kargonomi_api_token: string;
  kargonomi_warehouse_id: string;
};
type Group = "trendyol" | "hepsiburada" | "kargonomi";
type Channel = "trendyol" | "hepsiburada";

const DEFAULTS: IntegrationSettings = {
  trendyol_enabled: false, trendyol_seller_id: "", trendyol_api_key: "", trendyol_api_secret: "", trendyol_stage: false,
  hepsiburada_enabled: false, hepsiburada_merchant_id: "", hepsiburada_service_key: "", hepsiburada_username: "",
  hepsiburada_match_field: "barcode", hepsiburada_stage: false,
  kargonomi_enabled: true, kargonomi_api_token: "", kargonomi_warehouse_id: "",
};

const LABEL: Record<Channel, string> = { trendyol: "Trendyol", hepsiburada: "Hepsiburada" };

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

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Kanal durum paneli + işlemler (Trendyol ve Hepsiburada ortak)
function SyncPanel({ channel, enabled }: { channel: Channel; enabled: boolean }) {
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const name = LABEL[channel];

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/integrations/${channel}`, { headers: await authHeaders(), cache: "no-store" });
      const j = await r.json();
      if (r.ok) setStatus(j);
    } catch { /* durum kritik değil */ }
  }, [channel]);

  useEffect(() => { load(); }, [load, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [enabled, load]);

  const keyName = status?.variants?.keyField === "sku" ? "SKU" : "barkod";

  async function act(action: "test" | "sync" | "full" | "retry") {
    if (action === "full" && !(await siteConfirm({
      title: "Tüm stoklar gönderilsin mi?",
      message: `${keyName === "SKU" ? "SKU'lu" : "Barkodlu"} ${status?.variants?.withKey ?? "tüm"} varyantın sitedeki stoğu ${name}'a yazılacak (${name}'daki stok, sitedekiyle değiştirilir).${channel === "trendyol" ? " Aynı gönderimi 15 dakika içinde tekrarlama." : ""}`,
      confirmText: "Gönder",
    }))) return;
    setBusy(action);
    try {
      const r = await fetch(`/api/admin/integrations/${channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "İşlem başarısız");
      if (action === "test") {
        siteAlert({ title: "Bağlantı başarılı", message: `${name} hesabına bağlanıldı${j.totalProducts != null ? ` — ${name}'da ${j.totalProducts} ürün görünüyor` : ""}.`, tone: "success" });
      } else if (j.skipped === "disabled") {
        siteAlert({ message: `${name} senkronu kapalı — önce açın.`, tone: "danger" });
      } else if (j.skipped === "no_credentials") {
        siteAlert({ message: `${name} bağlantı bilgileri eksik.`, tone: "danger" });
      } else if (j.errors?.length) {
        siteAlert({ title: "Gönderimde hata", message: j.errors[0], tone: "danger" });
      } else {
        const q = action === "full" ? `${j.queued} varyant kuyruğa alındı. ` : "";
        siteAlert({ message: `${q}${j.sent} kalem ${name}'a gönderildi. Sonuçlar birkaç saniye içinde aşağıda görünür.`, tone: "success" });
      }
    } catch (e: any) {
      siteAlert({ title: action === "test" ? "Bağlantı başarısız" : "Hata", message: e?.message || "İşlem başarısız", tone: "danger" });
    } finally {
      setBusy(null);
      load();
    }
  }

  const c = status?.counts || {};
  const inFlight = (c.pending || 0) + (c.sending || 0) + (c.sent || 0);

  return (
    <>
      <Button variant="outline" onClick={() => act("test")} disabled={!!busy} className="gap-2">
        {busy === "test" ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />} Bağlantıyı Test Et
      </Button>

      <div className="w-full rounded-xl border bg-slate-50/60 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            Senkron Durumu
            {!enabled && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">KAPALI — değişiklikler kuyrukta bekler</span>}
          </p>
          <div className="flex items-center gap-3">
            <Link href={`/admin/stock-sync?tab=sync&channel=${channel}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><History size={12} /> Senkron geçmişi</Link>
            <button onClick={load} className="text-xs text-muted-foreground hover:text-slate-800 flex items-center gap-1"><RefreshCw size={12} /> Yenile</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="rounded-lg bg-white border p-3"><p className="text-xl font-black text-amber-600">{inFlight}</p><p className="text-[11px] text-muted-foreground">Gönderilecek / doğrulanıyor</p></div>
          <div className="rounded-lg bg-white border p-3"><p className="text-xl font-black text-green-600">{c.ok || 0}</p><p className="text-[11px] text-muted-foreground">{name}'da güncel</p></div>
          <div className="rounded-lg bg-white border p-3"><p className="text-xl font-black text-red-600">{c.failed || 0}</p><p className="text-[11px] text-muted-foreground">Hatalı</p></div>
          <div className="rounded-lg bg-white border p-3"><p className="text-xl font-black text-slate-700">{status?.variants?.withoutKey ?? "—"}</p><p className="text-[11px] text-muted-foreground">{keyName}suz varyant (gönderilemez)</p></div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
          <span>Son gönderim: <b>{fmtTime(status?.lastSentAt ?? null)}</b></span>
          <span>Son doğrulama: <b>{fmtTime(status?.lastConfirmedAt ?? null)}</b></span>
          <span>Eşleşen ({keyName}lu) varyant: <b>{status?.variants?.withKey ?? "—"}</b></span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => act("sync")} disabled={!!busy || !enabled} className="gap-1.5">
            {busy === "sync" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Bekleyenleri şimdi gönder
          </Button>
          <Button size="sm" variant="outline" onClick={() => act("full")} disabled={!!busy || !enabled} className="gap-1.5">
            {busy === "full" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Tüm stokları gönder (eşitle)
          </Button>
          {(c.failed || 0) > 0 && (
            <Button size="sm" variant="outline" onClick={() => act("retry")} disabled={!!busy || !enabled} className="gap-1.5 text-red-700 border-red-200">
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
              “Bulunamadı” türü hatalar: bu {keyName} {name}'da yok ya da farklı yazılmış → ürün sayfasındaki {keyName}u {name}'dakiyle aynı yap.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export default function IntegrationsTab() {
  const [s, setS] = useState<IntegrationSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<Group | null>(null);

  const set = (f: Partial<IntegrationSettings>) => setS((p) => ({ ...p, ...f }));

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
          hepsiburada_enabled: !!d.hepsiburada_enabled,
          hepsiburada_merchant_id: d.hepsiburada_merchant_id ?? "",
          hepsiburada_service_key: d.hepsiburada_service_key ?? "",
          hepsiburada_username: d.hepsiburada_username ?? "",
          hepsiburada_match_field: d.hepsiburada_match_field === "sku" ? "sku" : "barcode",
          hepsiburada_stage: !!d.hepsiburada_stage,
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
  }, []);

  async function save(which: Group, patch?: Partial<IntegrationSettings>) {
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
      return true;
    } catch (e: any) {
      siteAlert({ title: "Kaydedilemedi", message: e?.message || "Kaydedilemedi", tone: "danger" });
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleChannel(channel: Channel, on: boolean) {
    const name = LABEL[channel];
    const ready = channel === "trendyol"
      ? !!(s.trendyol_seller_id && s.trendyol_api_key && s.trendyol_api_secret)
      : !!(s.hepsiburada_merchant_id && s.hepsiburada_service_key && s.hepsiburada_username);
    if (on && !ready) {
      siteAlert({ title: "Bilgiler eksik", message: `Açmadan önce ${name} bağlantı bilgilerini girip kaydet.`, tone: "danger" });
      return;
    }
    if (!on && !(await siteConfirm({ title: `${name} senkronu kapatılsın mı?`, message: `Kapalıyken stok değişiklikleri ${name}'a gönderilmez; değişiklikler kuyrukta bekler ve tekrar açtığında gönderilir.`, confirmText: "Kapat" }))) return;
    const ok = await save(channel, { [`${channel}_enabled`]: on } as Partial<IntegrationSettings>);
    if (ok && on) {
      siteAlert({
        title: `${name} senkronu açık`,
        message: `Bundan sonra stok değişiklikleri otomatik gönderilecek. İlk kez açtıysan “Tüm stokları gönder” ile ${name}'u sitedeki stoklarla bir kez eşitle.`,
        tone: "success",
      });
    }
  }

  async function changeMatchField(v: "barcode" | "sku") {
    if (v === s.hepsiburada_match_field) return;
    const ok = await save("hepsiburada", { hepsiburada_match_field: v });
    if (ok) siteAlert({ message: "Eşleştirme alanı değişti. Kuyruğu yeni alana göre yenilemek için Senkron Durumu'ndan bir kez “Tüm stokları gönder”e bas.", tone: "success" });
  }

  const saveBtn = (g: Group, name: string) => (
    <Button onClick={() => save(g).then((ok) => { if (ok) siteAlert({ message: `${name} bilgileri kaydedildi.`, tone: "success" }); })} disabled={savingKey === g} className="gap-2">
      {savingKey === g ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Kaydet
    </Button>
  );

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Ayarlar okunamadı: {loadError}</p>
      )}

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-900 space-y-1.5">
        <p className="font-semibold text-sm flex items-center gap-1.5"><Info size={14} /> Pazaryeri stok senkronu nasıl çalışır?</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Sitede bir varyantın stoğu değişince (ürün sayfası, site siparişi, iptal/iade, toplu içe aktarma) açık olan her pazaryerine birkaç saniye içinde gönderilir; dakikada bir otomatik kontrol kaçanları ve hataları tekrar dener.</li>
          <li>Yalnız <b>stok</b> gönderilir; pazaryeri fiyatlarına dokunulmaz. Her sonuç “Senkron geçmişi”ne yazılır; Dashboard'daki kart güncelliği özetler.</li>
          <li className="text-amber-800"><b>Önemli:</b> Pazaryerlerinde gelen siparişler şimdilik sitedeki stoğu <b>düşürmez</b>. Pazaryerinde satış olunca sitedeki stoğu elle azalt — yoksa bir sonraki gönderim pazaryeri stoğunu eski sayıya geri yazar.</li>
        </ul>
      </div>

      {/* ─── Trendyol ─── */}
      <Card className="shadow-sm border-muted">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Store size={20} className="text-orange-500" /> Trendyol — Stok Senkronu</CardTitle>
              <CardDescription className="mt-1">Eşleştirme <b>barkodla</b>: ürün sayfasındaki varyant barkodu, Trendyol'daki barkodla aynı olmalı.</CardDescription>
            </div>
            <Toggle on={s.trendyol_enabled} onChange={(v) => toggleChannel("trendyol", v)} disabled={savingKey === "trendyol"} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Satıcı ID (Cari ID)">
              <Input value={s.trendyol_seller_id} onChange={(e) => set({ trendyol_seller_id: e.target.value.replace(/\D/g, "") })} placeholder="Örn: 123456" inputMode="numeric" />
            </Field>
            <Field label="API Key"><SecretInput value={s.trendyol_api_key} onChange={(v) => set({ trendyol_api_key: v })} placeholder="••••••••••••" /></Field>
            <Field label="API Secret"><SecretInput value={s.trendyol_api_secret} onChange={(v) => set({ trendyol_api_secret: v })} placeholder="••••••••••••" /></Field>
          </div>
          <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 text-sm text-orange-900 space-y-2">
            <p className="font-semibold">Bu bilgileri nereden alırım?</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-orange-800">
              <li><a href="https://partner.trendyol.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">partner.trendyol.com</a> satıcı paneline giriş yap.</li>
              <li>Hesap menüsü → <strong>Hesap Bilgilerim</strong> → <strong>Entegrasyon Bilgileri</strong>.</li>
              <li><strong>Satıcı ID</strong>, <strong>API Key</strong> ve <strong>API Secret</strong>'ı buraya yapıştır. (Secret yalnız oluşturulurken bir kez gösterilir.)</li>
              <li><strong>Kaydet</strong> → <strong>Bağlantıyı Test Et</strong> → sağ üstten <strong>Aç</strong> → bir kez <strong>Tüm stokları gönder</strong>.</li>
            </ol>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={s.trendyol_stage} onChange={(e) => set({ trendyol_stage: e.target.checked })} className="h-3.5 w-3.5" />
            Test ortamı (Trendyol stage — yalnız Trendyol'un verdiği test hesabıyla; normalde işaretsiz)
          </label>
          <div className="flex flex-wrap gap-2">
            {saveBtn("trendyol", "Trendyol")}
            <SyncPanel channel="trendyol" enabled={s.trendyol_enabled} />
          </div>
        </CardContent>
      </Card>

      {/* ─── Hepsiburada ─── */}
      <Card className="shadow-sm border-muted">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Store size={20} className="text-orange-600" /> Hepsiburada — Stok Senkronu</CardTitle>
              <CardDescription className="mt-1">
                Eşleştirme Hepsiburada'daki <b>Satıcı Stok Kodu (MerchantSku)</b> ile yapılır; bunun sitedeki karşılığını aşağıdan seç.
              </CardDescription>
            </div>
            <Toggle on={s.hepsiburada_enabled} onChange={(v) => toggleChannel("hepsiburada", v)} disabled={savingKey === "hepsiburada"} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Merchant ID (Mağaza ID)">
              <Input value={s.hepsiburada_merchant_id} onChange={(e) => set({ hepsiburada_merchant_id: e.target.value.trim() })} placeholder="Örn: 1a2b3c4d-…" />
            </Field>
            <Field label="Servis Anahtarı"><SecretInput value={s.hepsiburada_service_key} onChange={(v) => set({ hepsiburada_service_key: v })} placeholder="••••••••••••" /></Field>
            <Field label="Entegratör kullanıcı adı" hint="İsteklerde User-Agent olarak gider.">
              <Input value={s.hepsiburada_username} onChange={(e) => set({ hepsiburada_username: e.target.value.trim() })} placeholder="Örn: yerihisset_dev" />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Hepsiburada'daki Satıcı Stok Kodu, sitedeki hangi alana karşılık geliyor?</p>
            <div className="flex flex-wrap gap-2">
              {([["barcode", "Varyant barkodu"], ["sku", "Varyant SKU / ürün kodu"]] as const).map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => changeMatchField(v)} disabled={savingKey === "hepsiburada"}
                  className={`px-3.5 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${s.hepsiburada_match_field === v ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {lbl}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Emin değilsen Hepsiburada Satıcı Paneli → Ürünlerim listesindeki “Satıcı Stok Kodu” sütununa bak: sitedeki barkodla mı, ürün koduyla mı aynı?</p>
          </div>

          <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 text-sm text-orange-900 space-y-2">
            <p className="font-semibold">Bu bilgileri nereden alırım?</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-orange-800">
              <li><a href="https://merchant.hepsiburada.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">merchant.hepsiburada.com</a> satıcı paneline giriş yap.</li>
              <li><strong>Bilgilerim</strong> → <strong>Entegrasyon</strong> → <strong>Entegratör Bilgileri</strong> sekmesi.</li>
              <li>Kendi entegrasyonunun satırında <strong>Servis Anahtarı</strong>'nı kopyala; aynı yerdeki <strong>kullanıcı adını</strong> ve <strong>Merchant ID</strong>'ni de buraya gir. (Kendi entegrasyonun listede yoksa Hepsiburada entegrasyon destek ekibinden “kendi yazılımımla entegrasyon” için kullanıcı adı iste.)</li>
              <li><strong>Kaydet</strong> → <strong>Bağlantıyı Test Et</strong> → sağ üstten <strong>Aç</strong> → bir kez <strong>Tüm stokları gönder</strong>.</li>
            </ol>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={s.hepsiburada_stage} onChange={(e) => set({ hepsiburada_stage: e.target.checked })} className="h-3.5 w-3.5" />
            Test ortamı (Hepsiburada SIT — yalnız Hepsiburada'nın verdiği test hesabıyla; normalde işaretsiz)
          </label>
          <div className="flex flex-wrap gap-2">
            {saveBtn("hepsiburada", "Hepsiburada")}
            <SyncPanel channel="hepsiburada" enabled={s.hepsiburada_enabled} />
          </div>
          <HepsiburadaTestCenter />
        </CardContent>
      </Card>

      {/* ─── Kargonomi ─── */}
      <Card className="shadow-sm border-muted">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Truck size={20} className="text-blue-600" /> Kargonomi — Kargo</CardTitle>
              <CardDescription className="mt-1">
                Siparişler ekranındaki “Kargoya Ver (Kargonomi)” için API bağlantısı. Token ve Depo ID Kargonomi panelinden alınır.
              </CardDescription>
            </div>
            <Toggle on={s.kargonomi_enabled} onChange={(v) => save("kargonomi", { kargonomi_enabled: v })} disabled={savingKey === "kargonomi"} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="API Token (Bearer)" hint="Kargonomi Panel → Entegrasyonlar → API Anahtarları">
              <SecretInput value={s.kargonomi_api_token} onChange={(v) => set({ kargonomi_api_token: v })} placeholder="••••••••••••••••••••" />
            </Field>
            <Field label="Depo ID (Warehouse ID)" hint="Kargonomi Panel → Depolar bölümündeki depo numarası">
              <Input value={s.kargonomi_warehouse_id} onChange={(e) => set({ kargonomi_warehouse_id: e.target.value })} placeholder="Örn: 123" />
            </Field>
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

          <div className="flex justify-end">{saveBtn("kargonomi", "Kargonomi")}</div>
        </CardContent>
      </Card>
    </div>
  );
}
