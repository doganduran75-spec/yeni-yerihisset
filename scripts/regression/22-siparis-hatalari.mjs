// SİPARİŞTEKİ HATALAR PANODA (kullanıcı 2026-11-26): Trendyol fatura yükleme hatası siparişin içinde kaldı, panoda görünmedi.
// Entegrasyon adımı hata verip öyle kalan sipariş (Paraşüt faturası, pazaryerine fatura yükleme, Trendyol "işleme al",
// kargo entegrasyonu) panoda + listede "Hata aldı" işine düşer; siparişte sıradaki adımda kırmızı kutu + gerekirse
// "yeniden yükle" düğmesi. Hata giderilince kendiliğinden çıkar. Bakım ("retry") ve Hepsiburada paket bekleme hata değildir.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Siparişteki hatalar panoda (Hata aldı)",
  async run(t) {
    await t.part("Kural: hangi durum hata sayılır", async () => {
      let nx = null;
      try { nx = await import(new URL("../../src/lib/order-next-step.ts", import.meta.url)); } catch { /* eski Node */ }
      if (!nx) { t.add("warn", "Hata kuralı denenemedi", "Node TS yükleyemedi"); return; }
      const D = new Date().toISOString();
      const ty = { channel: "trendyol", status: "processing", payment_status: "paid", shipment_status: "preparing", invoice_status: "invoiced",
        total_amount: 3750, created_at: D, packed_at: D, parasut_status: "done", parasut_pdf_path: "x.pdf", mp_picking_at: D };
      const st = (o) => nx.orderNextStep(o);
      const upErr = st({ ...ty, mp_invoice_error: "Trendyol fatura yükleme 400: Micro export type'lari icin fatura bilgisi zorunludur." });
      const cases = [
        ["Trendyol'a fatura yüklenemedi (11875159131) → Hata aldı + yeniden yükle", upErr.needsAction && nx.todoKind(upErr) === "error"
          && upErr.errors?.[0]?.includes("Micro export") && upErr.actions[0]?.key === "mp_invoice_push" && nx.isGeneralOrderTodo(upErr, false)],
        ["Yüklendiyse (mp_invoice_sent_at) hata yok", !st({ ...ty, mp_invoice_error: "eski", mp_invoice_sent_at: D }).errors],
        ["Hepsiburada paket no bekleniyor → hata değil", !st({ ...ty, channel: "hepsiburada", mp_package_number: null, mp_invoice_error: "Hepsiburada paket numarası henüz yok — paketlenince kendiliğinden yüklenir." }).errors],
        ["Paraşüt faturası kesilemedi → Hata aldı", nx.todoKind(st({ ...ty, invoice_status: "pending", parasut_status: "error", parasut_error: "Kargo firması belli değil", parasut_pdf_path: null })) === "error"],
        ["Paraşüt bakımda (retry, kendiliğinden yeniden dener) → hata değil", !st({ ...ty, invoice_status: "pending", parasut_status: "retry", parasut_pdf_path: null }).errors],
        ["Trendyol işleme al yapılamadı → Hata aldı", nx.todoKind(st({ ...ty, mp_picking_at: null, mp_picking_error: "Trendyol'da “İşleme al” yapılamadı: 500" })) === "error"],
        ["Kargo entegrasyonu hata (site, kod yok) → Hata aldı", nx.todoKind(st({ channel: "site", status: "processing", payment_status: "paid", shipment_status: "preparing", invoice_status: "pending", total_amount: 100, created_at: D, kargonomi_error: "adres eksik" })) === "error"],
        ["İptal edilmiş siparişte hata sayılmaz", !st({ ...ty, status: "cancelled", mp_invoice_error: "x" }).errors],
        ["Hatasız sipariş eskisi gibi", !st(ty).errors],
      ];
      const bad = cases.filter(([, ok]) => !ok).map(([l]) => l);
      t.add(!bad.length ? "ok" : "fail", "Siparişteki entegrasyon hatası → “Hata aldı” (bakım / paket bekleme / iptal hariç)", bad.join(" · "));
      t.add(nx.TODO_KINDS[0]?.kind === "error" && nx.TODO_KINDS[0]?.param === "hata" && nx.TODO_KINDS[0]?.label === "Hata aldı" ? "ok" : "fail",
        "Panoda ve listede ilk iş türü “Hata aldı” (?todo=hata)");
    });

    await t.part("Ekranlar", async () => {
      const list = rd("src/app/admin/orders/page.tsx"), dash = rd("src/app/admin/page.tsx");
      t.add(/data-todo-error/.test(list) && /data-order-errors/.test(list) && /case "mp_invoice_push": return pushTrendyolInvoice\(o\)/.test(list) ? "ok" : "fail",
        "Listede kırmızı “⚠ Hata”, siparişte “Hata aldı” kutusu, “yeniden yükle” düğmesi");
      t.add(/danger: k === "error"/.test(dash) && /x\.danger \? "bg-red-600 text-white"/.test(dash) ? "ok" : "fail", "Panoda “Hata aldı” satırı kırmızı");
    });
  },
};
