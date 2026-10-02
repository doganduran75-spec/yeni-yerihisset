"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Hepsiburada TEST MERKEZİ — canlı ortam bilgisi için Hepsiburada'nın test (SIT)
// ortamında istediği adımlar: 1) Katalog (hbSku ile hızlı ürün yükleme → trackingId) 2) Listeleme
// (test envanterindeki ürünle stok + fiyat güncelleme) 3) Sipariş (test siparişi
// oluştur → listele → paketle). Her istek/yanıt aşağıda kayıtlanır; "Özeti kopyala"
// ile Hepsiburada'ya açılacak ticket'a yapıştırılır. İstekler YALNIZ test ortamına gider.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Loader2, Copy, Check, FlaskConical, Trash2, ChevronDown, ChevronRight } from "lucide-react";

type LogEntry = { id: string; at: string; step: string; status: number; ok: boolean; request: any; response: any; key?: string };
const LS_KEY = "yh:hb-sit-log";

const pick = (o: any, ...keys: string[]) => { for (const k of keys) if (o && o[k] != null) return o[k]; return undefined; };

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center">{n}</span> {title}
      </p>
      {children}
    </div>
  );
}

export default function HepsiburadaTestCenter() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // 1) Katalog
  // Hepsiburada (2026-10): hızlı ürün yüklemede barkod kalktı → hbSku ile yüklenir
  const [hbSku, setHbSku] = useState("");
  const [merchantSku, setMerchantSku] = useState(() => `YH-TEST-${Date.now().toString().slice(-6)}`);
  const [productName, setProductName] = useState("YeriHisset Test Ürünü");
  const [trackingId, setTrackingId] = useState("");
  // 2) Listeleme
  const [listings, setListings] = useState<any[] | null>(null);
  const [sel, setSel] = useState<any | null>(null);
  const [qty, setQty] = useState("5");
  const [price, setPrice] = useState("");
  const [stockUploadId, setStockUploadId] = useState("");
  const [priceUploadId, setPriceUploadId] = useState("");
  // 3) Sipariş
  const [orderItems, setOrderItems] = useState<any[] | null>(null);

  useEffect(() => {
    try { const v = localStorage.getItem(LS_KEY); if (v) setLog(JSON.parse(v)); } catch { /* yok */ }
  }, []);
  const saveLog = (update: (prev: LogEntry[]) => LogEntry[]) => {
    setLog((prev) => {
      const next = update(prev).slice(0, 40);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* özel mod */ }
      return next;
    });
  };

  async function run(action: string, step: string, params: Record<string, unknown> = {}) {
    setBusy(action); setErr(null);
    try {
      const r = await fetch("/api/admin/hepsiburada-sit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action, ...params }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "İstek gönderilemedi"); return null; }
      const res = j.response;
      const entry: LogEntry = {
        id: `${Date.now()}`, at: new Date().toISOString(), step, status: res.status, ok: res.ok,
        request: j.request, response: res.json ?? res.text,
      };
      if (!res.ok) setErr(`${step}: Hepsiburada ${res.status} döndü — ayrıntı aşağıdaki kayıtta.`);
      return { res, entry };
    } catch (e: any) {
      setErr(e?.message || "Bağlantı hatası");
      return null;
    } finally {
      setBusy(null);
    }
  }
  const push = (entry: LogEntry, key?: string) => saveLog((prev) => [{ ...entry, key }, ...prev]);

  // ── 1) Katalog ──
  async function catalogSend() {
    const out = await run("catalog_fastlisting", "Katalog — Hızlı ürün yükleme", { hbSku, merchantSku, productName });
    if (!out) return;
    const t = pick(out.res.json?.data, "trackingId", "TrackingId") ?? pick(out.res.json, "trackingId", "TrackingId");
    if (t) setTrackingId(String(t));
    push(out.entry, t ? `trackingId: ${t}` : undefined);
  }
  async function catalogStatus() {
    const out = await run("catalog_status", "Katalog — Ürün durumu sorgulama", { trackingId });
    if (out) push(out.entry);
  }

  // ── 2) Listeleme ──
  async function loadListings() {
    const out = await run("listings", "Listeleme — Listing bilgilerini sorgulama", { offset: 0 });
    if (!out) return;
    const j = out.res.json;
    const list = (pick(j, "listings", "Listings") ?? (Array.isArray(j) ? j : [])) as any[];
    setListings(list);
    push(out.entry, `${list.length} listing`);
  }
  function choose(l: any) {
    setSel(l);
    const p = pick(l, "price", "Price");
    setPrice(p != null ? String(p) : "");
  }
  const selHb = sel ? String(pick(sel, "hepsiburadaSku", "HepsiburadaSku") ?? "") : "";
  // Girilen hbSku envanterde var mı? (hızlı yükleme yalnız envanterde OLMAYAN ürün içindir)
  const inInventory = !!hbSku && !!listings?.some((l) => String(pick(l, "hepsiburadaSku", "HepsiburadaSku") ?? "").toUpperCase() === hbSku.toUpperCase());
  const selMs = sel ? String(pick(sel, "merchantSku", "MerchantSku") ?? "") : "";

  async function stockSend() {
    const out = await run("stock_upload", "Listeleme — Stok güncelleme", { hbSku: selHb, merchantSku: selMs, qty });
    if (!out) return;
    const id = pick(out.res.json, "id", "Id");
    if (id) setStockUploadId(String(id));
    push(out.entry, id ? `stok yükleme id: ${id}` : undefined);
  }
  async function stockStatus() {
    const out = await run("stock_status", "Listeleme — Stok güncelleme sorgulama", { id: stockUploadId });
    if (out) push(out.entry, `stok sonucu: ${pick(out.res.json, "status", "Status") ?? out.res.status}`);
  }
  async function priceSend() {
    const out = await run("price_upload", "Listeleme — Fiyat güncelleme", { hbSku: selHb, merchantSku: selMs, price });
    if (!out) return;
    const id = pick(out.res.json, "id", "Id");
    if (id) setPriceUploadId(String(id));
    push(out.entry, id ? `fiyat yükleme id: ${id}` : undefined);
  }
  async function priceStatus() {
    const out = await run("price_status", "Listeleme — Fiyat güncelleme sorgulama", { id: priceUploadId });
    if (out) push(out.entry, `fiyat sonucu: ${pick(out.res.json, "status", "Status") ?? out.res.status}`);
  }

  // ── 3) Sipariş ──
  async function orderCreate() {
    const out = await run("order_create", "Sipariş — Test siparişi oluşturma", {
      hbSku: selHb, merchantSku: selMs, price, quantity: 1, listingId: sel ? pick(sel, "listingId", "ListingId") : undefined,
    });
    if (!out) return;
    const on = (out.entry.request?.body as any)?.OrderNumber;
    push(out.entry, on ? `test sipariş no: ${on}` : undefined);
  }
  async function ordersList() {
    const out = await run("orders_list", "Sipariş — Ödemesi tamamlanmış siparişleri listeleme");
    if (!out) return;
    const j = out.res.json;
    const items = (pick(j, "items", "Items", "data") ?? (Array.isArray(j) ? j : [])) as any[];
    setOrderItems(items);
    push(out.entry, `${items.length} kalem`);
  }
  async function packageItem(item: any) {
    const id = pick(item, "id", "Id", "lineItemId", "LineItemId");
    const quantity = pick(item, "quantity", "Quantity") ?? 1;
    const out = await run("package", "Sipariş — Kalem paketleme", { lineItemId: id, quantity });
    if (!out) return;
    const pn = pick(out.res.json, "packageNumber", "PackageNumber");
    push(out.entry, pn ? `paket no: ${pn}` : undefined);
    ordersList();
  }
  async function packagesList() {
    const out = await run("packages_list", "Sipariş — Paket bilgilerini listeleme");
    if (out) push(out.entry);
  }

  // Hepsiburada'ya iletilecek özet
  function summary() {
    const lines = [...log].reverse().map((e) =>
      `${new Date(e.at).toLocaleString("tr-TR")} — ${e.step} — HTTP ${e.status}${e.key ? ` — ${e.key}` : ""}`);
    return `Hepsiburada test ortamı (SIT) entegrasyon adımları — YeriHisset\n\n${lines.join("\n")}`;
  }
  async function copy(text: string, k: string) {
    try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(null), 1500); } catch { /* */ }
  }

  const btn = (key: string, label: string, onClick: () => void, disabled = false) => (
    <Button size="sm" variant="outline" onClick={onClick} disabled={!!busy || disabled} className="gap-1.5">
      {busy === key ? <Loader2 size={14} className="animate-spin" /> : null} {label}
    </Button>
  );

  return (
    <div className="w-full rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/30">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <FlaskConical size={16} className="text-orange-600" /> Test Merkezi — canlı ortam bilgisi almak için Hepsiburada'nın istediği adımlar
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Bu bölüm <b>yalnız Hepsiburada test ortamına (SIT)</b> istek gönderir; canlı sisteme ve sitedeki stoklara dokunmaz.
            Önce yukarıya e-postayla gelen <b>test</b> bilgilerini girip kaydet. Adımları sırayla yap, en altta “Özeti kopyala” ile
            Hepsiburada'ya açacağın ticket'a yapıştır. Bu aşamada yukarıdaki stok senkronunu <b>kapalı</b> tut (sitedeki barkodlar test envanterinde yok).
          </p>
          {err && <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

          <Section n={1} title="Katalog — hbSku ile ürün gönder, trackingId al">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input className="h-9 font-mono" value={hbSku} onChange={(e) => setHbSku(e.target.value.trim())} placeholder="hbSku (ör. HBV0000106NM0)" />
              <Input className="h-9" value={merchantSku} onChange={(e) => setMerchantSku(e.target.value)} placeholder="Satıcı Stok Kodu (kendi kodun)" />
              <Input className="h-9" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ürün adı" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {btn("catalog_fastlisting", "Ürünü gönder", catalogSend, !hbSku || !merchantSku || inInventory)}
              <Input className="h-9 w-72" value={trackingId} onChange={(e) => setTrackingId(e.target.value)} placeholder="trackingId" />
              {btn("catalog_status", "Durumu sorgula", catalogStatus, !trackingId)}
            </div>
            {inInventory && (
              <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Bu hbSku zaten test envanterinde. Hızlı ürün yükleme, katalogda olup envanterinde OLMAYAN bir ürünü eklemek içindir —
                envanterdeki ürünü tekrar yüklemek “Barcode must be unique” hatası verir. Envanterde olmayan bir hbSku gir.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Hızlı ürün yükleme <b>hbSku ile</b> yapılır (barkod gönderilmez). hbSku, Hepsiburada kataloğundaki ürün numarasıdır (HBV… / HBC…)
              ve <b>senin envanterinde olmayan</b> bir ürün olmalı. Belgedeki örnekler: <code>HBV0000106NM0</code>, <code>HBV0000106NLG</code>;
              olmazsa Hepsiburada destekten test için envanterinde olmayan bir hbSku iste. Satıcı Stok Kodu her denemede farklı olsun.
            </p>
          </Section>

          <Section n={2} title="Listeleme — test envanterindeki ürünle stok ve fiyat güncelle">
            <div className="flex flex-wrap items-center gap-2">
              {btn("listings", "Test envanterini listele", loadListings)}
              {sel && <span className="text-xs text-slate-600">Seçili: <b className="font-mono">{selMs || selHb}</b></span>}
            </div>
            {listings && (
              listings.length === 0 ? <p className="text-xs text-muted-foreground">Listing bulunamadı (yanıt aşağıdaki kayıtta).</p> : (
                <div className="max-h-56 overflow-y-auto rounded-lg border divide-y text-xs">
                  {listings.map((l, i) => {
                    const hb = pick(l, "hepsiburadaSku", "HepsiburadaSku"), ms = pick(l, "merchantSku", "MerchantSku");
                    const active = sel && pick(sel, "hepsiburadaSku", "HepsiburadaSku") === hb && pick(sel, "merchantSku", "MerchantSku") === ms;
                    return (
                      <button key={`${hb}-${ms}-${i}`} type="button" onClick={() => choose(l)}
                        className={`w-full text-left px-3 py-1.5 flex flex-wrap gap-x-3 ${active ? "bg-orange-100" : "hover:bg-slate-50"}`}>
                        <span className="font-mono">{hb}</span>
                        <span className="font-mono text-slate-500">{ms}</span>
                        <span>stok {pick(l, "availableStock", "AvailableStock") ?? "—"}</span>
                        <span>₺{pick(l, "price", "Price") ?? "—"}</span>
                        <span className="text-slate-400 truncate">{pick(l, "productName", "ProductName") ?? ""}</span>
                      </button>
                    );
                  })}
                </div>
              )
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-9 w-24" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="Stok" inputMode="numeric" />
              {btn("stock_upload", "Stok gönder", stockSend, !sel)}
              {btn("stock_status", "Stok sonucunu sorgula", stockStatus, !stockUploadId)}
              <span className="w-px h-6 bg-slate-200 mx-1" />
              <Input className="h-9 w-28" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Fiyat" inputMode="decimal" />
              {btn("price_upload", "Fiyat gönder", priceSend, !sel)}
              {btn("price_status", "Fiyat sonucunu sorgula", priceStatus, !priceUploadId)}
            </div>
            <p className="text-[11px] text-muted-foreground">Gönderdikten birkaç saniye sonra “sonucunu sorgula”ya bas; durum “Done” olmalı.</p>
          </Section>

          <Section n={3} title="Sipariş — test siparişi oluştur, listele, paketle">
            <div className="flex flex-wrap items-center gap-2">
              {btn("order_create", "Test siparişi oluştur (seçili ürün, 1 adet)", orderCreate, !sel || !price)}
              {btn("orders_list", "Ödemesi tamamlanmış siparişleri listele", ordersList)}
              {btn("packages_list", "Paketleri listele", packagesList)}
            </div>
            {orderItems && (
              orderItems.length === 0 ? <p className="text-xs text-muted-foreground">Paketlenecek kalem yok (otomatik paketleme açıksa paketler “Paketleri listele”de görünür).</p> : (
                <div className="rounded-lg border divide-y text-xs">
                  {orderItems.map((it, i) => (
                    <div key={i} className="px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono">{pick(it, "orderNumber", "OrderNumber") ?? "—"}</span>
                      <span className="font-mono text-slate-500">{pick(it, "merchantSku", "MerchantSku") ?? pick(it, "sku", "Sku") ?? ""}</span>
                      <span>× {pick(it, "quantity", "Quantity") ?? 1}</span>
                      <span className="ml-auto">{btn(`package`, "Paketle", () => packageItem(it))}</span>
                    </div>
                  ))}
                </div>
              )
            )}
            <p className="text-[11px] text-muted-foreground">
              Önce 2. adımda bir ürün seç. Test siparişi birkaç saniye içinde listede görünür.
              Hepsiburada otomatik paketleme önerir; test panelinde açıksa sipariş kendiliğinden paketlenir.
            </p>
          </Section>

          {/* Kayıt */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-800">Kayıt ({log.length})</p>
              <Button size="sm" className="gap-1.5 ml-auto" onClick={() => copy(summary(), "sum")} disabled={!log.length}>
                {copied === "sum" ? <Check size={14} /> : <Copy size={14} />} Hepsiburada için özeti kopyala
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-slate-500" onClick={() => saveLog(() => [])} disabled={!log.length}>
                <Trash2 size={14} /> Temizle
              </Button>
            </div>
            {log.map((e) => (
              <details key={e.id} className="rounded-lg border bg-white">
                <summary className="px-3 py-2 text-xs cursor-pointer flex flex-wrap gap-x-3">
                  <span className={e.ok ? "text-green-700 font-bold" : "text-red-700 font-bold"}>{e.ok ? "✓" : "✗"} HTTP {e.status}</span>
                  <span className="font-semibold text-slate-800">{e.step}</span>
                  {e.key && <span className="font-mono text-orange-700">{e.key}</span>}
                  <span className="text-slate-400 ml-auto">{new Date(e.at).toLocaleTimeString("tr-TR")}</span>
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  <div className="flex justify-end">
                    <button onClick={() => copy(JSON.stringify({ request: e.request, response: e.response }, null, 2), e.id)} className="text-[11px] text-blue-600 hover:underline flex items-center gap-1">
                      {copied === e.id ? <Check size={11} /> : <Copy size={11} />} İstek + yanıtı kopyala
                    </button>
                  </div>
                  <pre className="text-[11px] bg-slate-50 rounded p-2 overflow-x-auto max-h-48">{e.request.method} {e.request.url}{e.request.body ? "\n" + JSON.stringify(e.request.body, null, 2) : ""}</pre>
                  <pre className="text-[11px] bg-slate-900 text-slate-100 rounded p-2 overflow-x-auto max-h-72">{typeof e.response === "string" ? e.response : JSON.stringify(e.response, null, 2)}</pre>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
