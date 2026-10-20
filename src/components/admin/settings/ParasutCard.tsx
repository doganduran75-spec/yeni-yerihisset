"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Ayarlar › Entegrasyonlar › Paraşüt (ön muhasebe — fatura). src/lib/parasut.ts
//   1) Client ID / Secret (destek@parasut.com verir) + firma no → Kaydet
//   2) "Paraşüt’te izin ver" → Paraşüt’ün gösterdiği kodu yapıştır → Bağlan (şifre sunucuya yazılmaz)
//   3) Kanal ayarları: tahsilat hesabı (kasa/banka), tahsil edildi, e-Arşiv internet satışı bilgileri
//   4) Kargo firmalarının VKN’si (e-Arşiv internet satışında zorunlu)
//   5) Ürün eşleştirme: /admin/parasut
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import IntegrationSection from "@/components/admin/settings/IntegrationSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { Receipt, Loader2, ExternalLink, CheckCircle2, Link2, Plus } from "lucide-react";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
async function api(body: Record<string, unknown>) {
  const r = await fetch("/api/admin/parasut", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Paraşüt hatası");
  return j;
}

const CH_LABEL: Record<string, string> = { site: "YeriHisset (site)", trendyol: "Trendyol", hepsiburada: "Hepsiburada", amazon: "Amazon" };
const PAY_TYPES = [
  ["", "Siparişin ödeme yönteminden (kart / havale)"],
  ["KREDIKARTI/BANKAKARTI", "Kredi / banka kartı"],
  ["EFT/HAVALE", "EFT / havale"],
  ["ODEMEARACISI", "Ödeme aracısı (pazaryeri)"],
  ["KAPIDAODEME", "Kapıda ödeme"],
];

type Ch = { channel: string; account_id: string | null; account_name: string | null; category_id?: string | null; category_name?: string | null; mark_paid: boolean; payment_type: string | null; payment_platform: string | null; internet_url: string | null };
type Carrier = { name: string; vkn: string | null };

export default function ParasutCard() {
  const [f, setF] = useState({ parasut_enabled: false, parasut_client_id: "", parasut_client_secret: "", parasut_company_id: "", parasut_shipment_included: true, parasut_shipping_product_id: "" });
  const [pps, setPps] = useState<{ parasut_id: string; name: string | null; code: string | null; vat_rate: number | null }[]>([]);
  const [st, setSt] = useState<any>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [chs, setChs] = useState<Ch[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string; type: string | null }[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [newCarrier, setNewCarrier] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/settings", { headers: await authHeaders(), cache: "no-store" });
    const d = (await r.json().catch(() => ({})))?.settings || {};
    setF({
      parasut_enabled: !!d.parasut_enabled, parasut_client_id: d.parasut_client_id ?? "", parasut_client_secret: d.parasut_client_secret ?? "",
      parasut_company_id: d.parasut_company_id ?? "", parasut_shipment_included: d.parasut_shipment_included !== false,
      parasut_shipping_product_id: d.parasut_shipping_product_id ?? "",
    });
    const sb = supabase as any;
    const [{ data: c }, { data: k }, { data: p }] = await Promise.all([
      sb.from("parasut_channel_settings").select("*").order("channel"),
      sb.from("cargo_carriers").select("name, vkn").order("name"),
      sb.from("parasut_products").select("parasut_id, name, code, vat_rate").eq("archived", false).order("name").limit(2000),
    ]);
    setPps((p as any[]) || []);
    setChs(((c as Ch[]) || []).sort((a, b) => Object.keys(CH_LABEL).indexOf(a.channel) - Object.keys(CH_LABEL).indexOf(b.channel)));
    setCarriers((k as Carrier[]) || []);
    try {
      const s = await api({ op: "status" });
      setSt(s);
      if (s.connected) {
        setAccounts((await api({ op: "accounts" })).accounts || []);
        setCats((await api({ op: "categories" }).catch(() => ({ categories: [] }))).categories || []);
      }
    } catch (e: any) { setSt({ error: e?.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveSettings(patch?: Partial<typeof f>) {
    const next = { ...f, ...(patch || {}) };
    setBusy("save");
    try {
      const r = await fetch("/api/admin/settings", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ settings: { ...next, parasut_client_id: next.parasut_client_id.trim(), parasut_client_secret: next.parasut_client_secret.trim(), parasut_company_id: next.parasut_company_id.trim() } }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Kaydedilemedi");
      setF(next);
      setSt(await api({ op: "status" }));
    } catch (e: any) { siteAlert({ title: "Kaydedilemedi", message: e?.message, tone: "danger" }); }
    finally { setBusy(null); }
  }

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    try { await fn(); } catch (e: any) { siteAlert({ title: "Paraşüt", message: e?.message || "Hata", tone: "danger" }); }
    finally { setBusy(null); }
  }

  async function saveChannel(ch: string, patch: Partial<Ch>) {
    setChs((p) => p.map((x) => (x.channel === ch ? { ...x, ...patch } : x)));
    const { error } = await (supabase as any).from("parasut_channel_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("channel", ch);
    if (error) siteAlert({ title: "Kaydedilemedi", message: error.message, tone: "danger" });
  }

  async function saveCarrier(name: string, vkn: string) {
    const v = vkn.replace(/\D/g, "");
    if (v && v.length !== 10) { siteAlert({ message: "VKN 10 haneli olmalı.", tone: "danger" }); return; }
    const { error } = await (supabase as any).from("cargo_carriers").upsert({ name, vkn: v || null, updated_at: new Date().toISOString() });
    if (error) siteAlert({ title: "Kaydedilemedi", message: error.message, tone: "danger" });
    else setCarriers((p) => (p.some((x) => x.name === name) ? p.map((x) => (x.name === name ? { ...x, vkn: v || null } : x)) : [...p, { name, vkn: v || null }].sort((a, b) => a.name.localeCompare(b.name, "tr"))));
  }

  const lbl = "text-xs font-medium";
  return (
    <IntegrationSection id="parasut" icon={<Receipt size={20} className="text-emerald-600" />} title="Paraşüt" summary="Fatura, tahsilat, e-Arşiv / e-Fatura"
      status={st?.connected ? (f.parasut_enabled ? "Bağlı · açık" : "Bağlı · kapalı") : f.parasut_enabled ? "Bağlı değil" : "Kapalı"} tone={st?.connected && f.parasut_enabled ? "ok" : f.parasut_enabled ? "warn" : "off"}
      right={<label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={f.parasut_enabled} disabled={busy === "save"} onChange={(e) => saveSettings({ parasut_enabled: e.target.checked })} /> Açık
          </label>}>
        <p className="text-sm text-muted-foreground">Siparişte “Faturayı kes (Paraşüt)”: müşteri, fatura, tahsilat ve e-Arşiv / e-Fatura Paraşüt’te otomatik oluşur. Kanal (site / pazaryeri) başına ayrı tahsilat hesabı.</p>
        {/* 1) Uygulama bilgileri */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="space-y-1"><span className={lbl}>Client ID</span>
            <Input value={f.parasut_client_id} onChange={(e) => setF({ ...f, parasut_client_id: e.target.value })} autoComplete="off" /></label>
          <label className="space-y-1"><span className={lbl}>Client Secret</span>
            <Input type="password" value={f.parasut_client_secret} onChange={(e) => setF({ ...f, parasut_client_secret: e.target.value })} autoComplete="off" /></label>
          <label className="space-y-1"><span className={lbl}>Firma no</span>
            <Input value={f.parasut_company_id} onChange={(e) => setF({ ...f, parasut_company_id: e.target.value })} placeholder="uygulama.parasut.com/123456 → 123456" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => saveSettings()} disabled={busy === "save"}>{busy === "save" && <Loader2 size={14} className="animate-spin mr-1" />} Kaydet</Button>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.parasut_shipment_included} onChange={(e) => saveSettings({ parasut_shipment_included: e.target.checked })} />
            İrsaliyeli fatura (Paraşüt’teki stok da düşer)</label>
          <span className="text-xs text-muted-foreground">Client ID / Secret: destek@parasut.com’dan istenir.</span>
        </div>

        {/* 2) Bağlantı */}
        <div className="rounded-lg border p-3 space-y-2">
          {st?.connected ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-green-700 font-medium"><CheckCircle2 size={16} /> Bağlı{st.userEmail ? ` — ${st.userEmail}` : ""}</span>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => {
                if (await siteConfirm({ title: "Paraşüt bağlantısı kesilsin mi?", message: "Fatura kesme durur; yeniden bağlanmak için izin adımı tekrarlanır.", confirmText: "Bağlantıyı kes", tone: "danger" }))
                  run("disc", async () => { await api({ op: "disconnect" }); setSt(await api({ op: "status" })); setAccounts([]); });
              }}>Bağlantıyı kes</Button>
            </div>
          ) : st?.authorizeUrl ? (
            <div className="space-y-2">
              <p className="text-xs">1) <a href={st.authorizeUrl} target="_blank" rel="noopener noreferrer" className="underline font-semibold inline-flex items-center gap-1">Paraşüt’te izin ver <ExternalLink size={12} /></a> — giriş yap, “izin ver” de, ekranda çıkan kodu kopyala. 2) Kodu buraya yapıştır:</p>
              <div className="flex gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paraşüt’ün verdiği kod" className="font-mono" />
                <Button size="sm" disabled={!code.trim() || !!busy} onClick={() => run("conn", async () => {
                  const s = await api({ op: "connect", code }); setSt(s); setCode("");
                  setAccounts((await api({ op: "accounts" })).accounts || []);
                })}>{busy === "conn" ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Bağlan</Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Bağlanmak için önce Client ID ve Secret’ı kaydet.</p>
          )}
          {st?.error && <p className="text-xs text-red-600">{st.error}</p>}
        </div>

        {/* Kargo ücreti kalemi */}
        <label className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">Kargo ücreti kalemi (alınırsa):</span>
          <select value={f.parasut_shipping_product_id} className="h-8 rounded-md border px-1 bg-white max-w-[280px]"
            onChange={(e) => saveSettings({ parasut_shipping_product_id: e.target.value })}>
            <option value="">— Paraşüt’teki “Kargo” hizmetini seç —</option>
            {pps.map((p) => <option key={p.parasut_id} value={p.parasut_id}>{p.name}{p.code ? ` (${p.code})` : ""}{p.vat_rate != null ? ` · KDV %${Number(p.vat_rate)}` : ""}</option>)}
          </select>
          <span className="text-muted-foreground">{pps.length ? "KDV oranı Paraşüt kaydından (kargo %20)." : "Liste için önce Ürün eşleştirme › Paraşüt’ten çek."}</span>
        </label>

        {/* 3) Kanal ayarları */}
        <div className="space-y-2">
          <p className="font-semibold">Satış kanalına göre</p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500"><tr>
                <th className="px-2 py-2">Kanal</th><th className="px-2 py-2">Fatura kategorisi</th><th className="px-2 py-2">Tahsilat hesabı (kasa / banka)</th><th className="px-2 py-2">Tahsil edildi</th>
                <th className="px-2 py-2">Ödeme tipi (e-Arşiv)</th><th className="px-2 py-2">Platform</th><th className="px-2 py-2">İnternet adresi</th>
              </tr></thead>
              <tbody className="divide-y">
                {chs.map((c) => (
                  <tr key={c.channel}>
                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{CH_LABEL[c.channel] ?? c.channel}</td>
                    <td className="px-2 py-1.5">
                      {cats.length ? (
                        <select value={c.category_id ?? ""} className="h-8 rounded-md border px-1 bg-white max-w-[180px]"
                          onChange={(e) => { const k = cats.find((x) => x.id === e.target.value); saveChannel(c.channel, { category_id: k?.id ?? null, category_name: k?.name ?? null }); }}>
                          <option value="">— kategorisiz —</option>
                          {cats.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                        </select>
                      ) : <span className="text-muted-foreground">{c.category_name || "bağlanınca seçilir"}</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {accounts.length ? (
                        <select value={c.account_id ?? ""} className="h-8 rounded-md border px-1 bg-white max-w-[200px]"
                          onChange={(e) => { const a = accounts.find((x) => x.id === e.target.value); saveChannel(c.channel, { account_id: a?.id ?? null, account_name: a?.name ?? null }); }}>
                          <option value="">— seç —</option>
                          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.type === "bank" ? " (banka)" : a.type === "cash" ? " (kasa)" : ""}</option>)}
                        </select>
                      ) : <span className="text-muted-foreground">{c.account_name || "bağlanınca seçilir"}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={c.mark_paid} onChange={(e) => saveChannel(c.channel, { mark_paid: e.target.checked })} /></td>
                    <td className="px-2 py-1.5">
                      <select value={c.payment_type ?? ""} className="h-8 rounded-md border px-1 bg-white max-w-[190px]" onChange={(e) => saveChannel(c.channel, { payment_type: e.target.value || null })}>
                        {PAY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5"><Input defaultValue={c.payment_platform ?? ""} className="h-8 w-28 text-xs" onBlur={(e) => e.target.value !== (c.payment_platform ?? "") && saveChannel(c.channel, { payment_platform: e.target.value.trim() || null })} /></td>
                    <td className="px-2 py-1.5"><Input defaultValue={c.internet_url ?? ""} className="h-8 w-48 text-xs" onBlur={(e) => e.target.value !== (c.internet_url ?? "") && saveChannel(c.channel, { internet_url: e.target.value.trim() || null })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4) Kargo firmaları */}
        <div className="space-y-2">
          <p className="font-semibold">Kargo firmalarının vergi numarası <span className="font-normal text-xs text-muted-foreground">(e-Arşiv internet satışında zorunlu; firma adı siparişteki kargo firmasıyla eşleşir)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {carriers.map((c) => (
              <label key={c.name} className="flex items-center gap-2">
                <span className="w-36 text-xs font-medium">{c.name}</span>
                <Input defaultValue={c.vkn ?? ""} placeholder="VKN (10 hane)" inputMode="numeric" className={`h-8 text-xs font-mono ${c.vkn ? "" : "border-amber-300"}`}
                  onBlur={(e) => e.target.value.replace(/\D/g, "") !== (c.vkn ?? "") && saveCarrier(c.name, e.target.value)} />
              </label>
            ))}
          </div>
          <div className="flex gap-2 max-w-sm">
            <Input value={newCarrier} onChange={(e) => setNewCarrier(e.target.value)} placeholder="Başka kargo firması adı" className="h-8 text-xs" />
            <Button size="sm" variant="outline" disabled={!newCarrier.trim()} onClick={() => { saveCarrier(newCarrier.trim(), ""); setNewCarrier(""); }}><Plus size={14} /> Ekle</Button>
          </div>
        </div>

        <Link href="/admin/parasut" className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline">Ürün eşleştirme (her numara = bir Paraşüt ürünü) →</Link>
      </IntegrationSection>
  );
}
