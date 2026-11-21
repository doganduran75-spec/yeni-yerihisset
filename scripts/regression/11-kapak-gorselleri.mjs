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
    // PRENSİP KARTLARINDA TEK GÖRSEL (kullanıcı 2026-11-18): dik görsel (imageTall) yüklüyse kartlar onu doldurarak gösterir,
    // görünen kısım panelde "Kartlarda görünen kısım" (focusY) — yatay görsel ayrıca yüklenmez. Dik görsel yoksa eski davranış.
    await t.part("Prensip kartlarında tek görsel (dik görsel + görünen kısım)", async () => {
      const hc = rd("src/config/homeContent.ts"), pc = rd("src/components/PrincipleCarousel.tsx"), ps = rd("src/components/PrincipleStories.tsx"), tab = rd("src/components/admin/settings/HomeContentTab.tsx");
      const pl = rd("src/lib/principle-image.ts"), about = rd("src/app/hakkimizda/page.tsx");
      const items = (hc.match(/imageTall: "", focusY: 50,/g) || []).length;
      t.add(items >= 5 ? "ok" : "fail", "Her prensipte 'görünen kısım' ayarı var (varsayılan orta)", `${items} prensipte`);
      // Kart kırpma mantığı gerçekten çalıştırılır: dik görsel → doldurur + konum; yalnız yatay → sığdırır
      // (2026-11-22: görsel adresi optimizedImg ile küçültülür — testte adresi olduğu gibi döndüren yerine geçen kullanılır)
      const body = /export function principleCardImage\(it: PItem[^\n]*\| null \{([\s\S]*?)\r?\n\}/.exec(pl);
      let fn0 = null;
      try { fn0 = body ? new Function("it", "sizes", "optimizedImg", body[1]) : null; } catch { fn0 = null; }
      const fn = fn0 && ((it) => fn0(it, "100vw", (s) => ({ src: s })));
      const a = fn?.({ title: "x", image: "/y.svg", imageTall: "/t.jpg", focusY: 30 });
      const b2 = fn?.({ title: "x", image: "/y.svg", imageTall: "" });
      const c = fn?.({ title: "x", imageTall: "/t.jpg", focusY: 250 });
      const good = a?.src === "/t.jpg" && /object-cover/.test(a.className) && a.style?.objectPosition === "50% 30%"
        && b2?.src === "/y.svg" && /object-contain/.test(b2.className) && c?.style?.objectPosition === "50% 100%";
      t.add(good ? "ok" : "fail", "Kartta dik görsel kartı dolduruyor, seçilen kısım görünüyor; dik görsel yoksa yatay görsel eskisi gibi", good ? "" : JSON.stringify({ a, b2, c }).slice(0, 200));
      const ok2 = /<CardImg it=\{it\} \/>/.test(pc) && (pc.match(/<CardImg it=\{it\} \/>/g) || []).length >= 2 && /it\.image \|\| it\.imageTall/.test(ps)
        && /function PrincipleCrop/.test(tab) && /"4 \/ 3"/.test(tab) && /type="range"/.test(tab);
      t.add(ok2 ? "ok" : "fail", "Masaüstü ve telefon kartı aynı kırpmayı kullanıyor; panelde önizlemeli kaydırma çubuğu var", ok2 ? "" : "PrincipleCarousel / PrincipleStories / HomeContentTab satırları eksik");
      // 2026-11-19: telefon kartında görsel alanı sabit oran (paneldeki önizlemeyle aynı, 10:7 — sabit kart yüksekliği yok);
      // Hakkımızda › "Her ayakkabıda aradığımız" kartları da aynı kuralı kullanıyor
      const ok3 = /mobile: "10 \/ 7"/.test(pl) && /aspectRatio: PRINCIPLE_CARD_RATIO\.mobile/.test(pc) && !/height: "max\(220px, 33svh\)"/.test(pc)
        && /"10 \/ 7", "Telefon: kaydırmalı kart"/.test(tab) && /principleCardImage\(x[,)]/.test(about);
      t.add(ok3 ? "ok" : "fail", "Telefondaki prensip kartı paneldeki önizlemeyle aynı oranda; Hakkımızda kartları da aynı kırpmayla", ok3 ? "" : "principle-image / PrincipleCarousel / HomeContentTab / hakkimizda satırları eksik");
      // 2026-11-22: hikâye / prensip görselleri ham yükleniyordu (her biri 2–3 MB) → ekran boyuna küçültülmüş; hikâyede
      // önce ekrandaki görsel, o gelince sıradaki (hepsi aynı anda değil)
      const ok4 = /getImageProps\(/.test(pl) && /\{\.\.\.optimizedImg\(fullImg, "100vw"\)\} fetchPriority="high" onLoad=\{\(\) => allowNext\(fullImg\)\}/.test(ps)
        && /queue\.slice\(0, chain\)\.map/.test(ps) && !/<img key=\{`pre-\$\{u\}`\} src=\{u\}/.test(ps)
        && /srcSet=\{c\.srcSet\} sizes=\{c\.sizes\}/.test(pc) && /srcSet=\{c\.srcSet\} sizes=\{c\.sizes\}/.test(about);
      t.add(ok4 ? "ok" : "fail", "Hikâye ve prensip görselleri küçültülmüş geliyor; hikâyede görseller sırayla yükleniyor", ok4 ? "" : "principle-image / PrincipleStories / PrincipleCarousel / hakkimizda satırları eksik");
    });
  },
};
