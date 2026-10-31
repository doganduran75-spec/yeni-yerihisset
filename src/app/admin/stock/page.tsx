"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import AdminOpsTabs from "@/components/admin/AdminOpsTabs";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Check, Package, Save, BellRing, X, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { sortByVariantValue } from "@/lib/variant-sort";

type StockRow = {
  key: string;
  productId: string;
  variantId: string | null;
  title: string;
  description: string;   // ürün kısa açıklaması
  variantLabel: string;  // grup: değer (arama için)
  sizeValue: string;     // yalnız numara/değer (tabloda "Numara" sütunu)
  sku: string;
  barcode: string;
  taban: string;         // ürün seviyesinde Taban değeri ("" yoksa)
  saya: string;          // ürün seviyesinde Saya değeri
  stock: number;
  inProduction: number;  // üreticiye verilen (üretimdeki) adet — elle girilir
  image: string | null;
  search: string;
  waiting: number; // bu ürün/varyant için stok bekleyen (pending) kişi sayısı
  notified: number; // stoğa girince haber verilmiş kişi sayısı (talep geçmişi — üretim kararı için)
  modelId: string | null; // kategorinin alt kırılımı (Bot › 01) — aynı modelin renklerini gruplar
  modelLabel: string;     // "Bot · 01" ("" yoksa)
};

