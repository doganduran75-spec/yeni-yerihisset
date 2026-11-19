// ELLE YORUM EKLEME (kullanıcı 2026-11-19, MIG 20261196): yönetici panelden siparişe bağlı olmayan yorum ekler (eski
// yorumlar) — ürün + görünen ad + kaynak (Eski site / Instagram / Trendyol…) + tarih + puan + yorum + görsel. Ürün
// sayfasında adın yanında kaynak etiketi; Google'a giden yıldızlar sitede görünen yorumlardan (o ürünün).
// Veri değiştirmez: ekleme denemeleri geri alınan işlemde yapılır.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Elle yorum",
  async run(t) {
    await t.part("Elle yorum ekleme (eski yorumlar, kaynak etiketi)", async () => {
      // 1) Veritabanı: siparişsiz yorum adla eklenebiliyor; adsız + siparişsiz yorum reddediliyor
      const pid = t.one("SELECT id FROM public.products ORDER BY created_at LIMIT 1");
      let okManual = false;
      try {
        t.sql(`BEGIN; INSERT INTO public.order_reviews (product_id, author_name, origin, rating_overall, comment, is_approved, source)
          VALUES (${t.lit(pid)}, 'Regresyon T.', 'trendyol', 5, 'regresyon', true, 'manual'); ROLLBACK;`);
        okManual = true;
      } catch { okManual = false; }
      t.add(okManual ? "ok" : "fail", "Siparişsiz yorum (görünen ad + kaynak) eklenebiliyor", okManual ? "" : "order_id / user_id hâlâ zorunlu ya da author_name / origin kolonu yok");
      let rejected = false;
      try { t.sql(`BEGIN; INSERT INTO public.order_reviews (product_id, rating_overall, comment, is_approved) VALUES (${t.lit(pid)}, 5, 'x', true); ROLLBACK;`); }
      catch { rejected = true; }
      t.add(rejected ? "ok" : "fail", "Adsız ve siparişsiz yorum kaydedilemiyor", rejected ? "" : "order_reviews_author_chk yok");

      // Üye kendi yorumuna başkasının adını / kaynak etiketi yazamaz
      const pol = t.one("SELECT with_check FROM pg_policies WHERE tablename = 'order_reviews' AND policyname = 'user_insert_own_review'") || "";
      const polOk = /author_name IS NULL/i.test(pol) && /origin IS NULL/i.test(pol) && /cardinality/i.test(pol);
      t.add(polOk ? "ok" : "fail", "Üye yorumunda görünen ad / kaynak etiketi yazılamıyor", polOk ? "" : "user_insert_own_review kuralında author_name / origin kısıtı yok");

      // 2) Kod: panelde "Yorum ekle", ürün sayfasında ad + kaynak etiketi, Google yıldızları gerçek yorumlardan
      const dlg = rd("src/components/admin/reviews/AddReviewDialog.tsx"), adm = rd("src/app/admin/reviews/page.tsx");
      const pr = rd("src/components/products/ProductReviews.tsx"), pg = rd("src/app/products/[slug]/page.tsx"), og = rd("src/config/review-origins.ts");
      const ok1 = /source: "manual"/.test(dlg) && /is_approved: true/.test(dlg) && /origin,/.test(dlg) && /<AddReviewDialog/.test(adm) && /author_name, origin, product_id/.test(adm)
        && /\.eq\("source", "manual"\)/.test(adm);
      t.add(ok1 ? "ok" : "fail", "Panelde 'Yorum ekle' (onaylı, kaynaklı); yalnız elle eklenen yorum silinebiliyor", ok1 ? "" : "AddReviewDialog / admin yorumlar sayfası satırları eksik");
      const ok2 = /r\.author_name \|\| nameById/.test(pr) && /reviewOriginBadge\(r\.origin\)/.test(pr) && /trendyol: \{[^}]*Trendyol müşterisi/.test(og) && /instagram:/.test(og);
      t.add(ok2 ? "ok" : "fail", "Ürün sayfasında elle eklenen yorumun adı ve kaynağı (ör. 'Trendyol müşterisi') görünüyor", ok2 ? "" : "ProductReviews / review-origins satırları eksik");
      const stats = (/async function getReviewStats[\s\S]*?\n\}/.exec(pg) || [""])[0];
      const ok3 = /from\("order_reviews"\)/.test(stats) && !/product_reviews"/.test(stats) && /\.eq\("product_id", productId\)/.test(stats);
      t.add(ok3 ? "ok" : "fail", "Google'a giden yıldızlar sitede görünen yorumlardan (yalnız o ürünün)", ok3 ? "" : "getReviewStats hâlâ eski product_reviews tablosunu okuyor");
    });
  },
};
