-- ÜRÜN AÇIKLAMALARI — KISA VE OKUNUR (kullanıcı 2026-11-19: "çok tekdüze ve çok uzun … müşteriyi gereksiz yazıya boğmamak
-- ama merak edene de istediği yazıyı vermek; ai ve seo açısından sağlıklı"). Aynı metni paylaşan 5 grup yeniden yazıldı:
-- kısa giriş (kalın anahtar sözcükler) + maddeli özellikler + "Sık sorulan sorular" (sitede açılır-kapanır + FAQPage
-- yapısal verisi — src/lib/description-faq.ts). Malzeme / ölçü ayrıntısı "Marka hakkında" ve "Teknik bilgiler"de olduğu
-- için tekrarlanmadı. Sağlık iddiası içeren cümleler (depresyon, bel-diz ağrısı …) çıkarıldı.
--
-- YALNIZ METNİ HÂLÂ ESKİ ORTAK METİN OLAN ürünler güncellenir (marka + kategori + uzunluk + başlangıç eşleşmesi) — panelden
-- elle değiştirilmiş bir açıklamaya dokunulmaz. Eski metinler product_description_backup_20261119'da (geri almak için).
-- Tekrar çalıştırmak güvenli (ikinci seferde eşleşen ürün kalmaz).

CREATE TABLE IF NOT EXISTS public.product_description_backup_20261119 (
  product_id uuid PRIMARY KEY,
  description text,
  saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_description_backup_20261119 ENABLE ROW LEVEL SECURITY; -- dışarıya kapalı (kural yok)
REVOKE ALL ON public.product_description_backup_20261119 FROM anon, authenticated;

DO $mig$
DECLARE
  n int;
  v_attipas text := $d$<p><strong>Attipas</strong>, bebeğin ilk adımları için araştırmalarla geliştirilmiş, <strong>çorap kadar hafif</strong> bir ilk adım ayakkabısıdır. <strong>Kaymaz, esnek taban</strong> ve <strong>geniş parmak alanı</strong> minik ayakların doğal gelişimini destekler.</p><h3>Attipas'ın 7 özelliği</h3><ul><li><p><strong>Güvenli:</strong> Toksik madde içermez.</p></li><li><p><strong>Geniş parmak alanı:</strong> Parmaklar rahat hareket eder; motor gelişim desteklenir.</p></li><li><p><strong>Nefes alır:</strong> Tabandaki mikro kanallar nemi dışarı atar.</p></li><li><p><strong>Ultra hafif:</strong> Giyince yalnız çorap varmış gibi hissedilir.</p></li><li><p><strong>Kaymaz, esnek taban:</strong> Ayak doğal formunda hareket eder.</p></li><li><p><strong>İçeride ve dışarıda:</strong> Ev, park, kreş — her ortama uygun.</p></li><li><p><strong>Dayanıklı ve pratik:</strong> Kolay giyilir, uzun süre kullanılır.</p></li></ul>$d$;

  v_ayakkabi text := $d$<p><strong>Ayağın doğal şekline göre tasarlanmış</strong> Dodura barefoot ayakkabı: parmaklar sıkışmadan yayılır, <strong>ince ve esnek taban</strong> zemini hissettirir, <strong>sıfır topuk</strong> doğal duruşu korur. Gerçek dana derisinden, Türkiye'de üretilir.</p><h3>Neden rahat?</h3><ul><li><p><strong>Geniş burun:</strong> Parmaklar rahatça yayılır, ayak sıkışmaz.</p></li><li><p><strong>İnce, esnek taban:</strong> Ayak tabanı zemini hisseder, adım doğallaşır; taban ayağın hiçbir hareketini kısıtlamaz.</p></li><li><p><strong>Sıfır topuk (zero drop):</strong> Topuk ve burun aynı yükseklikte; kaslar ve tendonlar doğal çalışır.</p></li><li><p><strong>Kaymaz kauçuk taban:</strong> Esnek yapısıyla zemine uyum sağlar.</p></li><li><p><strong>Orthoflex iç taban (3 mm):</strong> Antibakteriyel, geri dönüştürülmüş malzeme; üzeri deri kaplı.</p></li></ul><h3>Sık sorulan sorular</h3><p><strong>Günlük kullanımda rahat mı?</strong><br>Evet. Ayağın doğal yapısına uyar; sıfır topuk sayesinde gün boyu rahat yürürsünüz. Barefoot'a yeni geçiyorsanız ilk haftalarda kısa sürelerle başlayıp süreyi kademeli artırın.</p><p><strong>Çıplak ayakla giyilebilir mi?</strong><br>Evet. İç astar nefes alan gerçek deridir; terlemeyi azaltır.</p><p><strong>Bir numara büyük mü almalıyım?</strong><br>Hayır, kendi numaranızı alın — burun zaten geniştir. Emin olmak için ayak uzunluğunuzu ölçüp ölçü tablosuna bakın.</p>$d$;

  v_babet text := $d$<p><strong>Ayağın doğal şekline göre tasarlanmış</strong> Dodura barefoot babet: parmaklar sıkışmadan yayılır, <strong>ince ve esnek taban</strong> zemini hissettirir, <strong>sıfır topuk</strong> doğal duruşu korur. Gerçek dana derisinden, Türkiye'de üretilir.</p><h3>Neden rahat?</h3><ul><li><p><strong>Geniş burun:</strong> Parmaklar rahatça yayılır, babet ayağı sıkmaz.</p></li><li><p><strong>İnce, esnek taban:</strong> Ayak tabanı zemini hisseder, adım doğallaşır; taban ayağın hiçbir hareketini kısıtlamaz.</p></li><li><p><strong>Sıfır topuk (zero drop):</strong> Topuk ve burun aynı yükseklikte; kaslar ve tendonlar doğal çalışır.</p></li><li><p><strong>Kaymaz kauçuk taban:</strong> Esnek yapısıyla zemine uyum sağlar.</p></li><li><p><strong>Orthoflex iç taban (3 mm):</strong> Antibakteriyel, geri dönüştürülmüş malzeme; üzeri deri kaplı.</p></li></ul><h3>Sık sorulan sorular</h3><p><strong>Günlük kullanımda rahat mı?</strong><br>Evet. Ayağın doğal yapısına uyar; sıfır topuk sayesinde gün boyu rahat yürürsünüz. Barefoot'a yeni geçiyorsanız ilk haftalarda kısa sürelerle başlayıp süreyi kademeli artırın.</p><p><strong>Çıplak ayakla giyilebilir mi?</strong><br>Evet. İç astar nefes alan gerçek deridir; terlemeyi azaltır.</p><p><strong>Bir numara büyük mü almalıyım?</strong><br>Hayır, kendi numaranızı alın — burun zaten geniştir. Emin olmak için ayak uzunluğunuzu ölçüp ölçü tablosuna bakın.</p>$d$;

  v_bot text := $d$<p><strong>Ayağın doğal şekline göre tasarlanmış</strong> Dodura barefoot bot: parmaklar sıkışmadan yayılır, <strong>ince ve esnek taban</strong> zemini hissettirir, <strong>sıfır topuk</strong> doğal duruşu korur. Gerçek dana derisinden, Türkiye'de üretilir; şehirde doğal yürüyüş isteyenler için.</p><h3>Neden rahat?</h3><ul><li><p><strong>Geniş burun:</strong> Kalın çorapla bile parmaklar rahatça yayılır.</p></li><li><p><strong>İnce, esnek taban:</strong> Ayak tabanı zemini hisseder, adım doğallaşır; taban ayağın hiçbir hareketini kısıtlamaz.</p></li><li><p><strong>Sıfır topuk (zero drop):</strong> Topuk ve burun aynı yükseklikte; kaslar ve tendonlar doğal çalışır.</p></li><li><p><strong>Kaymaz kauçuk taban:</strong> Kış şartlarında da tutuş sağlar.</p></li><li><p><strong>Orthoflex iç taban (3 mm):</strong> Antibakteriyel, geri dönüştürülmüş malzeme; üzeri deri kaplı.</p></li></ul><h3>Sık sorulan sorular</h3><p><strong>Su geçirir mi?</strong><br>Doğal deri suya karşı dirençlidir; ancak dikişli yapı nedeniyle tam su geçirmezlik garantisi yoktur. Yoğun yağışta deri koruyucu sprey kullanabilirsiniz.</p><p><strong>Tabanı kışın kayar mı?</strong><br>Hayır. Taban, yere yakın hissi koruyan esnek ve kaymaz kauçuktur; kışın da tutuş sağlar.</p><p><strong>Bir numara büyük mü almalıyım?</strong><br>Hayır, kendi numaranızı alın — burun zaten geniştir. Kalın çorapla giyecekseniz ölçü tablosuna bakın.</p><p><strong>Çıplak ayakla giyilebilir mi?</strong><br>Evet. İç astar nefes alan gerçek deridir; terlemeyi azaltır.</p>$d$;

  v_denge text := $d$<p><strong>YeriHisset Denge Barı</strong>, doğal ahşaptan yapılmış çok amaçlı bir araçtır: <strong>ayak masajı</strong>, <strong>denge çalışması</strong>, <strong>ısınma ve antrenman</strong>, çocuklar için <strong>oyun</strong>.</p><h3>Ne işe yarar?</h3><ul><li><p><strong>Masaj:</strong> Kavisli üst yüzey ayak tabanına masaj yapar; kasları gevşetir, kan dolaşımını destekler.</p></li><li><p><strong>Denge:</strong> Koordinasyonu ve odaklanmayı geliştirir; uzun süre oturanlar için iyi bir alışkanlıktır.</p></li><li><p><strong>Spor ve ısınma:</strong> Eklemlere yük bindirmeden pek çok kası çalıştırır; kalça, diz ve ayak bileği hareketliliğini artırır. Antrenman öncesi ısınmada bilek burkulma riskini azaltmaya yardımcı olur.</p></li><li><p><strong>Çocuklar için oyun:</strong> Denge (vestibüler) sistemini ve motor becerileri destekler. Örnek: iki ayakla, sonra tek ayakla en uzun süre dengede durma.</p></li></ul><h3>Malzeme ve güvenlik</h3><ul><li><p><strong>Doğal ahşap</strong>, uzun ömür için işlemden geçirilmiş.</p></li><li><p>Oyuncaklarda kullanılan <strong>EN71-3</strong> standardına uygun malzeme.</p></li><li><p>Taşıma kapasitesi: <strong>110 kg</strong>.</p></li></ul><h3>Sık sorulan sorular</h3><p><strong>Çorapla kullanılır mı?</strong><br>Hayır, çıplak ayakla kullanın; çorap kaydırabilir.</p><p><strong>Nerede kullanmalıyım?</strong><br>Düz bir zeminde. Kullanmadan önce sabit durduğunu kontrol edin.</p><p><strong>Çocuklar tek başına kullanabilir mi?</strong><br>Küçük çocuklar yetişkin gözetiminde ya da yardımıyla kullanmalı.</p><p><strong>Yeni ürün koku yapar mı?</strong><br>İlk açılışta hafif doğal ahşap kokusu olabilir; ambalajdan çıkınca kısa sürede geçer.</p>$d$;
BEGIN
  -- Yedek: değişecek ürünlerin eski metni (bir kez; yeniden çalıştırmada üzerine yazılmaz)
  INSERT INTO public.product_description_backup_20261119 (product_id, description)
  SELECT p.id, p.description FROM public.products p
  JOIN public.brands b ON b.id = p.brand_id JOIN public.categories c ON c.id = p.category_id
  WHERE (b.name, c.name, char_length(p.description)) IN (('Attipas','İlkadım',795), ('Dodura','Ayakkabı',2396), ('Dodura','Babet',2398), ('Dodura','Bot',3007), ('YeriHisset','Aksesuar',4109))
  ON CONFLICT (product_id) DO NOTHING;

  UPDATE public.products p SET description = v_attipas, updated_at = now() FROM public.brands b, public.categories c
   WHERE b.id = p.brand_id AND c.id = p.category_id AND b.name = 'Attipas' AND c.name = 'İlkadım'
     AND char_length(p.description) = 795 AND p.description LIKE '<p>Eşi benzeri olmayan tasarım%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'Attipas: % ürün', n;

  UPDATE public.products p SET description = v_ayakkabi, updated_at = now() FROM public.brands b, public.categories c
   WHERE b.id = p.brand_id AND c.id = p.category_id AND b.name = 'Dodura' AND c.name = 'Ayakkabı'
     AND char_length(p.description) = 2396 AND p.description LIKE 'İnce ve Esnek Taban%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'Dodura ayakkabı: % ürün', n;

  UPDATE public.products p SET description = v_babet, updated_at = now() FROM public.brands b, public.categories c
   WHERE b.id = p.brand_id AND c.id = p.category_id AND b.name = 'Dodura' AND c.name = 'Babet'
     AND char_length(p.description) = 2398 AND p.description LIKE '<p>İnce ve Esnek Taban</p>%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'Dodura babet: % ürün', n;

  UPDATE public.products p SET description = v_bot, updated_at = now() FROM public.brands b, public.categories c
   WHERE b.id = p.brand_id AND c.id = p.category_id AND b.name = 'Dodura' AND c.name = 'Bot'
     AND char_length(p.description) = 3007 AND p.description LIKE '<p>İnce ve Esnek Taban</p>%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'Dodura bot: % ürün', n;

  UPDATE public.products p SET description = v_denge, updated_at = now() FROM public.brands b, public.categories c
   WHERE b.id = p.brand_id AND c.id = p.category_id AND b.name = 'YeriHisset' AND c.name = 'Aksesuar'
     AND char_length(p.description) = 4109 AND p.description LIKE '<p>YeriHisset Denge Barı''nın%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'Denge barı: % ürün', n;
END $mig$;
