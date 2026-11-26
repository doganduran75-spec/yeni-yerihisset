// DEĞİŞİM GÖNDERİSİ KARGO ENTEGRASYONUNDAN (kullanıcı 2026-11-26): müşteri adına açılan değişimde kargo kodu yoktu.
// "Kargo kodu oluştur" → ilk gönderideki "Kargoya ver" penceresi değişim modunda (kullanıcı: "başka kargo firmasıyla çalışmak
// isteyebilirim"): desi (ilk gönderininki gelir) → teklifler → firma (ilk gönderinin firması önerilir) → kod
// (Kargonomi'de 5 dk'da bir sorgu) → "Değişim kargo etiketini yazdır" → "Alternatifi gönder" (takip no talepten, e-posta) →
// kargo "teslim edildi" → talep "alternatif teslim edildi" + "hangisi oldu?" e-postası. Gönderi talepte (order_cases.alt_*),
// siparişin kendi gönderisine dokunmaz (MIG 20261203). Açılamazsa / sorunluysa panoda "Hata aldı".
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Değişim gönderisi kargo entegrasyonundan",
  async run(t) {
    await t.part("Kural: kargo firması seçimi + hata", async () => {
      let r = null, nx = null;
      try { r = await import(new URL("../../src/lib/exchange-ship-rules.ts", import.meta.url)); nx = await import(new URL("../../src/lib/order-next-step.ts", import.meta.url)); } catch { /* eski Node */ }
      if (!r || !nx) { t.add("warn", "Kural denenemedi", "Node TS yükleyemedi"); return; }
      const offers = [{ id: "-1", name: "Otomatik", price: null, amount: 40 }, { id: "7", name: "Aras Kargo", price: "55", amount: 55 },
        { id: "3", name: "Sürat Kargo", price: "62", amount: 62 }, { id: "9", name: "Yurtiçi", price: null, amount: null }];
      const cases = [
        ["İlk gönderi Sürat Kargo → değişim de Sürat Kargo (pahalı olsa da)", r.pickOffer(offers, "Sürat Kargo")?.id === "3"],
        ["İlk firma yok → fiyatı olan en ucuz (Otomatik değil)", r.pickOffer(offers, null)?.id === "7"],
        ["İlk firma hizmet dışı (Yurtiçi fiyatsız) → en ucuz", r.pickOffer(offers, "Yurtiçi Kargo")?.id === "7"],
        ["Hiç teklif yok → Otomatik son çare", r.pickOffer([{ id: "-1", name: "Otomatik", price: null, amount: null }], "Sürat")?.id === "-1"],
        ["Boş adlı teklif eşleşmez", r.pickOffer([{ id: "1", name: "", price: "1", amount: 1 }, { id: "2", name: "Sürat Kargo", price: "9", amount: 9 }], "Sürat Kargo")?.id === "2"],
      ];
      const bad = cases.filter(([, ok]) => !ok).map(([l]) => l);
      t.add(!bad.length ? "ok" : "fail", "Değişim gönderisi ilk gönderinin kargo firmasıyla, yoksa en ucuzla", bad.join(" · "));
      const D = new Date().toISOString();
      const st = nx.orderNextStep({ channel: "site", status: "delivered", payment_status: "paid", shipment_status: "delivered", invoice_status: "invoiced",
        total_amount: 3499, created_at: D, delivered_at: D, fit_status: "exchange", open_case: { kind: "exchange", status: "requested", alt_kargo_error: "Kargonomi bu adrese teklif vermedi." } });
      t.add(nx.todoKind(st) === "error" && st.errors?.[0]?.startsWith("Değişim gönderisi:") ? "ok" : "fail", "Değişim gönderisi açılamazsa panoda “Hata aldı”");
    });

    await t.part("Sunucu + ekran", async () => {
      const lib = rd("src/lib/exchange-shipping.ts"), route = rd("src/app/api/admin/orders/case/route.ts"), lab = rd("src/app/api/admin/orders/labels/route.ts");
      const cron = rd("src/app/api/cron/marketplace-sync/route.ts"), ui = rd("src/app/admin/orders/page.tsx"), sl = rd("src/lib/shipping-label.ts");
      const okLib = /export async function quoteAltShipment/.test(lib) && /export async function confirmAltShipment/.test(lib)
        && /\.is\("alt_confirmed_at", null\)/.test(lib) // çift tık kilidi
        && /Number\(c\.alt_desi\) !== desi \|\| c\.alt_kargo_api !== p/.test(lib) // desi / sağlayıcı değişince taslak yenilenir
        && /Number\(o\.kargonomi_desi\) > 0 \? Number\(o\.kargonomi_desi\) : 2/.test(lib) && /suggested: pickOffer\(offers, o\.kargonomi_provider\)/.test(lib)
        && /\(c\.alt_offers as any\[\]\) \|\| \[\]\)\.find\(\(x\) => x\.id === String\(providerId\)\)/.test(lib)
        && /status: "alt_delivered"/.test(lib) && /sendAltDeliveredEmail\(orderId\)/.test(lib) && /\.eq\("status", "alt_shipped"\)/.test(lib)
        && !/from\("orders"\)\.update/.test(lib); // siparişin kendi gönderisine dokunmaz
      t.add(okLib ? "ok" : "fail", "Desi + teklif + firma seçimi (ilk gönderinin desisi / firması önerilir, kilitli), teslimde “hangisi oldu?”, siparişin gönderisine dokunmaz");
      const ship = rd("src/app/api/kargonomi/ship/route.ts"), dlg = rd("src/components/admin/KargonomiDialog.tsx");
      t.add(/if \(body\.exchange\)/.test(ship) && /quoteAltShipment\(sb, id, Number\(body\.desi\), body\.provider\)/.test(ship) && /confirmAltShipment\(sb, id/.test(ship)
        && /c\.alt_tracking \|\| null/.test(route) && /cancelAltShipment\(sb, orderId\)\.catch/.test(route) ? "ok" : "fail",
        "Pencere değişimde talebin gönderisiyle çalışır; Alternatifi gönder takip no'yu talepten alır; talep kapanınca gönderilmemiş kod iptal");
      t.add(/function asExchange/.test(dlg) && /exchange \? \{ \.\.\.body, exchange: true \}/.test(dlg) && /printExchangeLabel\(o\.id\)/.test(dlg) && /op: "alt_info"/.test(dlg) ? "ok" : "fail",
        "“Kargoya ver” penceresi değişim modunda (desi, teklifler, değişim etiketi)");
      t.add(/if \(body\.exchange\)/.test(lab) && /alt_label_printed_at/.test(lab) && /· DEĞİŞİM/.test(lab) ? "ok" : "fail", "Değişim kargo etiketi (değişim ürünleriyle, siparişin etiket alanlarına dokunmadan)");
      t.add(/pollAltShipments\(supabase\)/.test(cron) ? "ok" : "fail", "Değişim gönderisi 5 dakikada bir sorgulanıyor (kod + teslim)");
      t.add(/data-alt-ship/.test(ui) && /Kargo kodu oluştur/.test(ui) && /<KargonomiDialog exchange order=\{shipOpen \? order : null\}/.test(ui) && /Değişim kargo etiketini yazdır/.test(ui) && /printExchangeLabel\(order\.id\)/.test(ui)
        && /export async function printExchangeLabel/.test(sl) && /ya da kargo takip no \(elle\)/.test(ui) ? "ok" : "fail",
        "Talepte “Kargo kodu oluştur” → “Değişim kargo etiketini yazdır”; elle kod girmek de mümkün");
    });
  },
};
