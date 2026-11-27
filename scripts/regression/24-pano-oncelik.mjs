// PANO "BUGÜNÜN İŞLERİ" ÖNEM SIRASIYLA (kullanıcı 2026-11-27: "benim yapacaklarım ve süreci devam edenleri ayrı gruplarda
// görsem… işleri tepeden aşağıya doğru çözerek ilerlemek"): Acil → Bugün içinde → Bekleyebilir → Süreçte (müşteri / kargo
// bekleniyor, soluk). Site mesajı + pazaryeri sorusu tek satır "Cevaplanacak mesaj / soru". "Hata aldı", "Onay bekleyen
// e-posta", "Pazaryeri stok görevi", "Değişim — senin adımın" yalnız iş varken. Değişimde sıra yöneticiye gelince
// (geri gönderim kodu, ikisi de olmadı) iş "Süreçte"den "Acil"e geçer. 2026-11-27 (2): "İade / talep / diğer" iade adımlarına
// bölündü (İade talebi → İade geldi → Ücret iadesi → İade faturası; teslim edilemedi / diğer yalnız varken); Talep + Sonuçsuz arama tek satır.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Pano: işler önem sırasıyla",
  async run(t) {
    await t.part("Kural: değişimde sıra kimde", async () => {
      let nx = null;
      try { nx = await import(new URL("../../src/lib/order-next-step.ts", import.meta.url)); } catch { /* eski Node */ }
      if (!nx) { t.add("warn", "Kural denenemedi", "Node TS yükleyemedi"); return; }
      const D = new Date().toISOString();
      const base = { channel: "site", status: "delivered", payment_status: "paid", shipment_status: "delivered", invoice_status: "invoiced",
        total_amount: 3499, created_at: D, delivered_at: D, fit_status: "exchange" };
      const st = (status, extra = {}) => nx.orderNextStep({ ...base, open_case: { kind: "exchange", status, ...extra } });
      const mine = (s) => nx.isExchangeMyStep(s, true);
      const cases = [
        ["Müşteri seçti → geri gönderim kodu senin adımın", mine(st("keep_chosen"))],
        ["İkisi de olmadı → senin adımın", mine(st("none_fit"))],
        ["Alternatif kargoda → Süreçte (senden iş yok)", !mine(st("alt_shipped")) && !st("alt_shipped").needsAction],
        ["Müşteri deniyor → Süreçte", !mine(st("alt_delivered")) && !st("alt_delivered").needsAction],
        ["Gönderilecek ürün → “Sevk edilecek”te (iki yerde değil)", !mine(st("requested")) && nx.todoKind(st("requested")) === "ship"],
        ["Gönderi hatası → “Hata aldı”da (iki yerde değil)", !mine(st("requested", { alt_kargo_error: "x" }))],
        ["Açık değişim yoksa sayılmaz", !nx.isExchangeMyStep(st("keep_chosen"), false)],
      ];
      const bad = cases.filter(([, ok]) => !ok).map(([l]) => l);
      t.add(!bad.length ? "ok" : "fail", "Değişimde sıra sana gelince “Değişim — senin adımın”, beklerken “Süreçte”", bad.join(" · "));
    });

    await t.part("Pano + liste", async () => {
      const dash = rd("src/app/admin/page.tsx"), list = rd("src/app/admin/orders/page.tsx"), msg = rd("src/app/admin/messages/page.tsx");
      const order = ["Acil", "Bugün içinde", "Bekleyebilir", "Süreçte — müşteri / kargo bekleniyor"].map((g) => dash.indexOf(`title: "${g}"`));
      const okOrder = order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1]));
      const at = (s) => dash.indexOf(s);
      const okRows = at('todoRow("error")') < at('"Cevaplanacak mesaj / soru"') && at('"Cevaplanacak mesaj / soru"') < at('todoRow("ship")')
        && at('todoRow("ship")') < at('title: "Bugün içinde"') && at('"Paraşüt gelen e-fatura"') > at('title: "Bekleyebilir"')
        && at('"Yolda olan iade"') > at('title: "Süreçte') && at('label: "Süren değişim"') > at('title: "Süreçte');
      t.add(okOrder && okRows ? "ok" : "fail", "Bugünün işleri: Acil → Bugün içinde → Bekleyebilir → Süreçte; mesaj / soru ve sevk üstte, yolda iade / süren değişim en altta");
      t.add(/n: msgCount \+ qnaCount, label: "Cevaplanacak mesaj \/ soru"/.test(dash) && !/"Cevapsız müşteri mesajı"/.test(dash) && !/"Cevapsız Trendyol sorusu"/.test(dash)
        && /threads\.filter\(\(t\) => t\.last_role === "user"\)\.length/.test(msg) ? "ok" : "fail",
        "Site mesajı + pazaryeri sorusu tek satır; Mesajlar'da iki sekmede de cevapsız sayısı");
      const hide = ["\"Onay bekleyen e-posta\"", "\"Pazaryeri stok görevi\"", "\"Değişim — senin adımın\""].every((l) => new RegExp(`${l}[^\\n]*hideZero: true`).test(dash))
        && /hideZero: !!t.rare/.test(dash) && /\.filter\(\(x\) => x\.n \|\| !x\.hideZero\)/.test(dash);
      t.add(hide ? "ok" : "fail", "Hata aldı / onay bekleyen e-posta / pazaryeri stok görevi / değişim — senin adımın yalnız iş varken görünüyor");
      const iade = ['todoRow("return_request")', 'todoRow("return_arrived")', '"Ücret iadesi yapılacak"', '"İade faturası / gider pusulası"', 'todoRow("undelivered")'].map(at);
      t.add(iade.every((i, k) => i > at('title: "Bugün içinde"') && i < at('title: "Bekleyebilir"') && (k === 0 || i > iade[k - 1]))
        && !/İade \/ talep \/ diğer/.test(dash) && /if \(t\.rare && !n && fTodo !== t\.kind\) return null/.test(list) ? "ok" : "fail",
        "İade adım adım: talep → geldi → ücret iadesi → iade faturası (teslim edilemedi / diğer yalnız varken)");
      t.add(/n: feedbackCount \+ searchCount, label: "Talep \/ sonuçsuz arama"/.test(dash) && at('"Talep / sonuçsuz arama"') > at('title: "Bekleyebilir"')
        && !/label: "Sonuçsuz arama"/.test(dash) && !/label: "Talep",/.test(dash) ? "ok" : "fail", "Talep + sonuçsuz arama tek satır (Bekleyebilir)");
      t.add(/fRet === "exchange_action" && !isExchangeMyStep/.test(list) && /fRet === "exchange_waiting"/.test(list)
        && /iade=exchange_action/.test(dash) && /iade=exchange_waiting/.test(dash) ? "ok" : "fail",
        "Değişim satırlarına tıklayınca liste yalnız o değişimleri açıyor");
    });
  },
};
