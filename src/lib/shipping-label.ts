/* eslint-disable @typescript-eslint/no-explicit-any */
// ORTAK KARGO ETİKETİ — site, Trendyol, Hepsiburada aynı tasarım. Yazdırma ayrı pencerede (yönetici paneli
// menüsü / kenar çubuğu basılmasın). Her yazdırmada siparişin güncel kargo kodu kullanılır (sunucu: /api/admin/orders/labels).
// Kâğıt: A5 (şimdilik) ya da 10×15 etiket (Ayarlar › Kargo). Barkod: Code128 (src/lib/code128.ts).
import { supabase } from "@/lib/supabase";
import { code128Svg } from "@/lib/code128";

export type LabelSize = "a5" | "100x150";
type Label = {
  id: string; order: string; channel: string; date: string; code: string; carrier: string;
  to: { name: string; company: string; address: string; district: string; city: string; phone: string };
  items: { qty: number; title: string; variant: string; sku: string }[];
};
type Sender = { name: string; address: string; phone: string };

const CHANNEL: Record<string, string> = { site: "YeriHisset", trendyol: "Trendyol", hepsiburada: "Hepsiburada", amazon: "Amazon" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const trUpper = (s: string) => s.toLocaleUpperCase("tr-TR");
const day = (d: string) => { try { return new Date(d).toLocaleDateString("tr-TR"); } catch { return ""; } };

export function buildLabelsHtml(labels: Label[], sender: Sender, size: LabelSize): string {
  const small = size === "100x150";
  const [w, h] = small ? [100, 150] : [148, 210];
  const maxItems = small ? 5 : 9;
  const pages = labels.map((l) => {
    const items = l.items.slice(0, maxItems).map((i) =>
      `<li><b>${i.qty} ×</b> ${esc(i.title)}${i.variant ? ` — <b>${esc(i.variant)}</b>` : ""}${i.sku ? ` <span class="sku">${esc(i.sku)}</span>` : ""}</li>`).join("");
    const more = l.items.length > maxItems ? `<li class="more">+${l.items.length - maxItems} kalem daha</li>` : "";
    const qty = l.items.reduce((a, i) => a + i.qty, 0);
    return `<section class="label">
  <header><div class="carrier">${esc(trUpper(l.carrier || "Kargo"))}</div><div class="ord"><span>${esc(CHANNEL[l.channel] || l.channel)}</span><b>${esc(l.order)}</b></div></header>
  <div class="bc">${code128Svg(l.code, { height: 80 })}<div class="code">${esc(l.code)}</div></div>
  <div class="to"><div class="tag">ALICI</div>
    <div class="name">${esc(l.to.name)}</div>${l.to.company ? `<div>${esc(l.to.company)}</div>` : ""}
    <div class="addr">${esc(l.to.address)}</div>
    <div class="city">${esc(l.to.district)}${l.to.district && l.to.city ? " / " : ""}<b>${esc(trUpper(l.to.city))}</b></div>
    ${l.to.phone ? `<div class="tel">Tel: ${esc(l.to.phone)}</div>` : ""}
  </div>
  <div class="from"><span class="tag">GÖNDEREN</span> <b>${esc(sender.name)}</b>${sender.address ? ` · ${esc(sender.address)}` : ""}${sender.phone ? ` · ${esc(sender.phone)}` : ""}</div>
  <div class="pack"><div class="tag">PAKET İÇERİĞİ · ${qty} adet</div><ul>${items}${more}</ul></div>
  <footer><span>Sipariş: ${esc(day(l.date))}</span><span>Yazdırıldı: ${esc(new Date().toLocaleString("tr-TR"))}</span></footer>
</section>`;
  }).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Kargo etiketi (${labels.length})</title>
<style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #e5e7eb; font-size: ${small ? 8.5 : 12.5}pt; }
.bar { position: sticky; top: 0; background: #111827; color: #fff; padding: 10px 16px; display: flex; gap: 12px; align-items: center; font-size: 13px; z-index: 1; }
.bar button { background: #fff; color: #111; border: 0; border-radius: 6px; padding: 6px 14px; font-weight: bold; cursor: pointer; }
.label { width: ${w}mm; height: ${h}mm; padding: ${small ? 4 : 7}mm; margin: 8mm auto; background: #fff; display: flex; flex-direction: column; gap: ${small ? 2.5 : 4}mm; overflow: hidden; page-break-after: always; break-after: page; }
header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 0.6mm solid #000; padding-bottom: 2mm; }
.carrier { font-size: 1.9em; font-weight: 900; letter-spacing: 0.02em; }
.ord { text-align: right; display: flex; flex-direction: column; font-size: 0.95em; }
.ord b { font-size: 1.35em; font-family: "Courier New", monospace; }
.bc svg { width: 100%; height: ${small ? 18 : 30}mm; display: block; }
.code { text-align: center; font-family: "Courier New", monospace; font-weight: bold; font-size: 1.5em; letter-spacing: 0.08em; margin-top: 1mm; }
.to { border: 0.6mm solid #000; border-radius: 2mm; padding: ${small ? 2.5 : 4}mm; line-height: 1.3; }
.tag { font-size: 0.75em; font-weight: bold; letter-spacing: 0.12em; color: #333; }
.name { font-size: 1.55em; font-weight: 900; margin: 0.5mm 0 1mm; }
.addr { font-size: 1.1em; }
.city { font-size: 1.25em; margin-top: 1mm; }
.tel { font-size: 1.1em; margin-top: 1mm; font-weight: bold; }
.from { font-size: 0.85em; line-height: 1.3; }
.pack { flex: 1; min-height: 0; border-top: 0.3mm dashed #000; padding-top: 2mm; }
.pack ul { margin: 1mm 0 0; padding-left: 4mm; line-height: 1.35; }
.sku { font-family: "Courier New", monospace; font-size: 0.85em; color: #333; }
.more { list-style: none; font-style: italic; }
footer { display: flex; justify-content: space-between; font-size: 0.75em; color: #333; }
@media print { body { background: #fff; } .bar { display: none; } .label { margin: 0; } }
</style></head><body>
<div class="bar"><button onclick="print()">Yazdır</button><span>${labels.length} etiket · ${small ? "10×15 cm etiket" : "A5 kâğıt"} — yazıcı ayarında “Gerçek boyut / %100” ve kenar boşluğu “Yok” seç.</span></div>
${pages}
<script>setTimeout(function(){ window.print(); }, 400);</script>
</body></html>`;
}

/** Etiketleri yazdır. Pencere tıklamayla hemen açılır (açılır pencere engeli), veri gelince dolar. */
export async function printShippingLabels(ids: string[]): Promise<{ printed: number; skipped: { order: string; reason: string }[]; error?: string }> {
  const w = window.open("", "_blank");
  if (!w) return { printed: 0, skipped: [], error: "Tarayıcı yeni pencereyi engelledi — bu site için açılır pencerelere izin ver." };
  w.document.write("<p style='font-family:Arial;padding:24px'>Etiket hazırlanıyor…</p>");
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/orders/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ ids, mark: true }),
    });
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    if (!d.labels?.length) { w.close(); return { printed: 0, skipped: d.skipped || [] }; }
    w.document.open();
    w.document.write(buildLabelsHtml(d.labels, d.sender, d.size === "100x150" ? "100x150" : "a5"));
    w.document.close();
    return { printed: d.labels.length, skipped: d.skipped || [] };
  } catch (e: any) {
    w.close();
    return { printed: 0, skipped: [], error: e?.message || "Etiket hazırlanamadı" };
  }
}

/** Kargo kodu son yazdırılan etiketten farklı mı (etiket yeniden basılmalı) */
export function labelOutdated(o: { label_printed_code?: string | null; cargo_tracking_number?: string | null; kargonomi_tracking_code?: string | null }): boolean {
  const code = o.cargo_tracking_number || o.kargonomi_tracking_code || "";
  return !!o.label_printed_code && !!code && o.label_printed_code !== code;
}
