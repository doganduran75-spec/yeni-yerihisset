"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Check, Package, Save, BellRing, X } from "lucide-react";
import { cn } from "@/lib/utils";

type StockRow = {
  key: string;
  productId: string;
  variantId: string | null;
  title: string;
  variantLabel: string;
  sku: string;
  stock: number;
  image: string | null;
  search: string;
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
  const [restockAlert, setRestockAlert] = useState<{ product: string; total: number; sent: number; manual: number } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("products")
      .select(`
        id, title, stock, has_variants, image_url,
        product_variants ( id, sku, stock, variant_options ( value, variant_groups ( name ) ) )
      `)
      .order("title");

    const out: StockRow[] = [];
    for (const p of (data as any[]) || []) {
      const variants = p.product_variants || [];
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
            variantLabel,
            sku: v.sku ?? "",
            stock: Number(v.stock ?? 0),
            image: p.image_url,
            search: norm([p.title, groupName, value, v.sku].filter(Boolean).join(" ")),
          });
        }
      } else {
        out.push({
          key: p.id,
          productId: p.id,
          variantId: null,
          title: p.title,
          variantLabel: "",
          sku: "",
          stock: Number(p.stock ?? 0),
          image: p.image_url,
          search: norm(p.title),
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
          const total = (d.sent ?? 0) + (d.manual ?? 0);
          if (total > 0) {
            setRestockAlert({
              product: r.title + (r.variantLabel ? ` · ${r.variantLabel}` : ""),
              total, sent: d.sent ?? 0, manual: d.manual ?? 0,
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
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <BellRing size={18} className="text-teal-600 shrink-0" />
            <span className="text-teal-900">
              🔔 <b>{restockAlert.product}</b> yeniden stokta! <b>{restockAlert.total} kişi</b> bekliyordu.{" "}
              {restockAlert.sent > 0 && <><b className="text-green-700">{restockAlert.sent} kişiye e-posta gönderildi</b>. </>}
              {restockAlert.manual > 0 && <><b className="text-teal-700">{restockAlert.manual} kişi e-postasız</b> — elden bilgilendirin.</>}
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

      {/* Liste */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed rounded-xl border-slate-200 text-slate-400">
          Eşleşen ürün yok.
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden divide-y">
          {filtered.map((r) => {
            const dirty = isDirty(r);
            const value = edited[r.key] ?? String(r.stock);
            return (
              <div key={r.key} className="flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-white hover:bg-slate-50/60">
                {/* Görsel */}
                <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-50 border border-slate-100 shrink-0 flex items-center justify-center">
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt={r.title} className="w-full h-full object-cover" />
                  ) : (
                    <Package size={18} className="text-slate-300" />
                  )}
                </div>

                {/* Ad + varyant + sku */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-900 truncate">{r.title}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.variantLabel && <span className="text-xs font-medium text-olive-700">{r.variantLabel}</span>}
                    {r.sku && <span className="text-[10px] font-mono text-slate-400">{r.sku}</span>}
                  </div>
                </div>

                {/* Durum rozeti */}
                <div className="hidden sm:block shrink-0 w-20 text-right">
                  {r.stock === 0 ? (
                    <Badge variant="destructive" className="text-[10px]">Tükendi</Badge>
                  ) : r.stock <= 3 ? (
                    <Badge className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100">Az: {r.stock}</Badge>
                  ) : (
                    <span className="text-xs text-slate-400">Stok: {r.stock}</span>
                  )}
                </div>

                {/* Stok input */}
                <Input
                  type="number"
                  min={0}
                  value={value}
                  onChange={(e) => setEdited((prev) => ({ ...prev, [r.key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter" && dirty) saveRow(r); }}
                  className={cn(
                    "w-20 h-10 text-center font-bold shrink-0",
                    dirty && "border-olive-500 ring-1 ring-olive-200"
                  )}
                />

                {/* Kaydet */}
                <Button
                  onClick={() => saveRow(r)}
                  disabled={!dirty || savingKey === r.key}
                  size="sm"
                  className={cn("h-10 shrink-0 gap-1.5", savedKey === r.key && "bg-green-600 hover:bg-green-600")}
                >
                  {savingKey === r.key ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : savedKey === r.key ? (
                    <><Check size={14} /> Kaydedildi</>
                  ) : (
                    "Kaydet"
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
