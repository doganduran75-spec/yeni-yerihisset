"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import AdminOpsTabs from "@/components/admin/AdminOpsTabs";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Check, Package, Save, BellRing, X } from "lucide-react";
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
  image: string | null;
  search: string;
  waiting: number; // bu ürün/varyant için stok bekleyen (pending) kişi sayısı
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
  // Stok gelince: bu ürünü bekleyenler uyarısı
  const [restockAlert, setRestockAlert] = useState<{ product: string; total: number; sent: number; manual: number; failed: number; error?: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("products")
      .select(`
        id, title, short_description, stock, has_variants, image_url, taban_option_id, saya_option_id,
        product_variants ( id, sku, barcode, stock, variant_options ( value, variant_groups ( name ) ) )
      `)
      .order("title");

    // Bekleyen (pending) stok bildirimleri → ürün/varyant başına sayım
    const waitMap = new Map<string, number>();
    const { data: notifs } = await (supabase as any)
      .from("stock_notifications")
      .select("product_id, variant_id")
      .eq("status", "pending");
    for (const n of (notifs as any[]) || []) {
      const k = `${n.product_id}::${n.variant_id ?? ""}`;
      waitMap.set(k, (waitMap.get(k) ?? 0) + 1);
    }
    const waitOf = (productId: string, variantId: string | null) =>
      waitMap.get(`${productId}::${variantId ?? ""}`) ?? 0;

    // Taban/Saya option id'lerini değere çöz (variant_options'tan)
    const prods = (data as any[]) || [];
    const optIds = [...new Set(prods.flatMap((p) => [p.taban_option_id, p.saya_option_id]).filter(Boolean))] as string[];
    const optMap = new Map<string, string>();
    if (optIds.length) {
      const { data: opts } = await (supabase as any).from("variant_options").select("id, value").in("id", optIds);
      (opts as any[] || []).forEach((o) => optMap.set(o.id, o.value ?? ""));
    }

    const out: StockRow[] = [];
    for (const p of prods) {
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
            image: p.image_url,
            search: norm([p.title, desc, groupName, value, v.sku, v.barcode, taban, saya].filter(Boolean).join(" ")),
            waiting: waitOf(p.id, v.id),
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
          image: p.image_url,
          search: norm([p.title, desc, taban, saya].filter(Boolean).join(" ")),
          waiting: waitOf(p.id, null),
        });
      }
    }
    setRows(out);
    setLoading(false);
  }

  // Çok-kelimeli AND arama: her kelime satır metninde geçmeli
  const filtered = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return rows;
    return rows.filter((r) => tokens.every((t) => r.search.includes(t)));
  }, [rows, query]);

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
        {dirtyRows.length > 0 && (
          <Button onClick={saveAll} disabled={bulkSaving} className="gap-2">
            {bulkSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {dirtyRows.length} değişikliği kaydet
          </Button>
        )}
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

      {/* Arama */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Ara: "bot siyah", "bot 38", "sandalet 40"...'
          className="h-12 pl-12 rounded-xl text-base"
        />
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        {loading ? "Yükleniyor..." : `${filtered.length} / ${rows.length} kalem`}
        {query && " (aramaya göre)"}
      </p>

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
                <th className="px-3 py-2.5 text-center">Stok</th>
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
                        <span className="font-semibold text-slate-900 line-clamp-2">{r.title}</span>
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
