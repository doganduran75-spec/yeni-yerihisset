"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Ayarlar › Entegrasyonlar › Google Merchant (Merchant API — anlık ürün gönderimi). src/lib/gmc-sync.ts
//   Besleme (/feed/google-merchant) günlük tam eşitlemeyi sürdürür; API değişen ürünü dakikalar içinde aynı
//   veri kaynağına yazar. Kurulum: servis hesabı JSON + Merchant Center no → Kaydet → "Google'a kaydol" →
//   veri kaynağı (beslemenin kaynağı) seç → Aç → "Tümünü gönder".
import { useCallback, useEffect, useState } from "react";
import IntegrationSection from "@/components/admin/settings/IntegrationSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert } from "@/components/ui/site-dialog";
import { ShoppingBag, Loader2, CheckCircle2, RefreshCw, Send } from "lucide-react";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
async function api(body: Record<string, unknown>) {
  const r = await fetch("/api/admin/gmc", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Google hatası");
  return j;
}

type Src = { name: string; displayName: string; input: string | null; contentLanguage: string | null; feedLabel: string | null };

export default function GmcApiCard() {
  const [merchantId, setMerchantId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [keyJson, setKeyJson] = useState("");
  const [st, setSt] = useState<any>(null);
  const [sources, setSources] = useState<Src[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/settings", { headers: await authHeaders(), cache: "no-store" });
    const d = (await r.json().catch(() => ({})))?.settings || {};
    setMerchantId(d.gmc_merchant_id ?? "");
    setEnabled(!!d.gmc_api_enabled);
    try { setSt(await api({ op: "status" })); } catch (e: any) { setSt({ error: e?.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveSettings(patch: Record<string, unknown>) {
    const r = await fetch("/api/admin/settings", {
      method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ settings: patch }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Kaydedilemedi");
    setSt(await api({ op: "status" }));
  }

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    try { await fn(); } catch (e: any) { siteAlert({ title: "Google Merchant", message: e?.message || "Hata", tone: "danger" }); }
    finally { setBusy(null); }
  }

  const step = (n: number, done: boolean, text: React.ReactNode) => (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${done ? "bg-green-600 text-white" : "bg-slate-200 text-slate-600"}`}>{done ? "✓" : n}</span>
      <div className="flex-1">{text}</div>
    </div>
  );

  return (
    <IntegrationSection id="gmc" icon={<ShoppingBag size={20} className="text-blue-600" />} title="Google Merchant" summary="Stok / fiyat değişince Google’a anlık gönderim"
      status={enabled ? "Açık" : st?.keyOk ? "Kapalı" : "Kurulmadı"} tone={enabled ? "ok" : "off"}
      right={<label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={enabled} disabled={!!busy || !st?.dataSource}
              onChange={(e) => run("en", async () => { await saveSettings({ gmc_api_enabled: e.target.checked }); setEnabled(e.target.checked); })} /> Açık
          </label>}>
        <p className="text-sm text-muted-foreground">Stok, fiyat ya da ürün değişince Google’a dakikalar içinde gider (Merchant API). Besleme adresi günlük tam eşitlemeyi sürdürür; ikisi aynı veri kaynağına yazar.</p>
        {step(1, !!st?.keyOk && !!st?.merchantId, (
          <div className="space-y-2">
            <p>Merchant Center hesap no ve servis hesabı anahtarı (JSON dosyasının içeriği).</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="Merchant Center no (ör. 123456789)" />
              <textarea value={keyJson} onChange={(e) => setKeyJson(e.target.value)} rows={2} autoComplete="off" spellCheck={false}
                placeholder={st?.serviceAccount ? `Kayıtlı: ${st.serviceAccount} (değiştirmek için yeni JSON yapıştır)` : "{ \"type\": \"service_account\", … } — JSON dosyasının tamamı"}
                className="md:col-span-2 rounded-md border px-2 py-1 text-xs font-mono" />
            </div>
            <Button size="sm" disabled={!!busy} onClick={() => run("save", async () => {
              const patch: Record<string, unknown> = { gmc_merchant_id: merchantId.replace(/\D/g, "") };
              if (keyJson.trim()) {
                let j: any;
                try { j = JSON.parse(keyJson); } catch { throw new Error("JSON okunamadı — dosyanın tamamını yapıştır."); }
                if (j?.type !== "service_account" || !j?.client_email || !j?.private_key) throw new Error("Bu bir servis hesabı anahtarı değil (type: service_account, client_email, private_key olmalı).");
                patch.gmc_service_account = keyJson.trim();
              }
              await saveSettings(patch);
              setKeyJson("");
            })}>{busy === "save" && <Loader2 size={14} className="animate-spin mr-1" />} Kaydet</Button>
            {st?.serviceAccount && <p className="text-xs text-muted-foreground">Servis hesabı: <code>{st.serviceAccount}</code> — bunu Merchant Center › Ayarlar › Kişiler ve erişim’e <b>Yönetici</b> olarak ekle.</p>}
          </div>
        ))}
        {step(2, false, (
          <div className="flex flex-wrap items-center gap-2">
            <span>Bir kez: Google Cloud projesini Merchant Center hesabına kaydet.</span>
            <Button size="sm" variant="outline" disabled={!!busy || !st?.keyOk || !st?.merchantId} onClick={() => run("reg", async () => {
              await api({ op: "register" });
              siteAlert({ message: "Kayıt tamam. Google'ın etkinleştirmesi birkaç dakika sürebilir.", tone: "success" });
            })}>{busy === "reg" && <Loader2 size={14} className="animate-spin mr-1" />} Google’a kaydol</Button>
          </div>
        ))}
        {step(3, !!st?.dataSource, (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span>Veri kaynağı: mevcut beslemenin kaynağını seç{st?.dataSource ? <> — <code className="text-xs">{st.dataSource}</code> ({st.contentLanguage} / {st.feedLabel})</> : ""}.</span>
              <Button size="sm" variant="outline" disabled={!!busy || !st?.keyOk || !st?.merchantId} onClick={() => run("ds", async () => setSources((await api({ op: "data_sources" })).sources || []))}>
                {busy === "ds" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Kaynakları getir</Button>
            </div>
            {sources && (
              <div className="rounded-lg border divide-y">
                {!sources.length && <p className="p-2 text-xs text-muted-foreground">Ürün veri kaynağı bulunamadı — önce Merchant Center’da besleme adresini ekle.</p>}
                {sources.map((s) => (
                  <div key={s.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <b className="flex-1">{s.displayName}</b>
                    <span className="text-muted-foreground">{s.input === "FILE" ? "besleme / dosya" : s.input === "API" ? "API" : s.input} · {s.contentLanguage || "?"} / {s.feedLabel || "?"}</span>
                    <Button size="sm" variant={st?.dataSource === s.name ? "default" : "outline"} disabled={!!busy}
                      onClick={() => run("sel", async () => { await api({ op: "select_source", name: s.name, contentLanguage: s.contentLanguage || "tr", feedLabel: s.feedLabel || "TR" }); setSt(await api({ op: "status" })); })}>
                      {st?.dataSource === s.name ? "Seçili" : "Seç"}</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {step(4, !!st?.sentOk, (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span>Aç, sonra tüm ürünleri bir kez gönder.</span>
              <Button size="sm" variant="outline" disabled={!!busy || !enabled} onClick={() => run("all", async () => {
                const j = await api({ op: "sync_all" });
                const p = await api({ op: "process" });
                siteAlert({ title: "Google Merchant", message: `${j.queued} ürün sıraya alındı; ${p.sent} kalem gönderildi${p.failed ? `, ${p.failed} hatalı` : ""}. Kalanlar dakikada bir gider.`, tone: p.failed ? "danger" : "success" });
                setSt(await api({ op: "status" }));
              })}>{busy === "all" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Tümünü gönder</Button>
            </div>
            {st && !st.error && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {st.sentOk > 0 && <CheckCircle2 size={14} className="text-green-600" />} Google’da {st.sentOk} kalem · sırada {st.queued} ürün{st.errors?.length ? ` · ${st.errors.length} hatalı` : ""}
              </p>
            )}
            {st?.errors?.length > 0 && (
              <ul className="text-[11px] text-red-700 space-y-0.5 max-h-32 overflow-auto">
                {st.errors.map((e: any) => <li key={e.offer_id}><code>{e.offer_id}</code> — {e.error}</li>)}
              </ul>
            )}
            {st?.error && <p className="text-xs text-red-600">{st.error}</p>}
          </div>
        ))}
      </IntegrationSection>
  );
}