// Türkçe-duyarsız normalize (arama için): küçült + Türkçe karakterleri sadeleştir
function norm(s: string): string {
  return (s || "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("İ", "i")
    .replaceAll("ş", "s").replaceAll("ğ", "g")
    .replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c");
}

export default function StockPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  // "Üretimde" kolonu (üreticiye verilen adet) — elle düzenlenir
  const [prodEdited, setProdEdited] = useState<Record<string, string>>({});
  const [prodSaving, setProdSaving] = useState<string | null>(null);
  const [prodSaved, setProdSaved] = useState<string | null>(null);
  // Stok gelince: bu ürünü bekleyenler uyarısı
  const [restockAlert, setRestockAlert] = useState<{ product: string; total: number; sent: number; manual: number; failed: number; error?: string } | null>(null);
  // Model süzgeci ("" = tümü) — seçilince numara bazında renklerin toplamı gösterilir
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [modelFilter, setModelFilter] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("products")
      .select(`
        id, title, short_description, stock, in_production, has_variants, image_url, taban_option_id, saya_option_id, model_id,
        product_variants ( id, sku, barcode, stock, in_production, variant_options ( value, variant_groups ( name ) ) )
      `)
      .order("title");

    // Stok bildirimleri → ürün/varyant başına: bekleyen (pending) + bilgi verilmiş (notified).
    // Bilgi verilen sayısı talep geçmişidir (müşteri almasa bile) → hangi renk-numara üretilmeli kararı.
    const waitMap = new Map<string, number>();
    const notifMap = new Map<string, number>();
    for (let from = 0; ; from += 1000) {
      const { data: notifs } = await (supabase as any)
        .from("stock_notifications")
        .select("product_id, variant_id, status")
        .range(from, from + 999);
      for (const n of (notifs as any[]) || []) {
        const k = `${n.product_id}::${n.variant_id ?? ""}`;
        const m = n.status === "notified" ? notifMap : waitMap;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      if (!notifs || notifs.length < 1000) break;
    }
    const waitOf = (productId: string, variantId: string | null) =>
      waitMap.get(`${productId}::${variantId ?? ""}`) ?? 0;
    const notifiedOf = (productId: string, variantId: string | null) =>
      notifMap.get(`${productId}::${variantId ?? ""}`) ?? 0;

    // Taban/Saya option id'lerini değere çöz (variant_options'tan)
    const prods = (data as any[]) || [];
    const optIds = [...new Set(prods.flatMap((p) => [p.taban_option_id, p.saya_option_id]).filter(Boolean))] as string[];
    const optMap = new Map<string, string>();
    if (optIds.length) {
      const { data: opts } = await (supabase as any).from("variant_options").select("id, value").in("id", optIds);
      (opts as any[] || []).forEach((o) => optMap.set(o.id, o.value ?? ""));
    }

    // Modeller (Bot · 01) — yalnız panel
    const { data: mdls } = await (supabase as any).from("product_models").select("id, code, name, categories(name)");
    const modelMap = new Map<string, string>();
    for (const m of (mdls as any[]) || []) {
      modelMap.set(m.id, [m.categories?.name, m.code].filter(Boolean).join(" · ") + (m.name ? ` (${m.name})` : ""));
    }
    const usedModels = [...new Set(prods.map((p) => p.model_id).filter((id) => id && modelMap.has(id)))] as string[];
    setModels(usedModels.map((id) => ({ id, label: modelMap.get(id)! })).sort((a, b) => a.label.localeCompare(b.label, "tr")));

    const out: StockRow[] = [];
    for (const p of prods) {
      const modelId: string | null = p.model_id && modelMap.has(p.model_id) ? p.model_id : null;
      const modelLabel = modelId ? modelMap.get(modelId)! : "";
      const taban = p.taban_option_id ? (optMap.get(p.taban_option_id) ?? "") : "";
      const saya = p.saya_option_id ? (optMap.get(p.saya_option_id) ?? "") : "";
      const desc = p.short_description ?? "";
      const variants = sortByVariantValue(p.product_variants || [], (v: any) => v.variant_options?.value);
      if (variants.length > 0) {
        for (const v of variants) {
          const value = v.variant_options?.value ?? "";
          const groupName = v.variant_options?.variant_groups?.name ?? "";
          const variantLabel = value ? (groupName ? `${groupName}: ${value}` : value) : "";
          out.push({
            key: v.id,
            productId: p.id,
            variantId: v.id,
            title: p.title,
            description: desc,
            variantLabel,
            sizeValue: value,
            sku: v.sku ?? "",
            barcode: v.barcode ?? "",
            taban,
            saya,
            stock: Number(v.stock ?? 0),
            inProduction: Number(v.in_production ?? 0),
            image: p.image_url,
            search: norm([p.title, desc, groupName, value, v.sku, v.barcode, taban, saya, modelLabel].filter(Boolean).join(" ")),
            waiting: waitOf(p.id, v.id),
            notified: notifiedOf(p.id, v.id),
            modelId, modelLabel,
          });
        }
      } else {
        out.push({
          key: p.id,
          productId: p.id,
          variantId: null,
          title: p.title,
          description: desc,
          variantLabel: "",
          sizeValue: "",
          sku: "",
          barcode: "",
          taban,
          saya,
          stock: Number(p.stock ?? 0),
          inProduction: Number(p.in_production ?? 0),
          image: p.image_url,
          search: norm([p.title, desc, taban, saya, modelLabel].filter(Boolean).join(" ")),
          waiting: waitOf(p.id, null),
          notified: notifiedOf(p.id, null),
          modelId, modelLabel,
        });
      }
    }
    setRows(out);
    setLoading(false);
  }

  // Çok-kelimeli AND arama: her kelime satır metninde geçmeli
  const filtered = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    const base = modelFilter ? rows.filter((r) => r.modelId === modelFilter) : rows;
    if (tokens.length === 0) return base;
    return base.filter((r) => tokens.every((t) => r.search.includes(t)));
  }, [rows, query, modelFilter]);

  // Seçili modelin numara bazında toplamı (tüm renkler birlikte) — üretim kararı için
  const modelSummary = useMemo(() => {
    if (!modelFilter) return null;
    const mr = rows.filter((r) => r.modelId === modelFilter);
    const colors = new Set(mr.map((r) => r.productId)).size;
    const by = new Map<string, { size: string; stock: number; inProduction: number; waiting: number; notified: number }>();
    for (const r of mr) {
      const k = r.sizeValue || "—";
      const b = by.get(k) ?? { size: k, stock: 0, inProduction: 0, waiting: 0, notified: 0 };
      b.stock += r.stock; b.inProduction += r.inProduction; b.waiting += r.waiting; b.notified += r.notified;
      by.set(k, b);
    }
    return { colors, sizes: sortByVariantValue([...by.values()], (b) => b.size) };
  }, [rows, modelFilter]);

  function isDirty(r: StockRow): boolean {
    const e = edited[r.key];
    return e !== undefined && e !== "" && Number(e) !== r.stock && Number(e) >= 0;
  }

  const dirtyRows = useMemo(() => rows.filter(isDirty), [rows, edited]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRow(r: StockRow): Promise<boolean> {
    const val = Number(edited[r.key]);
    if (!(val >= 0) || val === r.stock) return false;
    setSavingKey(r.key);
    try {
      const { error } = await (supabase as any).rpc("admin_set_stock", {
        p_product_id: r.productId,
        p_variant_id: r.variantId,
        p_new_stock: val,
        p_source: "admin_manual",
      });
      if (error) throw error;
      const wasOut = r.stock <= 0; // düşümden önceki stok
      setRows((prev) => prev.map((x) => x.key === r.key ? { ...x, stock: val } : x));
      setEdited((prev) => { const n = { ...prev }; delete n[r.key]; return n; });
      setSavedKey(r.key);
      setTimeout(() => setSavedKey((k) => (k === r.key ? null : k)), 2000);

      // Stok 0→artı olduysa: bekleyen e-postalılara OTOMATİK "stok geldi" maili
      // gönder (+ notified işaretle); e-postasızlar elden bilgilendirilir.
      if (wasOut && val > 0) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch("/api/stock-notify/dispatch", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({ productId: r.productId, variantId: r.variantId || null }),
          });
          const d = await res.json();
          const total = (d.sent ?? 0) + (d.manual ?? 0) + (d.failed ?? 0);
          if (total > 0) {
            setRestockAlert({
              product: r.title + (r.variantLabel ? ` · ${r.variantLabel}` : ""),
              total, sent: d.sent ?? 0, manual: d.manual ?? 0, failed: d.failed ?? 0, error: d.error,
            });
          }
        } catch (e) { console.error("[stok] bildirim gönderimi:", e); }
      }
      return true;
    } catch (e: any) {
      alert("Stok güncellenemedi: " + (e?.message ?? "hata"));
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  // "Üretimde" adedini kaydet (ürün/varyant seviyesinde, doğrudan güncelleme)
  async function saveProduction(r: StockRow) {
    const raw = prodEdited[r.key];
    if (raw === undefined) return;
    const val = Number(raw);
    if (!(val >= 0)) { setProdEdited((p) => { const n = { ...p }; delete n[r.key]; return n; }); return; }
    if (val === r.inProduction) { setProdEdited((p) => { const n = { ...p }; delete n[r.key]; return n; }); return; }
    setProdSaving(r.key);
    try {
      const table = r.variantId ? "product_variants" : "products";
      const id = r.variantId ?? r.productId;
      const { error } = await (supabase as any).from(table).update({ in_production: val }).eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.map((x) => x.key === r.key ? { ...x, inProduction: val } : x));
      setProdEdited((p) => { const n = { ...p }; delete n[r.key]; return n; });
      setProdSaved(r.key);
      setTimeout(() => setProdSaved((k) => (k === r.key ? null : k)), 1500);
    } catch (e: any) {
      alert("Üretimde güncellenemedi: " + (e?.message ?? "hata"));
    } finally {
      setProdSaving(null);
    }
  }

  // Excel'e aktar — tüm satırlar + tüm kolonlar (.xls; Excel HTML tablosu olarak açar)
  function exportExcel() {
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const headers = ["Ürün", "Model", "Numara", "Stok Kodu", "Barkod", "Taban", "Saya", "Bekleyen", "Bilgi verildi", "Stok", "Üretimde"];
    const body = rows.map((r) => `<tr>
      <td>${esc(r.title)}</td>
      <td>${esc(r.modelLabel)}</td>
      <td>${esc(r.sizeValue)}</td>
      <td>${esc(r.sku)}</td>
      <td>${esc(r.barcode)}</td>
      <td>${esc(r.taban)}</td>
      <td>${esc(r.saya)}</td>
      <td>${r.waiting}</td>
      <td>${r.notified}</td>
      <td>${r.stock}</td>
      <td>${r.inProduction}</td>
    </tr>`).join("");
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stok-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function saveAll() {
    setBulkSaving(true);
    for (const r of dirtyRows) {
      // sıralı — RPC atomik; hata olursa alert gösterir ve devam eder
      // eslint-disable-next-line no-await-in-loop
      await saveRow(r);
    }
    setBulkSaving(false);
  }

  return (
    <div className="space-y-6">
      <AdminOpsTabs active="stock" />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Stok Yönetimi</h2>
          <p className="text-muted-foreground">
            Ara, stok adedini değiştir, satır başında Kaydet'e bas. Web sitesi anında güncellenir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel} className="gap-2" title="Tüm stok listesini Excel'e aktar">
            <FileDown size={16} /> Excel'e Aktar
          </Button>
          {dirtyRows.length > 0 && (
            <Button onClick={saveAll} disabled={bulkSaving} className="gap-2">
              {bulkSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {dirtyRows.length} değişikliği kaydet
            </Button>
          )}
        </div>
      </div>

      {/* Stok gelince: bekleyenler uyarısı */}
      {restockAlert && (
        <div className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3",
          restockAlert.failed > 0 ? "border-amber-300 bg-amber-50" : "border-teal-200 bg-teal-50"
        )}>
          <div className="flex items-center gap-2 text-sm">
            <BellRing size={18} className={cn("shrink-0", restockAlert.failed > 0 ? "text-amber-600" : "text-teal-600")} />
            <span className="text-teal-900">
              🔔 <b>{restockAlert.product}</b> yeniden stokta! <b>{restockAlert.total} kişi</b> bekliyordu.{" "}
              {restockAlert.sent > 0 && <><b className="text-green-700">{restockAlert.sent} kişiye e-posta gönderildi</b>. </>}
              {restockAlert.manual > 0 && <><b className="text-teal-700">{restockAlert.manual} kişi e-postasız</b> — elden bilgilendirin. </>}
              {restockAlert.failed > 0 && (
                <><b className="text-red-700">{restockAlert.failed} e-posta GÖNDERİLEMEDİ</b>
                {restockAlert.error && <span className="text-red-600"> — {restockAlert.error}</span>}
                {" "}(pending kaldı, stoğu tekrar kaydedince yeniden denenir).</>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/admin/crm/stock-notifications" className="text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg px-3 py-1.5">
              Bildirimlere git
            </a>
            <button onClick={() => setRestockAlert(null)} className="text-teal-500 hover:text-teal-700 p-1"><X size={16} /></button>
          </div>
        </div>
      )}

      {/* Arama + model süzgeci */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ara: "bot siyah", "bot 38", "sandalet 40"...'
            className="h-12 pl-12 rounded-xl text-base"
          />
        </div>
        {models.length > 0 && (
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="h-12 rounded-xl border border-input bg-white px-3 text-sm sm:w-64"
            title="Aynı modelin renklerini birlikte göster (Ayarlar › Varyasyonlar › Modeller)"
          >
            <option value="">Tüm modeller</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        {loading ? "Yükleniyor..." : `${filtered.length} / ${rows.length} kalem`}
        {(query || modelFilter) && " (süzgece göre)"}
      </p>

      {/* Model seçiliyken: numara bazında tüm renklerin toplamı */}
      {modelSummary && modelSummary.sizes.length > 0 && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
          <p className="text-xs font-bold text-blue-900 mb-2">
            {models.find((m) => m.id === modelFilter)?.label} — {modelSummary.colors} renk, numara bazında toplam
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <th className="pr-4 py-1">Numara</th>
                  {modelSummary.sizes.map((b) => <th key={b.size} className="px-2 py-1 text-center">{b.size}</th>)}
                </tr>
              </thead>
              <tbody>
                {([["Stok", "stock"], ["Üretimde", "inProduction"], ["Bekleyen", "waiting"], ["Bilgi verildi", "notified"]] as const).map(([label, k]) => (
                  <tr key={k} className="border-t border-blue-100">
                    <td className="pr-4 py-1 font-semibold text-slate-600 whitespace-nowrap">{label}</td>
                    {modelSummary.sizes.map((b) => (
                      <td key={b.size} className={cn("px-2 py-1 text-center font-bold",
                        b[k] === 0 ? "text-slate-300" : k === "stock" ? "text-slate-800" : k === "inProduction" ? "text-blue-700" : k === "waiting" ? "text-amber-700" : "text-slate-600")}>
                        {b[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Liste — başlıklı tablo (yatay kaydırmalı) */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed rounded-xl border-slate-200 text-slate-400">
          Eşleşen ürün yok.
        </div>
      ) : (
        <div className="rounded-2xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500 border-b">
                <th className="px-3 py-2.5">Ürün</th>
                <th className="px-3 py-2.5">Stok Kodu</th>
                <th className="px-3 py-2.5">Barkod</th>
                <th className="px-3 py-2.5 text-center">Numara</th>
                <th className="px-3 py-2.5">Taban</th>
                <th className="px-3 py-2.5">Saya</th>
                <th className="px-3 py-2.5 text-center">Bekleyen</th>
                <th className="px-3 py-2.5 text-center" title="Stoğa girince haber verilmiş kişi sayısı (alsın almasın) — talep geçmişi">Bilgi verildi</th>
                <th className="px-3 py-2.5 text-center">Stok</th>
                <th className="px-3 py-2.5 text-center">Üretimde</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => {
                const dirty = isDirty(r);
                const value = edited[r.key] ?? String(r.stock);
                return (
                  <tr key={r.key} className="bg-white hover:bg-slate-50/60 align-middle">
                    {/* Ürün (görsel + ad) */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5 min-w-[180px]">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-50 border border-slate-100 shrink-0 flex items-center justify-center">
                          {r.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.image} alt={r.title} className="w-full h-full object-cover" />
                          ) : (
                            <Package size={16} className="text-slate-300" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 line-clamp-2">{r.title}</span>
                          {r.modelLabel && <span className="block text-[10px] text-blue-700/80">Model {r.modelLabel}</span>}
                        </div>
                      </div>
                    </td>
                    {/* SKU */}
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{r.sku || "—"}</td>
                    {/* Barkod */}
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{r.barcode || "—"}</td>
                    {/* Numara */}
                    <td className="px-3 py-2 text-center">
                      {r.sizeValue ? <span className="font-bold text-olive-700">{r.sizeValue}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Taban */}
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{r.taban ? r.taban : <span className="text-slate-300">—</span>}</td>
                    {/* Saya */}
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{r.saya ? r.saya : <span className="text-slate-300">—</span>}</td>
                    {/* Bekleyen */}
                    <td className="px-3 py-2 text-center">
                      {r.waiting > 0 ? (
                        <span
                          title={`${r.waiting} kişi bu ürün için stok bekliyor`}
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                            r.stock <= 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          )}
                        >
                          <BellRing size={10} /> {r.waiting}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {/* Bilgi verildi (talep geçmişi) */}
                    <td className="px-3 py-2 text-center text-xs" title={r.notified ? `${r.notified} kişiye “stoğa girdi” bilgisi verildi` : undefined}>
                      {r.notified > 0 ? <span className="font-semibold text-slate-600">{r.notified}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Stok input */}
                    <td className="px-3 py-2 text-center">
                      <Input
                        type="number"
                        min={0}
                        value={value}
                        onChange={(e) => setEdited((prev) => ({ ...prev, [r.key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter" && dirty) saveRow(r); }}
                        className={cn(
                          "w-20 h-9 text-center font-bold mx-auto",
                          r.stock === 0 && !dirty && "text-red-600",
                          dirty && "border-olive-500 ring-1 ring-olive-200"
                        )}
                      />
                    </td>
                    {/* Üretimde — elle düzenle, blur/Enter'da kaydeder */}
                    <td className="px-3 py-2 text-center">
                      <div className="relative w-24 mx-auto">
                        <Input
                          type="number"
                          min={0}
                          value={prodEdited[r.key] ?? String(r.inProduction)}
                          onChange={(e) => setProdEdited((prev) => ({ ...prev, [r.key]: e.target.value }))}
                          onBlur={() => saveProduction(r)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className={cn(
                            "w-24 h-9 text-center font-bold",
                            (r.inProduction ?? 0) > 0 && "text-blue-700",
                            prodEdited[r.key] !== undefined && "border-blue-400 ring-1 ring-blue-200"
                          )}
                        />
                        {prodSaving === r.key ? (
                          <Loader2 size={13} className="animate-spin absolute right-1.5 top-1/2 -translate-y-1/2 text-blue-500" />
                        ) : prodSaved === r.key ? (
                          <Check size={13} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-green-600" />
                        ) : null}
                      </div>
                    </td>
                    {/* Kaydet */}
                    <td className="px-3 py-2 text-right">
                      <Button
                        onClick={() => saveRow(r)}
                        disabled={!dirty || savingKey === r.key}
                        size="sm"
                        className={cn("h-9 gap-1.5", savedKey === r.key && "bg-green-600 hover:bg-green-600")}
                      >
                        {savingKey === r.key ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : savedKey === r.key ? (
                          <><Check size={14} /> Kaydedildi</>
                        ) : (
                          "Kaydet"
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
