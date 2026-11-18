// KAPAK GÖRSELLERİ (kullanıcı 2026-11-17, MIG 20261195): ana sayfadaki Kategoriler kutuları (categories.cover_images) ve
// /magaza'daki Yetişkin / 0–4 Yaş İlkadım kartları (settings.segment_covers) panelden seçilir — en çok 3, her ziyarette
// biri gösterilir (src/components/RotatingCover.tsx + kök düzendeki data-cv betiği + globals.css .yh-cv kuralları).
// Panel: Ayarlar › Kategoriler › “Kapak” ve “Mağaza kartlarının görseli” (CoverPickerDialog: adaylar sitedeki oranda,
// aynı kırpmayla). Veri değiştirmez: sınır denemesi geri alınan işlemde yapılır.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Kapak görselleri",
  async run(t) {
    await t.part("Kategori ve mağaza kartı kapak görselleri", async () => {
      // 1) Veritabanı: en çok 3 görsel; ziyaretçi kategori kapaklarını okur ama değiştiremez; mağaza kartı ayarı dışarıya kapalı
      const catId = t.one("SELECT id FROM public.categories ORDER BY sort_order, name LIMIT 1");
      let rejected = false;
      try { t.sql(`BEGIN; UPDATE public.categories SET cover_images = ARRAY['a','b','c','d'] WHERE id = ${t.lit(catId)}; ROLLBACK;`); }
      catch { rejected = true; }
      t.add(rejected ? "ok" : "fail", "Kategoriye en çok 3 kapak görseli kaydedilebiliyor", rejected ? "" : "4 görsel kabul edildi (categories_cover_images_max3 yok)");

      const read = await t.rest(`categories?select=id,cover_images&id=eq.${catId}`);
      t.add(read.status === 200 && Array.isArray(read.json?.[0]?.cover_images) ? "ok" : "fail", "Ziyaretçi kategori kapaklarını okuyabiliyor (ana sayfa kutuları)", `HTTP ${read.status}`);

      const before = t.one(`SELECT cover_images::text FROM public.categories WHERE id = ${t.lit(catId)}`);
      const upd = await t.rest(`categories?id=eq.${catId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { cover_images: ["https://ornek.test/x.jpg"] } });
      const after = t.one(`SELECT cover_images::text FROM public.categories WHERE id = ${t.lit(catId)}`);
      t.add(after === before ? "ok" : "fail", "Ziyaretçi kategori kapağını değiştiremiyor", after === before ? `HTTP ${upd.status}` : "değişti!");
      if (after !== before) t.sql(`UPDATE public.categories SET cover_images = ${t.lit(before)}::text[] WHERE id = ${t.lit(catId)}`);

      const seg = await t.rest("settings?select=segment_covers&limit=1");
      t.add(seg.status >= 400 ? "ok" : "fail", "Mağaza kartı görsel ayarı dışarıdan okunamıyor (sunucu okur)", `HTTP ${seg.status}`);

      // 2) Kod: kutular ve kartlar seçilen kapakları kullanıyor, her ziyarette biri görünüyor, seçim penceresi sitedeki oranda
      const home = rd("src/app/page.tsx"), hc = rd("src/components/HomeCategories.tsx"), sc = rd("src/components/SegmentChooser.tsx");
      const mg = rd("src/app/magaza/page.tsx"), rc = rd("src/components/RotatingCover.tsx"), lay = rd("src/app/layout.tsx");
      const css = rd("src/app/globals.css"), pick = rd("src/components/admin/settings/CoverPickerDialog.tsx"), tab = rd("src/components/admin/settings/CategoriesTab.tsx");
      const ok1 = /cover_images/.test(home) && /<RotatingCover/.test(hc) && /<RotatingCover/.test(sc) && /segment_covers/.test(mg) && /createAdminClient/.test(mg);
      t.add(ok1 ? "ok" : "fail", "Ana sayfa kutuları ve mağaza kartları seçilen kapakları kullanıyor", ok1 ? "" : "page.tsx / HomeCategories / SegmentChooser / magaza satırları eksik");
      const cvRules = [0, 1, 2, 3, 4, 5].every((n) => css.includes(`html[data-cv="${n}"] .yh-cv[data-show~="${n}"]`));
      const ok2 = /data-cv/.test(lay) && /Math\.random\(\)\*6/.test(lay) && cvRules && /html:not\(\[data-cv\]\) \.yh-cv\[data-first\]/.test(css)
        && /n % list\.length === i/.test(rc);
      t.add(ok2 ? "ok" : "fail", "Her ziyarette seçilenlerden biri gösteriliyor (titremeden; betik yoksa ilk görsel)", ok2 ? "" : "layout betiği / globals.css .yh-cv kuralları / RotatingCover dağıtımı eksik");
      const ok3 = /MAX_COVERS = 3/.test(pick) && /object-cover/.test(pick) && /aspect="1 \/ 1"/.test(tab) && /aspect="16 \/ 10"/.test(tab)
        && /aspectRatio: "1 \/ 1"/.test(hc) && /aspectRatio: "16 \/ 10"/.test(sc);
      // Panelde değişen kapak ~1 dk içinde her süreçte görünsün (4 pm2 süreci, ayrı önbellek): /magaza ve ana sayfa en çok 60 sn
      const rv = (s) => Number((/export const revalidate = (\d+)/.exec(s) || [])[1] || 9999);
      t.add(rv(mg) <= 60 && rv(home) <= 60 ? "ok" : "fail", "Seçilen kapak en geç ~1 dk içinde sitede (sayfa önbelleği 60 sn)", `magaza ${rv(mg)} sn, ana sayfa ${rv(home)} sn`);
      // Aday sorgusu ürün adını "title" kolonundan almalı (2026-11-18: "name" istenince liste boş kalıyordu); sorgu hatası pencerede görünmeli
      const ok4 = !/select\("name,/.test(tab) && /select\("title, images, image_url/.test(tab) && /if \(error\) throw/.test(tab) && /setLoadErr/.test(pick);
      t.add(ok4 ? "ok" : "fail", "Kapak seçim penceresi ürün görsellerini listeliyor (ürün adı kolonu doğru, hata görünür)", ok4 ? "" : "CategoriesTab aday sorgusu / CoverPickerDialog hata gösterimi");
      t.add(ok3 ? "ok" : "fail", "Panelde seçim penceresi görselleri sitedeki oranda ve kırpmayla gösteriyor (kategori kare, mağaza kartı 16:10)",
        ok3 ? "" : "CoverPickerDialog / CategoriesTab oranı sitedeki kutularla aynı değil");
    });
  },
};
