"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// FİYATLAR — tüm satış kanallarının fiyatları tek tabloda (Site Satış/PSF, Trendyol,
// Hepsiburada, ileride yurtdışı…). Ürün sayfasında fiyat YOK; fiyatlar yalnız burada.
// Satır = varyant (varyantsız üründe ürün). Hücreyi düzenle → değişen hücre renklenir →
// "Kaydet" (özet + büyük değişim uyarısı) → apply_price_changes (geçmiş tutulur).
// Toplu işlem FİLTRELENMİŞ satırlara uygulanır. Liste tanımları: "Listeler" düğmesi.
import { useEffect, useMemo, useState, useCallback } from "react";
import AdminOpsTabs from "@/components/admin/AdminOpsTabs";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { cn } from "@/lib/utils";
import { sortByVariantValue } from "@/lib/variant-sort";
import { Loader2, Search, Save, Tag, Wand2, History, ListPlus, FileDown, Undo2, X, AlertTriangle, Send } from "lucide-react";

type PriceList = { id: string; code: string; name: string; channel: string; kind: "sale" | "list"; currency: string; sort_order: number; is_active: boolean; builtin: boolean };
type Row = {
  key: string; productId: string; variantId: string | null;
  title: string; value: string; sku: string; barcode: string; stock: number;
  productActive: boolean; categoryId: string | null; categoryName: string; brandId: string | null; brandName: string;
  search: string;
};

const CHANNEL_LABEL: Record<string, string> = { site: "Site", trendyol: "Trendyol", hepsiburada: "Hepsiburada", other: "Diğer" };
const PAGE = 200;

