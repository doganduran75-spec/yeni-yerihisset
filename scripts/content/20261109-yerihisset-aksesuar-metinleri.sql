-- YERİHİSSET MARKASI + AKSESUAR KATEGORİSİ SAYFA METİNLERİ — ilk taslak (2026-11-09). Panel › Ayarlar › Markalar / Kategoriler › "Sayfa metni".
-- 20261105 taslağında ürünsüz oldukları için boş bırakılmışlardı; şimdi tek ürünleri "YeriHisset Denge Barı".
-- Yalnız BOŞ alanları doldurur (coalesce): panelde yazılmış bir metnin üzerine yazmaz; tekrar çalıştırmak zararsız.
-- Ürünün ölçü / malzeme bilgisi girilmediği için metinde ölçü, malzeme ya da rakam yok; tıbbi vaat yok.
-- Çalıştırma: docker exec -i supabase-db psql -U postgres -d postgres < scripts/content/20261109-yerihisset-aksesuar-metinleri.sql

BEGIN;

-- ── MARKA: YERİHİSSET ──────────────────────────────────────────────────────────────────────────────────────────
UPDATE public.brands SET
  intro = coalesce(intro, $t$YeriHisset, barefoot ayakkabıyı tamamlayan ürünleri kendi adıyla sunduğu markadır. Amaç, ayağın evde de doğal şeklinde ve yalınayak hareket etmesine yardımcı olmak; ilk ürünü YeriHisset Denge Barı.$t$),
  about = coalesce(about, $t$<p><b>YeriHisset</b> markalı ürünler, barefoot ayakkabıyla aynı fikirden çıkar: ayak, zemini hissettiğinde ve serbestçe hareket ettiğinde kendi dengesini kurar. Bu ürünler ayakkabının dışında, evde yalınayak geçirilen zamanı desteklemek için seçildi.</p>
<p>Barefoot ayakkabının ne olduğunu ve geçişin nasıl yapılacağını merak ediyorsanız: <a href="/barefoot-nedir">Barefoot ayakkabı nedir?</a></p>$t$),
  faq = coalesce(faq, $j$[
    {"q": "YeriHisset markalı ürünler neler?", "a": "Barefoot ayakkabıyı tamamlayan, evde yalınayak hareketi destekleyen yardımcı ürünlerdir. Şu an YeriHisset Denge Barı satıştadır."},
    {"q": "Denge Barı nasıl kullanılır?", "a": "Kaymayan, düz bir zemine koyun; üzerine yalınayak çıkıp durarak ya da yavaşça yürüyerek kullanın. İlk denemelerde bir duvara ya da sandalyeye tutunun. Çocuklar yetişkin gözetiminde kullanmalıdır."},
    {"q": "İade edebilir miyim?", "a": "Evet, teslimden itibaren 14 gün içinde iade edebilirsiniz. Ayrıntılar İade ve Değişim sayfasında."}
  ]$j$::jsonb)
WHERE name = 'YeriHisset';

-- ── KATEGORİ: AKSESUAR ─────────────────────────────────────────────────────────────────────────────────────────
UPDATE public.categories SET
  intro = coalesce(intro, $t$Barefoot ayakkabıyı tamamlayan aksesuarlar: ayağın evde de yalınayak, zemini hissederek çalışmasına yardımcı olan ürünler. Numarası olmadığı için numara seçseniz de listede görünürler.$t$),
  faq = coalesce(faq, $j$[
    {"q": "Aksesuar kategorisinde neler var?", "a": "Barefoot ayakkabıyla birlikte kullanılan ve evde yalınayak hareketi destekleyen ürünler; örneğin YeriHisset Denge Barı."},
    {"q": "Denge barı ne işe yarar?", "a": "Üzerinde yalınayak durup yürürken ayak tabanı zemini hisseder; ayak ve bacak kasları dengeyi korumak için birlikte çalışır. Evde birkaç dakikalık kısa denge çalışmaları için kullanılır."},
    {"q": "Güvenli kullanım için nelere dikkat etmeliyim?", "a": "Barı kaymayan, düz bir zemine koyun ve yalınayak ya da kaymaz çorapla kullanın. İlk denemelerde bir yere tutunun; çocuklar yetişkin gözetiminde kullanmalıdır. Ayak, diz ya da denge sorununuz varsa önce hekiminize danışın."},
    {"q": "İade edebilir miyim?", "a": "Evet, teslimden itibaren 14 gün içinde iade edebilirsiniz. Ayrıntılar İade ve Değişim sayfasında."}
  ]$j$::jsonb)
WHERE name = 'Aksesuar';

-- Kontrol: dolu alanlar
SELECT 'marka' AS tur, name, intro IS NOT NULL AS tanitim, about IS NOT NULL AS hakkinda, jsonb_array_length(coalesce(faq, '[]'::jsonb)) AS sss FROM public.brands WHERE name = 'YeriHisset'
UNION ALL
SELECT 'kategori', name, intro IS NOT NULL, NULL, jsonb_array_length(coalesce(faq, '[]'::jsonb)) FROM public.categories WHERE name = 'Aksesuar'
ORDER BY 1, 2;

COMMIT;
