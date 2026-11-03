"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Ayarlar › Entegrasyonlar › Basit Kargo (src/lib/basitkargo.ts, /api/admin/basitkargo).
// Kurulum: Basit Kargo paneli › Ayarlar'dan API token → yapıştır → gönderici adresini seç → Aç.
// Açıkken siparişteki "Kargoya ver" Basit Kargo'dan çalışır (Kargonomi de açıksa siparişte hangisi seçilir). Token kaydedildikten sonra gösterilmez.
// Webhook (isteğe bağlı): adres üret → Basit Kargo paneli › Ayarlar › Webhook'a yapıştır (durum değişikliği).
import { useCallback, useEffect, useState } from "react";
import IntegrationSection from "@/components/admin/settings/IntegrationSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { Truck, Loader2, Trash2, Copy, RefreshCw } from "lucide-react";

async function api(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/admin/basitkargo", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Basit Kargo hatası");
  return j;
}

export default function BasitKargoCard() {
  const [st, setSt] = useState<any>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSt(await api({ op: "status" })); } catch (e: any) { setSt({ error: e?.message }); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    try { await fn(); await load(); } catch (e: any) { siteAlert({ title: "Basit Kargo", message: e?.message || "Hata", tone: "danger" }); }
    finally { setBusy(null); }
  }

  const enabled = !!st?.enabled;
  const ok = !!st?.firm && !st?.tokenError;
  return (
    <IntegrationSection id="basitkargo" icon={<Truck size={20} className="text-orange-600" />} title="Basit Kargo"
      summary="Teklif → firma seçimi → kargo kodu + resmî etiket, durum bildirimi"
      status={enabled ? "Açık" : st?.tokenSet ? "Kapalı" : "Kurulmadı"} tone={enabled && ok ? "ok" : st?.tokenError ? "warn" : "off"}
      right={<label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={enabled} disabled={!!busy || !st?.tokenSet}
          onChange={(e) => run("en", async () => { await api({ op: "save", enabled: e.target.checked }); })} /> Açık
      </label>}>
      <p className="text-sm text-muted-foreground">
        Açıkken siparişteki <b>Kargoya ver</b> Basit Kargo&apos;dan çalışır (Kargonomi de açıksa pencerede ikisinden birini seçersin): desi gir → firmaların fiyatları gelir → firmayı seç →
        kargo kodu hemen gelir → <b>Basit Kargo etiketi</b>ni bas → “Paket hazır”. Kurye alınca ve teslim edilince sipariş kendiliğinden güncellenir
        (webhook ya da saatte bir sorgu). Teslim edilmiş gönderide iade kodu talepten alınır.
      </p>
      {st?.error && <p className="text-xs text-red-600">{st.error}</p>}

      <div className="space-y-2">
        <p className="text-sm font-semibold">1) API token</p>
        <p className="text-xs text-muted-foreground">Basit Kargo paneli › Ayarlar › API&apos;den token oluştur, buraya yapıştır. Kaydedildikten sonra bir daha gösterilmez.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} className="max-w-md font-mono text-xs"
            placeholder={st?.tokenSet ? "Kayıtlı (değiştirmek için yeni token yapıştır)" : "API token"} />
          <Button size="sm" disabled={!!busy || !token.trim()} onClick={() => run("tok", async () => { await api({ op: "save", token }); setToken(""); })}>
            {busy === "tok" && <Loader2 size={14} className="animate-spin mr-1" />} Kaydet
          </Button>
          {st?.tokenSet && (
            <Button size="sm" variant="ghost" className="text-red-600" disabled={!!busy} onClick={async () => {
              if (!(await siteConfirm({ title: "Token silinsin mi?", message: "Basit Kargo kapanır; Kargoya ver Kargonomi'ye döner.", confirmText: "Sil", tone: "danger" }))) return;
              run("rm", async () => { await api({ op: "remove_token" }); });
            }}><Trash2 size={14} /> Token&apos;ı sil</Button>
          )}
        </div>
        {st?.tokenError && <p className="text-xs text-red-600">{st.tokenError}</p>}
        {st?.firm && (
          <p className="text-xs text-slate-600">
            Hesap: <b className={st.firm.approved ? "text-green-700" : "text-amber-700"}>{st.firm.label || st.firm.status}</b>
            {st.balance != null && <> · Bakiye: <b>{Number(st.balance).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</b></>}
            {!st.firm.approved && st.firm.summary && <span className="block text-amber-700">{st.firm.summary}</span>}
          </p>
        )}
      </div>

      {st?.tokenSet && !st?.tokenError && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">2) Gönderici adresi</p>
          <select className="h-9 w-full max-w-md rounded-md border px-2 bg-white text-sm" disabled={!!busy} value={st?.addressId || ""}
            onChange={(e) => run("addr", async () => { await api({ op: "save", addressId: e.target.value }); })}>
            <option value="">Basit Kargo&apos;daki varsayılan adres</option>
            {(st?.addresses || []).map((a: any) => <option key={a.id} value={a.id}>{[a.name, a.town, a.city].filter(Boolean).join(" · ")}</option>)}
          </select>
          {!(st?.addresses || []).length && <p className="text-xs text-amber-700">Basit Kargo&apos;da kayıtlı adres yok — panelden gönderici adresi ekle.</p>}
        </div>
      )}

      {st?.tokenSet && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">3) Durum bildirimi (webhook) — isteğe bağlı</p>
          <p className="text-xs text-muted-foreground">Adresi üret, Basit Kargo paneli › Ayarlar › Webhook&apos;a yapıştır, olay olarak <b>Durum değişikliği</b>ni seç. Kurulmasa da durum saatte bir sorgulanır.</p>
          {st?.webhookUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[11px] bg-slate-50 border rounded px-2 py-1 break-all max-w-xl">{st.webhookUrl}</code>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(st.webhookUrl); siteAlert({ message: "Kopyalandı", tone: "success" }); }}><Copy size={14} /> Kopyala</Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={async () => {
                if (!(await siteConfirm({ title: "Adres yenilensin mi?", message: "Eski adres çalışmaz; yenisini Basit Kargo paneline yapıştırman gerekir.", confirmText: "Yenile" }))) return;
                run("wh", async () => { await api({ op: "webhook_key" }); });
              }}><RefreshCw size={14} /> Yenile</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("wh", async () => { await api({ op: "webhook_key" }); })}>
              {busy === "wh" && <Loader2 size={14} className="animate-spin mr-1" />} Webhook adresi üret
            </Button>
          )}
        </div>
      )}
    </IntegrationSection>
  );
}
