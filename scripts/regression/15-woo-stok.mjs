// ESKİ SİTE SİPARİŞİ STOKTAN DÜŞER (kullanıcı 2026-11-23): woo-import.mjs ile aktarılan YERİHİSSET siparişi, "stok
// başlangıcı"ndan (.woo-report/stok-baslangic.txt, ilk --apply turu) sonra verilmiş ve ödenmişse stoktan düşer → pazaryerleri
// stok değişikliğini kendiliğinden alır. Havale beklerken düşmez (yeni sistemin 24 saat iptal kuralı dokunmasın), ödenince
// düşer; eski sitede iptal / tam iade → stok geri. Attipas ve eşleşmeyen satır düşmez. Veri değiştirmez: kod denetimi.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Eski site siparişi stok",
  async run(t) {
    await t.part("Eski siteden aktarılan yerihisset siparişi stoktan düşüyor", async () => {
      const s = rd("scripts/woo-import.mjs");
      // Kural gerçekten çalıştırılır: yalnız yerihisset + başlangıçtan sonra + ödenmiş + iptal/iade değil
      const body = /const stockable = \(site, created, st\) => ([\s\S]*?);\r?\n/.exec(s);
      let fn = null;
      try { fn = body ? new Function("stockFrom", `return (site, created, st) => ${body[1]};`)("2026-11-23T13:00:00.000Z") : null; } catch { fn = null; }
      const Y = { code: "yerihisset" }, A = { code: "attipas" };
      const paid = { payment_status: "paid", status: "processing" };
      const good = !!fn && fn(Y, "2026-11-23T14:00:00.000Z", paid) && !fn(Y, "2026-11-23T12:00:00.000Z", paid)
        && !fn(A, "2026-11-23T14:00:00.000Z", paid) && !fn(Y, "2026-11-23T14:00:00.000Z", { payment_status: "pending", status: "awaiting_payment" })
        && !fn(Y, "2026-11-23T14:00:00.000Z", { payment_status: "failed", status: "cancelled" }) && fn(Y, "2026-11-23T14:00:00.000Z", { payment_status: "paid", status: "delivered" });
      t.add(good ? "ok" : "fail", "Yalnız başlangıçtan sonraki ödenmiş yerihisset siparişi düşer (attipas, havale bekleyen, iptal, eski sipariş düşmez)", good ? "" : "stockable kuralı bozuk");
      // Sıra: satırlar ürüne bağlandıktan sonra düş; yetmezse reddetme (soft); iptal/iade → geri; başlangıç dosyası
      const iRe = s.indexOf('sb.rpc("rematch_order_items")'), iRd = s.indexOf('sb.rpc("reduce_order_stock", { p_order_id: id, p_strict: false })');
      const ok2 = iRe > 0 && iRd > iRe && /sb\.rpc\("restore_order_stock", \{ p_order_id: id \}\)/.test(s)
        && /prev\.stock_reduced_at && \["cancelled", "refunded"\]\.includes\(fields\.status\)/.test(s)
        && /new URL\("stok-baslangic\.txt", OUT_DIR\)/.test(s) && /if \(APPLY\) \{ mkdirSync\(OUT_DIR[^\n]*writeFileSync\(STOCK_FILE/.test(s)
        && /stock_reduced_at"\);/.test(s) && /if \(reduceStock && items\.length\) toReduce\.push\(ins\.id\)/.test(s);
      t.add(ok2 ? "ok" : "fail", "Stok satırlar ürüne bağlandıktan sonra düşüyor (yetmezse 0'a); eski sitede iptal / iadede geri ekleniyor", ok2 ? "" : "woo-import.mjs stok adımları eksik / sırası bozuk");
      // Pazaryerleri: varyant stoğu değişince eşitleme işi kendiliğinden açılır (aktarım ayrıca bir şey yapmaz)
      const trg = /CREATE TRIGGER trg_stock_sync_variants AFTER UPDATE OF stock ON public\.product_variants/.test(rd("supabase/migrations/20260917000001_stock_sync_tasks.sql"));
      t.add(trg ? "ok" : "fail", "Stok düşünce Trendyol / Hepsiburada / Amazon kendiliğinden güncellenir (stok tetikleyicisi)", trg ? "" : "trg_stock_sync_variants yok");
    });
  },
};
