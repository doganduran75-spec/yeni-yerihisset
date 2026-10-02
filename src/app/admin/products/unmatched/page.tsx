"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// EŞLEŞMEYEN ESKİ ÜRÜNLER: eski siteden aktarılan siparişlerde sitedeki bir ürüne
// bağlanamamış satırlar (modele göre gruplu). Ürünü sitede tanımla, sonra:
//   * eski SKU'yu varyanta verdiysen → "Yeniden eşleştir"
//   * farklı SKU verdiysen → modeli aç, ürünü seç; numaralar otomatik eşlenir, kaydet
// Geçmiş siparişler ve müşterinin numara geçmişi ürüne bağlanır. Stoğa dokunmaz.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminOpsTabs from "@/components/admin/AdminOpsTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert } from "@/components/ui/site-dialog";
import { Loader2, Link2, RefreshCw, Search, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

type Size = { sku: string | null; size: string; qty: number; orders: number };
type Group = { model: string; channels: string[]; qty: number; orders: number; last: string; sizes: Size[] };
type Variant = { id: string; sku: string | null; barcode: string | null; product_id: string; title: string; option: string };

const CH_LABEL: Record<string, string> = { site: "YeriHisset", attipas: "Attipas" };
const normSize = (v: string) => v.toLowerCase().replace(",", ".").replace(/\s+/g, "");

export default function UnmatchedProductsPage() {
  const [data, setData] = useState<{ groups: Group[]; totalItems: number; mapped: number } | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/legacy-match", { headers: await authHeaders(), cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) setData(j);
    else siteAlert({ title: "Liste alınamadı", message: j.error || "Hata", tone: "danger" });
  }, []);

  useEffect(() => {
    load();
    (async () => {
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: vs } = await (supabase as any).from("product_variants")
          .select("id, sku, barcode, product_id, products(title), variant_options(value)")
          .range(from, from + 999);
        all.push(...(vs || []));
        if (!vs || vs.length < 1000) break;
      }
      setVariants(all.map((v) => ({
        id: v.id, sku: v.sku, barcode: v.barcode, product_id: v.product_id,
        title: v.products?.title ?? "—", option: v.variant_options?.value ?? "",
      })));
    })();
  }, [load]);

  async function post(body: any) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/legacy-match", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Kaydedilemedi");
      siteAlert({ message: `${j.matched} satır eşleşti · ${j.unmatched} satır hâlâ eşleşmedi.`, tone: "success" });
      setOpen(null);
      await load();
    } catch (e: any) {
      siteAlert({ title: "Hata", message: e.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => {
    const n = q.trim().toLocaleLowerCase("tr-TR");
    if (!data) return [];
    if (!n) return data.groups;
    return data.groups.filter((g) => g.model.toLocaleLowerCase("tr-TR").includes(n) || g.sizes.some((s) => (s.sku || "").toLowerCase().includes(n)));
  }, [data, q]);

  return (
    <div className="space-y-4">
      <AdminOpsTabs active="products" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/products" className="text-xs text-muted-foreground hover:underline flex items-center gap-1 mb-1"><ArrowLeft size={12} /> Ürünler</Link>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Link2 size={22} className="text-olive-600" /> Eşleşmeyen Eski Ürünler</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-3xl">
            Eski siteden aktarılan siparişlerde sitede karşılığı bulunamayan ürünler. Ürünü sitede tanımla:
            eski SKU&apos;yu varyanta verdiysen <b>Yeniden eşleştir</b>; farklı SKU verdiysen modeli açıp ürünü seç.
            Ciro eşleşmeden bağımsız sayılır; eşleşince satış ve numara geçmişi ürüne bağlanır. Stoğa dokunmaz.
          </p>
        </div>
        <Button onClick={() => post({ action: "rematch" })} disabled={busy} className="gap-2">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Yeniden eşleştir
        </Button>
      </div>

      {!data ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Model / SKU ara…" className="h-9 pl-8 w-64" />
            </div>
            <span className="text-muted-foreground">{data.groups.length} model · {data.totalItems} sipariş satırı · {data.mapped} elle bağlanmış SKU</span>
          </div>

          {groups.length === 0 ? (
            <div className="rounded-xl border bg-white p-10 text-center text-muted-foreground">
              {data.groups.length === 0 ? "Eşleşmeyen ürün yok 🎉" : "Aramaya uyan model yok."}
            </div>
          ) : (
            <div className="rounded-xl border bg-white divide-y">
              {groups.map((g) => (
                <div key={g.model}>
                  <button onClick={() => setOpen(open === g.model ? null : g.model)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    {open === g.model ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold text-sm block truncate">{g.model}</span>
                      <span className="text-xs text-muted-foreground">
                        {g.sizes.length} numara · {g.channels.map((c) => CH_LABEL[c] ?? c).join(", ")} · son satış {g.last ? new Date(g.last).toLocaleDateString("tr-TR") : "—"}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <b className="text-sm">{g.qty} adet</b>
                      <span className="block text-xs text-muted-foreground">{g.orders} sipariş</span>
                    </span>
                  </button>
                  {open === g.model && <MapPanel group={g} variants={variants} busy={busy} onSave={(pairs) => post({ action: "map", pairs })} />}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MapPanel({ group, variants, busy, onSave }: {
  group: Group; variants: Variant[]; busy: boolean; onSave: (pairs: { old_sku: string; variant_id: string }[]) => void;
}) {
  const products = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of variants) m.set(v.product_id, v.title);
    return [...m.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, "tr"));
  }, [variants]);
  const [pq, setPq] = useState("");
  const [productId, setProductId] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({});

  const pvs = variants.filter((v) => v.product_id === productId);
  function pick(id: string) {
    setProductId(id);
    // Numaraları otomatik eşle: eski numara = varyant seçeneği (22,5 = 22.5)
    const vs = variants.filter((v) => v.product_id === id);
    const auto: Record<string, string> = {};
    for (const s of group.sizes) {
      if (!s.sku) continue;
      const hit = vs.find((v) => s.size && normSize(v.option) === normSize(s.size));
      if (hit) auto[s.sku] = hit.id;
    }
    setChoice(auto);
  }

  const found = products.filter((p) => !pq.trim() || p.title.toLocaleLowerCase("tr-TR").includes(pq.trim().toLocaleLowerCase("tr-TR"))).slice(0, 30);
  const pairs = Object.entries(choice).filter(([, v]) => v).map(([old_sku, variant_id]) => ({ old_sku, variant_id }));
  const sel = "h-8 rounded-md border border-input bg-background px-2 text-xs w-full";

  return (
    <div className="px-4 pb-4 pt-1 bg-slate-50/60 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold">1. Sitedeki ürünü seç</label>
          <Input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Ürün adı ara…" className="h-8 text-xs" />
          <select value={productId} onChange={(e) => pick(e.target.value)} className={sel} size={6}>
            {found.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {products.length === 0 && <p className="text-[11px] text-muted-foreground">Ürünler yükleniyor…</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold">2. Numaraları kontrol et (otomatik eşlendi)</label>
          <div className="rounded-md border bg-white divide-y max-h-56 overflow-y-auto">
            {group.sizes.map((s) => (
              <div key={s.sku ?? s.size} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                <span className="w-28 shrink-0 font-mono truncate" title={s.sku ?? ""}>{s.sku ?? "SKU yok"}</span>
                <span className="w-14 shrink-0 text-muted-foreground">{s.size || "—"} · {s.qty}</span>
                {s.sku ? (
                  <select value={choice[s.sku] ?? ""} onChange={(e) => setChoice((c) => ({ ...c, [s.sku!]: e.target.value }))} className={sel} disabled={!productId}>
                    <option value="">— bağlama —</option>
                    {pvs.map((v) => <option key={v.id} value={v.id}>{v.option || "tek"}{v.sku ? ` · ${v.sku}` : ""}</option>)}
                  </select>
                ) : (
                  <span className="text-muted-foreground">eski sitede SKU yoktu, bağlanamaz</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={busy || pairs.length === 0} onClick={() => onSave(pairs)} className="gap-1.5">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} {pairs.length} numarayı bağla
        </Button>
      </div>
    </div>
  );
}
