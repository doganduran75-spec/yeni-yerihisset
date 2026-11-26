// İADE AKIŞI (kullanıcı 2026-11-26): iade kargosu bizde → siparişin tamamı geri geldiyse kalan her şey (kargo dahil) iade,
// bir kısmıysa yalnız o ürünlerin bedeli (kupon payı düşülmüş). Siparişte YeriHisset Kredisi kullanıldıysa iade para / kredi
// oranında bölünür: kısmi iadede de kredi payı cüzdana döner (MIG 20261201). Müşteriye "iade talebin alındı" ve iadenin
// sonunda "iaden tamamlandı" e-postası gider (ilk seferde e-posta onayına düşer). Kural + kod denetimi; veri değiştirmez.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "İade akışı (tutar, kredi, e-postalar)",
  async run(t) {
    await t.part("İade tutarı kuralı (kargo, kupon, kredi)", async () => {
      let g = null;
      try { g = await import(new URL("../../src/lib/exchange-return.ts", import.meta.url)); } catch { /* eski Node */ }
      if (!g) { t.add("warn", "İade tutarı kuralı denenemedi", "Node TS yükleyemedi"); return; }
      const items = [{ id: "a", quantity: 1, unit_price: 1000 }, { id: "b", quantity: 1, unit_price: 500 }];
      // 1500 ürün + 90 kargo = 1590 ödendi
      const plain = { total_amount: 1590, refunded_amount: 0 };
      const cases = [
        ["Tamamı geri geldi → kargo dahil kalan tutar", g.refundSplit(plain, items, 0, true), { cash: 1590, credit: 0 }],
        ["2 üründen 1'i geldi → yalnız ürün bedeli", g.refundSplit(plain, items, 500, false), { cash: 500, credit: 0 }],
        // 150 kupon (%10) → 500'lük ürünün iadesi 450
        ["Kuponlu siparişte kısmi iade → kupon payı düşülür", g.refundSplit({ total_amount: 1440, coupon_discount: 150 }, items, 500, false), { cash: 450, credit: 0 }],
        // 1590'ın 318'i kredi (%20) → 500'lük ürün: 400 para + 100 kredi
        ["Kredili siparişte kısmi iade → para + kredi payı", g.refundSplit({ total_amount: 1272, credit_used: 318 }, items, 500, false), { cash: 400, credit: 100 }],
        ["Kredili siparişte tamamı geldi → kalan para + kalan kredi", g.refundSplit({ total_amount: 1272, refunded_amount: 400, credit_used: 318, credit_restored_amount: 100 }, items, 0, true), { cash: 872, credit: 218 }],
        ["Tamamı kredili sipariş kısmi iade → yalnız kredi", g.refundSplit({ total_amount: 0, credit_used: 1590 }, items, 500, false), { cash: 0, credit: 500 }],
      ];
      const bad = cases.filter(([, got, want]) => got.cash !== want.cash || got.credit !== want.credit)
        .map(([l, got, want]) => `${l}: ${got.cash}/${got.credit} (beklenen ${want.cash}/${want.credit})`);
      t.add(!bad.length ? "ok" : "fail", "Tam iade kargo dahil, kısmi iade yalnız ürün; kupon ve kredi payı doğru", bad.join(" · "));
    });
    await t.part("İade ekranı, sunucu, e-postalar", async () => {
      const page = rd("src/app/admin/orders/page.tsx");
      const okP = /const retAllBack = items\.every/.test(page) && /refundSplit\(order, items as any, retPlan\.amount, retAllBack\)/.test(page)
        && /credit: creditNow \|\| undefined/.test(page) && /YeriHisset Kredisi müşterinin cüzdanına geri yüklenir/.test(page);
      t.add(okP ? "ok" : "fail", "İade al / Ücret iadesi ekranı: tamamı geldiyse kargo dahil, kredi payı gösteriliyor ve gönderiliyor", okP ? "" : "ekran eksik");
      const act = rd("src/app/api/admin/orders/action/route.ts");
      const okA = /rpc\("restore_order_credit_part"/.test(act) && /function mailCompleted/.test(act) && /sendReturnCompletedEmail/.test(act)
        && /if \(body\.refund\) mailCompleted/.test(act) && /if \(order\.status !== "cancelled"\) mailCompleted/.test(act);
      t.add(okA ? "ok" : "fail", "Sunucu: kısmi iadede kredi payı cüzdana, ücret iadesinden sonra \"iaden tamamlandı\" e-postası", okA ? "" : "action route eksik");
      const as = rd("src/app/api/after-sale/route.ts");
      const mail = rd("src/lib/after-sale-mail.ts");
      const kinds = rd("src/lib/email-approval.ts");
      const okM = /sendReturnRequestedEmail\(orderId/.test(as) && /"return_requested"\)/.test(mail) && /"return_completed"\)/.test(mail)
        && /return_requested: "İade talebi alındı"/.test(kinds) && /return_completed: "İade tamamlandı"/.test(kinds);
      t.add(okM ? "ok" : "fail", "Müşteriye \"iade talebin alındı\" + \"iaden tamamlandı\" e-postaları (e-posta onayında adlı tür)", okM ? "" : "e-posta eksik");
    });
  },
};