function norm(s: string): string {
  return (s || "").toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("İ", "i").replaceAll("ş", "s").replaceAll("ğ", "g")
    .replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c");
}
const fmt = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const parse = (s: string): number | null => {
  const t = String(s ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  // "1.234,56" / "1234,56" / "1234.56"
  const v = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
};
function roundTo(v: number, mode: string): number {
  if (mode === "int") return Math.round(v);
  if (mode === "90") return Math.floor(v) + 0.9;
  if (mode === "99") return Math.floor(v) + 0.99;
  return Math.round(v * 100) / 100;
}

export default function PricesPage() {
  const [tab, setTab] = useState<"grid" | "history">("grid");
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<PriceList[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<Record<string, number | null>>({}); // cellKey → kayıtlı değer
  const [draft, setDraft] = useState<Record<string, string>>({});       // cellKey → düzenlenen metin
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  // Filtreler
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fBrand, setFBrand] = useState("all");
  const [fActive, setFActive] = useState(true);
  const [fStock, setFStock] = useState(false);
  const [fMissing, setFMissing] = useState(""); // liste kodu: bu listede fiyatı boş olanlar

  // Toplu işlem
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bTarget, setBTarget] = useState("site_sale");
  const [bOp, setBOp] = useState<"set" | "pct_up" | "pct_down" | "add" | "sub" | "copy" | "clear">("pct_up");
  const [bValue, setBValue] = useState("");
  const [bSource, setBSource] = useState("site_sale");
  const [bFactor, setBFactor] = useState("1");
  const [bRound, setBRound] = useState("none");

  const [listsOpen, setListsOpen] = useState(false);

  const cellKey = (r: Row, code: string) => `${r.key}|${code}`;

  const load = useCallback(async () => {
    setLoading(true);
    const sb = supabase as any;
    const [{ data: pl }, { data: prods }] = await Promise.all([
      sb.from("price_lists").select("*").order("sort_order"),
      sb.from("products").select(`id, title, is_active, price, category_id, brand_id, categories(name), brands(name),
        product_variants(id, sku, barcode, stock, price, compare_at_price, is_active, variant_options(value, variant_groups(name)))`).order("title"),
    ]);
    const priceLists = (pl as PriceList[]) || [];
    const byListId = new Map(priceLists.map((l) => [l.id, l.code]));

    // item_prices (sayfalı)
    const ip: any[] = [];
    for (let from = 0; from < 100000; from += 1000) {
      const { data } = await sb.from("item_prices").select("product_id, variant_id, price_list_id, amount").range(from, from + 999);
      if (!data?.length) break;
      ip.push(...data);
      if (data.length < 1000) break;
    }

    const out: Row[] = [];
    const sv: Record<string, number | null> = {};
    for (const p of (prods as any[]) || []) {
      const vs = sortByVariantValue((p.product_variants as any[]) || [], (v: any) => v.variant_options?.value ?? "");
      const base = {
        productId: p.id, title: p.title ?? "", productActive: p.is_active !== false,
        categoryId: p.category_id ?? null, categoryName: p.categories?.name ?? "",
        brandId: p.brand_id ?? null, brandName: p.brands?.name ?? "",
      };
      if (vs.length) {
        for (const v of vs) {
          const value = v.variant_options?.value ?? "";
          const r: Row = {
            ...base, key: `v:${v.id}`, variantId: v.id, value, sku: v.sku ?? "", barcode: v.barcode ?? "",
            stock: Number(v.stock ?? 0),
            search: norm([p.title, value, v.sku, v.barcode, base.brandName, base.categoryName].filter(Boolean).join(" ")),
          };
          out.push(r);
          sv[`${r.key}|site_sale`] = v.price != null ? Number(v.price) : null;
          sv[`${r.key}|site_list`] = v.compare_at_price != null ? Number(v.compare_at_price) : null;
        }
      } else {
        const r: Row = {
          ...base, key: `p:${p.id}`, variantId: null, value: "", sku: "", barcode: "", stock: 0,
          search: norm([p.title, base.brandName, base.categoryName].filter(Boolean).join(" ")),
        };
        out.push(r);
        sv[`${r.key}|site_sale`] = p.price != null ? Number(p.price) : null;
      }
    }
    for (const x of ip) {
      const code = byListId.get(x.price_list_id);
      if (!code) continue;
      const key = x.variant_id ? `v:${x.variant_id}` : `p:${x.product_id}`;
      sv[`${key}|${code}`] = Number(x.amount);
    }
    setLists(priceLists);
    setRows(out);
    setSaved(sv);
    setDraft({});
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeLists = useMemo(() => lists.filter((l) => l.is_active), [lists]);
  const listByCode = useMemo(() => new Map(lists.map((l) => [l.code, l])), [lists]);

  // Hücrenin geçerli değeri (taslak varsa o)
  const current = useCallback((r: Row, code: string): number | null => {
    const k = cellKey(r, code);
    if (k in draft) { const v = parse(draft[k]); return Number.isNaN(v) ? null : v; }
    return saved[k] ?? null;
  }, [draft, saved]);

  const cats = useMemo(() => [...new Map(rows.filter((r) => r.categoryId).map((r) => [r.categoryId!, r.categoryName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "tr")), [rows]);
  const brands = useMemo(() => [...new Map(rows.filter((r) => r.brandId).map((r) => [r.brandId!, r.brandName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "tr")), [rows]);

  const filtered = useMemo(() => {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (fActive && !r.productActive) return false;
      if (fStock && r.stock <= 0) return false;
      if (fCat !== "all" && r.categoryId !== fCat) return false;
      if (fBrand !== "all" && r.brandId !== fBrand) return false;
      if (fMissing && current(r, fMissing) != null) return false;
      return tokens.every((t) => r.search.includes(t));
    });
  }, [rows, q, fActive, fStock, fCat, fBrand, fMissing, current]);

  // Değişiklikler (kayıtlıdan farklı taslaklar)
  const changes = useMemo(() => {
    const out: { row: Row; code: string; old: number | null; amount: number | null; invalid: boolean }[] = [];
    const rowByKey = new Map(rows.map((r) => [r.key, r]));
    for (const [k, txt] of Object.entries(draft)) {
      const [rk, code] = [k.slice(0, k.lastIndexOf("|")), k.slice(k.lastIndexOf("|") + 1)];
      const row = rowByKey.get(rk);
      if (!row) continue;
      const amount = parse(txt);
      const old = saved[k] ?? null;
      const invalid = Number.isNaN(amount) || (amount != null && amount < 0) || (code === "site_sale" && !(amount != null && amount > 0));
      if (!invalid && (amount ?? null) === old) continue;
      out.push({ row, code, old, amount: Number.isNaN(amount) ? null : amount, invalid });
    }
    return out;
  }, [draft, saved, rows]);

  function setCell(r: Row, code: string, txt: string) {
    setDraft((d) => ({ ...d, [cellKey(r, code)]: txt }));
  }

  // ── Toplu işlem ──
  function applyBulk() {
    const val = parse(bValue);
    const factor = parse(bFactor) ?? 1;
    if (bOp !== "clear" && bOp !== "copy" && (val == null || Number.isNaN(val))) { siteAlert({ message: "Bir değer gir.", tone: "danger" }); return; }
    if (bOp === "clear" && bTarget === "site_sale") { siteAlert({ message: "Site satış fiyatı silinemez.", tone: "danger" }); return; }
    const next: Record<string, string> = {};
    let n = 0;
    for (const r of filtered) {
      const cur = current(r, bTarget);
      let out: number | null = null;
      switch (bOp) {
        case "set": out = val!; break;
        case "pct_up": if (cur == null) continue; out = cur * (1 + val! / 100); break;
        case "pct_down": if (cur == null) continue; out = cur * (1 - val! / 100); break;
        case "add": if (cur == null) continue; out = cur + val!; break;
        case "sub": if (cur == null) continue; out = cur - val!; break;
        case "copy": { const src = current(r, bSource); if (src == null) continue; out = src * (Number.isNaN(factor) ? 1 : factor); break; }
        case "clear": next[cellKey(r, bTarget)] = ""; n++; continue;
      }
      if (out == null || out < 0) continue;
      next[cellKey(r, bTarget)] = fmt(roundTo(out, bRound));
      n++;
    }
    setDraft((d) => ({ ...d, ...next }));
    setBulkOpen(false);
    siteAlert({ message: `${n} satırda “${listByCode.get(bTarget)?.name ?? bTarget}” güncellendi (henüz kaydedilmedi).`, tone: "success" });
  }

  // ── Pazaryerine fiyat gönder (Trendyol satış+PSF, Hepsiburada satış) ──
  async function pushToMarketplaces(variantIds: string[]) {
    const ids = [...new Set(variantIds.filter(Boolean))];
    if (!ids.length) { siteAlert({ message: "Gönderilecek (varyantlı) ürün yok.", tone: "danger" }); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/admin/marketplace/price-push", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ variantIds: ids }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { siteAlert({ title: "Pazaryerine gönderilemedi", message: j.error || "Hata", tone: "danger" }); return; }
    const parts: string[] = [];
    for (const rep of j.reports || []) {
      const name = rep.channel === "trendyol" ? "Trendyol" : "Hepsiburada";
      const q = j.queued?.[rep.channel] ?? 0;
      if (rep.skipped === "disabled") parts.push(`${name}: senkron kapalı (${q} fiyat sırada bekliyor)`);
      else if (rep.skipped === "no_credentials") parts.push(`${name}: bağlantı bilgisi eksik`);
      else if (rep.errors?.length) parts.push(`${name}: hata — ${rep.errors[0]}`);
      else parts.push(`${name}: ${rep.sent} fiyat gönderildi${q - rep.sent > 0 ? `, ${q - rep.sent} sırada` : ""}`);
    }
    siteAlert({
      title: "Pazaryeri fiyatları",
      message: parts.join("\n") + "\nSonuçlar: Pazaryeri Stok › Otomatik Senkron (fiyat satırları).",
      tone: (j.reports || []).some((x: any) => x.errors?.length) ? "danger" : "success",
    });
  }

  // ── Kaydet ──
  async function save(push = false) {
    const bad = changes.filter((c) => c.invalid);
    if (bad.length) {
      siteAlert({ title: "Hatalı değerler var", message: `${bad.length} hücrede geçersiz değer var (site satış fiyatı boş veya 0 olamaz, negatif fiyat olamaz). Kırmızı hücreleri düzelt.`, tone: "danger" });
      return;
    }
    if (!changes.length) return;
    const pct = (c: (typeof changes)[number]) => (c.old && c.amount != null ? ((c.amount - c.old) / c.old) * 100 : null);
    const big = changes.filter((c) => { const p = pct(c); return p != null && Math.abs(p) >= 30; });
    const maxAbs = changes.reduce((m, c) => { const p = pct(c); return p != null && Math.abs(p) > Math.abs(m) ? p : m; }, 0);
    const perList = [...changes.reduce((m, c) => m.set(c.code, (m.get(c.code) ?? 0) + 1), new Map<string, number>()).entries()]
      .map(([code, k]) => `${listByCode.get(code)?.name ?? code}: ${k}`).join(" · ");
    const ok = await siteConfirm({
      title: `${changes.length} fiyat kaydedilsin mi?`,
      message: `${perList}\nEn büyük değişim: ${maxAbs >= 0 ? "+" : ""}${maxAbs.toFixed(1)}%` +
        (big.length ? `\n⚠ ${big.length} fiyatta %30 veya daha büyük değişim var — kontrol et (pazaryerleri büyük değişimde ürünü kilitleyebilir).` : ""),
      confirmText: "Kaydet",
      tone: big.length ? "danger" : "info",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const payload = changes.map((c) => ({ product_id: c.row.productId, variant_id: c.row.variantId, list_code: c.code, amount: c.amount }));
      const { data, error } = await (supabase as any).rpc("apply_price_changes", { p_changes: payload, p_source: "price_page" });
      if (error) throw new Error(error.message.includes("SITE_PRICE_REQUIRED") ? "Site satış fiyatı boş veya 0 olamaz." : error.message);
      const touched = changes.filter((c) => c.code.startsWith("trendyol_") || c.code.startsWith("hepsiburada_")).map((c) => c.row.variantId!).filter(Boolean);
      await load();
      if (push) {
        if (touched.length) await pushToMarketplaces(touched);
        else siteAlert({ message: `${data?.changed ?? changes.length} fiyat kaydedildi. Pazaryeri fiyatı değişmediği için gönderim yapılmadı.`, tone: "success" });
      } else {
        siteAlert({ message: `${data?.changed ?? changes.length} fiyat kaydedildi.`, tone: "success" });
      }
    } catch (e: any) {
      siteAlert({ title: "Kaydedilemedi", message: e?.message || "Kaydedilemedi", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  // ── Excel ──
  async function exportExcel() {
    const XLSX = await import("xlsx");
    const data = filtered.map((r) => {
      const o: Record<string, string | number> = {
        Barkod: r.barcode, Kod: r.sku, "Ürün": r.title, Numara: r.value, Stok: r.stock,
      };
      for (const l of activeLists) { const v = current(r, l.code); o[`${l.name} (${l.currency})`] = v ?? ""; }
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fiyatlar");
    XLSX.writeFile(wb, `fiyatlar-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const dirtyCount = changes.length;
  const sel = "h-9 rounded-lg border border-input bg-background px-2 text-xs font-medium";

  return (
    <div className="space-y-4">
      <AdminOpsTabs active="prices" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tag size={22} className="text-olive-600" /> Fiyatlar</h1>
          <p className="text-muted-foreground text-sm mt-1">Tüm satış kanallarının fiyatları. Hücreyi düzenle, sonra “Kaydet”. Toplu işlem filtrelenmiş satırlara uygulanır.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === "grid" ? "default" : "outline"} size="sm" onClick={() => setTab("grid")} className="gap-1.5"><Tag size={14} /> Fiyat tablosu</Button>
          <Button variant={tab === "history" ? "default" : "outline"} size="sm" onClick={() => setTab("history")} className="gap-1.5"><History size={14} /> Geçmiş</Button>
        </div>
      </div>

      {tab === "history" ? (
        <PriceHistory lists={lists} onReverted={load} />
      ) : loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Filtreler + işlemler */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Ara: barkod, kod, ürün adı, numara…"
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
            </div>
            <select value={fCat} onChange={(e) => setFCat(e.target.value)} className={sel}>
              <option value="all">Kategori: tümü</option>
              {cats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={fBrand} onChange={(e) => setFBrand(e.target.value)} className={sel}>
              <option value="all">Marka: tümü</option>
              {brands.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={fMissing} onChange={(e) => setFMissing(e.target.value)} className={sel}>
              <option value="">Fiyat: tümü</option>
              {activeLists.map((l) => <option key={l.code} value={l.code}>Fiyatı boş: {l.name}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs font-medium"><input type="checkbox" checked={fActive} onChange={(e) => setFActive(e.target.checked)} /> Yalnız aktif ürünler</label>
            <label className="flex items-center gap-1.5 text-xs font-medium"><input type="checkbox" checked={fStock} onChange={(e) => setFStock(e.target.checked)} /> Stokta olanlar</label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{filtered.length} / {rows.length} satır</span>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkOpen(true)}><Wand2 size={14} /> Toplu işlem ({filtered.length})</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setListsOpen(true)}><ListPlus size={14} /> Listeler</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportExcel}><FileDown size={14} /> Excel</Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={dirtyCount > 0} title={dirtyCount ? "Önce değişiklikleri kaydet" : "Filtrelenmiş satırların kayıtlı Trendyol / Hepsiburada fiyatlarını yeniden gönder"}
              onClick={async () => {
                const ids = filtered.map((r) => r.variantId).filter(Boolean) as string[];
                if (await siteConfirm({ title: "Fiyatlar pazaryerlerine gönderilsin mi?", message: `Filtrelenmiş ${ids.length} satırın kayıtlı Trendyol ve Hepsiburada fiyatları gönderilecek (o kanalda fiyatı boş olanlar atlanır).`, confirmText: "Gönder" })) {
                  await pushToMarketplaces(ids);
                }
              }}>
              <Send size={14} /> Filtrelenmişi pazaryerine gönder
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {dirtyCount > 0 && (
                <>
                  <span className="text-xs font-bold text-amber-700">{dirtyCount} değişiklik kaydedilmedi</span>
                  <Button size="sm" variant="ghost" className="gap-1 text-slate-500" onClick={() => setDraft({})}><Undo2 size={14} /> Vazgeç</Button>
                </>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => save(false)} disabled={!dirtyCount || saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => save(true)} disabled={!dirtyCount || saving} title="Kaydet + değişen Trendyol / Hepsiburada fiyatlarını pazaryerlerine gönder">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Kaydet ve pazaryerlerine gönder
              </Button>
            </div>
          </div>

          {/* Tablo */}
          <div className="rounded-xl border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500 sticky top-0">
                <tr>
                  <th className="px-2 py-2 font-bold">Barkod</th>
                  <th className="px-2 py-2 font-bold">Kod</th>
                  <th className="px-2 py-2 font-bold min-w-[200px]">Ürün</th>
                  <th className="px-2 py-2 font-bold">No</th>
                  <th className="px-2 py-2 font-bold text-right">Stok</th>
                  {activeLists.map((l) => (
                    <th key={l.code} className="px-2 py-2 font-bold text-right whitespace-nowrap">
                      {l.name}<span className="block text-[9px] font-semibold text-slate-400 normal-case">{CHANNEL_LABEL[l.channel] ?? l.channel} · {l.kind === "list" ? "PSF" : "satış"} · {l.currency}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.slice(0, limit).map((r) => (
                  <tr key={r.key} className={cn("hover:bg-slate-50/60", !r.productActive && "opacity-60")}>
                    <td className="px-2 py-1 font-mono text-[11px] text-slate-600 whitespace-nowrap">{r.barcode}</td>
                    <td className="px-2 py-1 font-mono text-[11px] text-slate-600 whitespace-nowrap">{r.sku}</td>
                    <td className="px-2 py-1 text-xs font-medium text-slate-800 max-w-[260px] truncate" title={r.title}>{r.title}</td>
                    <td className="px-2 py-1 text-xs font-bold text-blue-600">{r.value}</td>
                    <td className={cn("px-2 py-1 text-right text-xs font-semibold", r.stock <= 0 ? "text-red-500" : "text-slate-700")}>{r.variantId ? r.stock : ""}</td>
                    {activeLists.map((l) => {
                      const k = cellKey(r, l.code);
                      const isDraft = k in draft;
                      const txt = isDraft ? draft[k] : fmt(saved[k]);
                      const v = isDraft ? parse(draft[k]) : saved[k];
                      const invalid = isDraft && (Number.isNaN(v as number) || (v != null && (v as number) < 0) || (l.code === "site_sale" && !(v != null && (v as number) > 0)));
                      const changed = isDraft && !invalid && (v ?? null) !== (saved[k] ?? null);
                      return (
                        <td key={l.code} className="px-1 py-0.5">
                          <input
                            value={txt}
                            onChange={(e) => setCell(r, l.code, e.target.value)}
                            inputMode="decimal"
                            placeholder="—"
                            className={cn(
                              "w-24 h-7 rounded-md border px-1.5 text-right text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-olive-300",
                              invalid ? "border-red-400 bg-red-50 text-red-700" : changed ? "border-amber-400 bg-amber-50 text-amber-900" : "border-transparent hover:border-slate-200 bg-transparent",
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > limit && (
              <div className="p-3 text-center">
                <Button size="sm" variant="outline" onClick={() => setLimit((x) => x + PAGE)}>Daha fazla göster ({filtered.length - limit})</Button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Site satış fiyatı boş ya da 0 olamaz; fiyatı olmayan ürün yayına alınamaz. Diğer listelerde hücreyi boşaltırsan o listedeki fiyat silinir.
          </p>
        </>
      )}

      {/* Toplu işlem */}
      {bulkOpen && (
        <Modal title={`Toplu işlem — ${filtered.length} satır`} onClose={() => setBulkOpen(false)}>
          <div className="space-y-3 text-sm">
            <label className="block space-y-1"><span className="text-xs font-semibold">Hangi liste?</span>
              <select value={bTarget} onChange={(e) => setBTarget(e.target.value)} className={cn(sel, "w-full")}>
                {activeLists.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1"><span className="text-xs font-semibold">İşlem</span>
              <select value={bOp} onChange={(e) => setBOp(e.target.value as any)} className={cn(sel, "w-full")}>
                <option value="pct_up">% artır</option>
                <option value="pct_down">% azalt</option>
                <option value="add">+ TL ekle</option>
                <option value="sub">− TL çıkar</option>
                <option value="set">Sabit değer yap</option>
                <option value="copy">Başka listeden kopyala × katsayı</option>
                <option value="clear">Bu listedeki fiyatı sil</option>
              </select>
            </label>
            {bOp === "copy" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1"><span className="text-xs font-semibold">Kaynak liste</span>
                  <select value={bSource} onChange={(e) => setBSource(e.target.value)} className={cn(sel, "w-full")}>
                    {activeLists.filter((l) => l.code !== bTarget).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </label>
                <label className="block space-y-1"><span className="text-xs font-semibold">Katsayı (ör. 1,15)</span>
                  <Input value={bFactor} onChange={(e) => setBFactor(e.target.value)} inputMode="decimal" className="h-9" />
                </label>
              </div>
            ) : bOp !== "clear" && (
              <label className="block space-y-1"><span className="text-xs font-semibold">{bOp.startsWith("pct") ? "Yüzde" : "Tutar"}</span>
                <Input value={bValue} onChange={(e) => setBValue(e.target.value)} inputMode="decimal" className="h-9" placeholder={bOp.startsWith("pct") ? "ör. 10" : "ör. 50"} />
              </label>
            )}
            {bOp !== "clear" && (
              <label className="block space-y-1"><span className="text-xs font-semibold">Yuvarlama</span>
                <select value={bRound} onChange={(e) => setBRound(e.target.value)} className={cn(sel, "w-full")}>
                  <option value="none">Yok (kuruşa)</option>
                  <option value="int">Tam sayı</option>
                  <option value="90">,90 ile bitsin</option>
                  <option value="99">,99 ile bitsin</option>
                </select>
              </label>
            )}
            <p className="text-[11px] text-muted-foreground">Değişiklikler önce tabloda renkli görünür; “Kaydet”e basana kadar hiçbir fiyat değişmez.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(false)}>Vazgeç</Button>
              <Button size="sm" onClick={applyBulk}>Uygula ({filtered.length})</Button>
            </div>
          </div>
        </Modal>
      )}

      {listsOpen && <ListsManager lists={lists} onClose={() => setListsOpen(false)} onChanged={load} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="font-bold text-slate-900">{title}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Fiyat listeleri yönetimi ──
function ListsManager({ lists, onClose, onChanged }: { lists: PriceList[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("other");
  const [kind, setKind] = useState<"sale" | "list">("sale");
  const [currency, setCurrency] = useState("TRY");
  const [busy, setBusy] = useState(false);

  async function add() {
    const nm = name.trim();
    if (!nm) return;
    const code = norm(nm).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) + "_" + Math.random().toString(36).slice(2, 6);
    setBusy(true);
    const { error } = await (supabase as any).from("price_lists").insert({
      code, name: nm, channel, kind, currency: currency.trim().toUpperCase() || "TRY",
      sort_order: 100 + lists.length * 10, is_active: true, builtin: false,
    });
    setBusy(false);
    if (error) { siteAlert({ message: error.message, tone: "danger" }); return; }
    setName("");
    onChanged();
  }
  async function toggle(l: PriceList) {
    if (l.code === "site_sale") return;
    await (supabase as any).from("price_lists").update({ is_active: !l.is_active }).eq("id", l.id);
    onChanged();
  }
  async function remove(l: PriceList) {
    if (l.builtin) return;
    if (!(await siteConfirm({ title: `“${l.name}” silinsin mi?`, message: "Bu listedeki tüm fiyatlar da silinir.", confirmText: "Sil", tone: "danger" }))) return;
    await (supabase as any).from("price_lists").delete().eq("id", l.id);
    onChanged();
  }

  return (
    <Modal title="Fiyat listeleri" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="divide-y rounded-lg border">
          {lists.map((l) => (
            <div key={l.id} className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{l.name}</p>
                <p className="text-[11px] text-muted-foreground">{CHANNEL_LABEL[l.channel] ?? l.channel} · {l.kind === "list" ? "PSF / üstü çizili" : "satış"} · {l.currency}{l.builtin ? " · sistem" : ""}</p>
              </div>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={l.is_active} disabled={l.code === "site_sale"} onChange={() => toggle(l)} /> Görünür
              </label>
              {!l.builtin && <button onClick={() => remove(l)} className="text-xs text-red-600 hover:underline">Sil</button>}
            </div>
          ))}
        </div>
        <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
          <p className="text-xs font-bold">Yeni liste (ör. yeni pazaryeri, yurtdışı sitesi)</p>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Liste adı (ör. Amazon DE Satış)" className="h-9" />
          <div className="grid grid-cols-3 gap-2">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-9 rounded-lg border px-2 text-xs">
              <option value="other">Diğer</option><option value="site">Site</option><option value="trendyol">Trendyol</option><option value="hepsiburada">Hepsiburada</option>
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="h-9 rounded-lg border px-2 text-xs">
              <option value="sale">Satış</option><option value="list">PSF</option>
            </select>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="TRY" className="h-9 text-xs" maxLength={3} />
          </div>
          <Button size="sm" onClick={add} disabled={busy || !name.trim()} className="gap-1.5"><ListPlus size={14} /> Ekle</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Fiyat geçmişi ──
function PriceHistory({ lists, onReverted }: { lists: PriceList[]; onReverted: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const listName = (c: string) => lists.find((l) => l.code === c)?.name ?? c;

  const load = useCallback(async () => {
    const sb = supabase as any;
    const { data } = await sb.from("price_history").select("*").order("created_at", { ascending: false }).limit(500);
    const list = (data as any[]) || [];
    const vIds = [...new Set(list.map((h) => h.variant_id).filter(Boolean))];
    const pIds = [...new Set(list.map((h) => h.product_id).filter(Boolean))];
    const [{ data: vs }, { data: ps }] = await Promise.all([
      vIds.length ? sb.from("product_variants").select("id, barcode, sku, variant_options(value)").in("id", vIds) : { data: [] },
      pIds.length ? sb.from("products").select("id, title").in("id", pIds) : { data: [] },
    ]);
    const vm = new Map(((vs as any[]) || []).map((v) => [v.id, v]));
    const pm = new Map(((ps as any[]) || []).map((p) => [p.id, p.title]));
    setRows(list.map((h) => ({ ...h, title: pm.get(h.product_id) ?? "—", v: vm.get(h.variant_id) })));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function revertBatch(batchId: string) {
    const items = (rows || []).filter((h) => h.batch_id === batchId);
    if (items.some((h) => h.list_code === "site_sale" && !(Number(h.old_amount) > 0))) {
      siteAlert({ message: "Bu kayıtta eski site satış fiyatı boş; geri alınamaz.", tone: "danger" });
      return;
    }
    if (!(await siteConfirm({ title: "Bu kayıt geri alınsın mı?", message: `${items.length} fiyat eski değerine döner (geri alma da geçmişe yazılır).`, confirmText: "Geri al" }))) return;
    setBusy(batchId);
    const payload = items.map((h) => ({ product_id: h.product_id, variant_id: h.variant_id, list_code: h.list_code, amount: h.old_amount }));
    const { error } = await (supabase as any).rpc("apply_price_changes", { p_changes: payload, p_source: "revert" });
    setBusy(null);
    if (error) { siteAlert({ message: error.message, tone: "danger" }); return; }
    siteAlert({ message: "Geri alındı.", tone: "success" });
    load(); onReverted();
  }

  if (!rows) return <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  const shown = rows.filter((h) => tokens.every((t) => norm([h.title, h.v?.barcode, h.v?.sku, h.v?.variant_options?.value, listName(h.list_code)].filter(Boolean).join(" ")).includes(t)));
  const firstOfBatch = new Set<string>();

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara: ürün, barkod, liste…"
          className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm" />
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Tarih</th><th className="px-3 py-2">Ürün</th><th className="px-3 py-2">Barkod</th>
              <th className="px-3 py-2">Liste</th><th className="px-3 py-2 text-right">Eski</th><th className="px-3 py-2 text-right">Yeni</th>
              <th className="px-3 py-2">Kaynak</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Kayıt yok.</td></tr>
            ) : shown.map((h) => {
              const showRevert = h.batch_id && !firstOfBatch.has(h.batch_id);
              if (h.batch_id) firstOfBatch.add(h.batch_id);
              const pct = h.old_amount && h.new_amount != null ? ((Number(h.new_amount) - Number(h.old_amount)) / Number(h.old_amount)) * 100 : null;
              return (
                <tr key={h.id}>
                  <td className="px-3 py-1.5 text-xs text-slate-500 whitespace-nowrap">{new Date(h.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-3 py-1.5 text-xs">{h.title}{h.v?.variant_options?.value ? <span className="text-blue-600 font-bold"> · {h.v.variant_options.value}</span> : null}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{h.v?.barcode ?? ""}</td>
                  <td className="px-3 py-1.5 text-xs">{listName(h.list_code)}</td>
                  <td className="px-3 py-1.5 text-right text-xs text-slate-500">{h.old_amount != null ? fmt(Number(h.old_amount)) : "—"}</td>
                  <td className="px-3 py-1.5 text-right text-xs font-bold">
                    {h.new_amount != null ? fmt(Number(h.new_amount)) : "silindi"}
                    {pct != null && Math.abs(pct) >= 0.01 && (
                      <span className={cn("ml-1 text-[10px]", Math.abs(pct) >= 30 ? "text-red-600" : pct > 0 ? "text-green-700" : "text-orange-700")}>
                        {Math.abs(pct) >= 30 && <AlertTriangle size={10} className="inline mb-0.5" />} {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-slate-500">{h.source === "price_page" ? "Fiyatlar" : h.source === "revert" ? "Geri alma" : h.source}</td>
                  <td className="px-3 py-1.5 text-right">
                    {showRevert && (
                      <button disabled={busy === h.batch_id} onClick={() => revertBatch(h.batch_id)} className="text-[11px] text-blue-600 hover:underline whitespace-nowrap">
                        {busy === h.batch_id ? "…" : "Bu kaydı geri al"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Son 500 değişiklik. “Bu kaydı geri al”, aynı anda kaydedilen tüm değişiklikleri eski değerine döndürür.</p>
    </div>
  );
}
