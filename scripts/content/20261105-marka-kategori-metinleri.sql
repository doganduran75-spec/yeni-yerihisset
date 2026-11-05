-- MARKA VE KATEGORİ SAYFA METİNLERİ — ilk taslak (2026-11-05). Panel › Ayarlar › Markalar / Kategoriler › "Sayfa metni".
-- Yalnız BOŞ alanları doldurur (coalesce): panelde yazılmış bir metnin üzerine yazmaz; tekrar çalıştırmak zararsız.
-- Ürünü olmayan kategoriler (Aksesuar, Denge Barı) ve ürünü olmayan YeriHisset markası bilerek boş bırakıldı.
-- Kaynaklar: eski sitenin ürün bilgileri (docs/RENK-PARAGRAFLARI.md), Barefoot nedir sayfası (src/config/static-pages.ts),
-- Attipas'ın Benelux distribütörü (attipasnl.nl) ve satıcı sayfaları. Rakam ve iddia uydurulmadı; tıbbi vaat yok.
-- Çalıştırma: docker exec -i supabase-db psql -U postgres -d postgres < scripts/content/20261105-marka-kategori-metinleri.sql

BEGIN;

-- ── DODURA ─────────────────────────────────────────────────────────────────────────────────────────────────────
UPDATE public.brands SET
  intro = coalesce(intro, $t$Dodura, Türkiye'de üretilen deri barefoot (yalınayak) ayakkabı markasıdır. Geniş burun, sıfır topuk farkı (zero drop) ve esnek kauçuk tabanla ayağın doğal şeklini ve hareketini korur. Ayakkabı, bot ve babet modelleri dana derisi saya ve astarla, 36–46 numara aralığında üretilir.$t$),
  about = coalesce(about, $t$<p><b>Dodura</b>, ayakkabının ayağa uyması gerektiği fikriyle yola çıkan, Türkiye'de üretilen bir barefoot (yalınayak) ayakkabı markasıdır. Her modelde aynı üç ilke vardır: parmakların sıkışmadan yayıldığı <b>geniş burun</b>, topuk ile ön ayak arasında yükseklik farkı olmayan <b>sıfır topuk (zero drop)</b> ve adımla birlikte bükülen <b>esnek taban</b>.</p>
<ul>
<li><b>Saya, astar ve iç taban kaplaması:</b> %100 dana derisi</li>
<li><b>Dış taban:</b> %100 kauçuk, 5,5 mm</li>
<li><b>Ayak ile zemin arası:</b> toplam yaklaşık 10,5 mm — 5,5 mm kauçuk taban, 1 mm keçe, 3 mm iç taban, 1 mm deri</li>
<li><b>Topuk farkı:</b> 0 mm</li>
<li><b>Numara:</b> 36–46</li>
</ul>
<p>Barefoot ayakkabıya yeni geçiyorsanız ilk haftalarda kısa sürelerle başlayıp giyme süresini kademeli artırmanızı öneririz. Ayrıntılar: <a href="/barefoot-nedir">Barefoot ayakkabı nedir?</a></p>$t$),
  faq = coalesce(faq, $j$[
    {"q": "Dodura ayakkabılar gerçekten barefoot mu?", "a": "Evet. Dodura modellerinde geniş parmak alanı, 0 mm topuk farkı (zero drop) ve elle bükülebilen esnek bir taban vardır. Ayak ile zemin arasında toplam yaklaşık 10,5 mm bulunur (5,5 mm kauçuk taban, 1 mm keçe, 3 mm iç taban, 1 mm deri); bu, zemini hissettirirken şehir yüzeylerinde konfor sağlar."},
    {"q": "Dodura ayakkabılar hangi malzemeden yapılıyor?", "a": "Saya, astar ve iç taban kaplaması %100 dana derisidir; dış taban %100 kauçuktur. Ayakkabılar Türkiye'de üretilir."},
    {"q": "Hangi numarayı almalıyım?", "a": "Dodura 36–46 numara aralığında üretilir. Ayağınızı akşam saatinde, ayakta dururken topuktan en uzun parmağa kadar ölçüp ürün sayfasındaki tabloyla karşılaştırın. Burun geniş olduğu için çoğu kişiye alıştığı numara olur. Olmazsa 14 gün içinde ücretsiz değişim ve iade hakkınız var."},
    {"q": "Barefoot ayakkabıya ilk kez geçiyorum, nelere dikkat etmeliyim?", "a": "Ayak kaslarınız yıllarca destekli ayakkabıya alıştıysa geçişi yavaş yapın: ilk haftalarda evde ve kısa yürüyüşlerde giyin, süreyi kademeli artırın. Ayak, diz veya bel ağrınız ya da diyabet gibi bir sağlık sorununuz varsa önce hekiminize danışın."},
    {"q": "Deri bakımı nasıl yapılır?", "a": "Tozunu ve kirini nemli bir bezle silin, ara ara deri kremiyle besleyin. Islanırsa içine kâğıt koyup oda sıcaklığında kurutun; kalorifer ya da saç kurutma makinesi deriyi kurutup çatlatabilir."}
  ]$j$::jsonb)
WHERE slug = 'dodura';

-- ── ATTIPAS ────────────────────────────────────────────────────────────────────────────────────────────────────
UPDATE public.brands SET
  intro = coalesce(intro, $t$Attipas, bebeklerin ilk adımları için geliştirilmiş Güney Kore çıkışlı barefoot ilk adım ayakkabısı markasıdır. Seul'de yürümeyi öğrenen bebekler üzerinde yapılan yedi yıllık araştırmanın ardından 2011'de piyasaya çıktı. Çorap kadar hafif ve esnek; geniş burunlu, kaymaz ve nefes alan tabanlıdır.$t$),
  about = coalesce(about, $t$<p><b>Attipas</b>, bebeklerin yürümeyi öğrenirken ayaklarını özgür bırakmak için tasarlanmış bir ilk adım ayakkabısıdır. Seul'de yürüyen bebeklerin hareketleri üzerinde yapılan yedi yıllık araştırma ve geliştirme çalışmasının ardından 2011'de piyasaya çıktı; tasarımı uluslararası patentlidir.</p>
<ul>
<li><b>Çorap kadar hafif ve esnek:</b> bebek ayakkabıyı değil, zemini hisseder.</li>
<li><b>Geniş burun:</b> parmaklar sıkışmadan serbestçe hareket eder.</li>
<li><b>Düz ve ince taban:</b> topuk farkı yok, ek dolgu ya da destek yok — ayak kendi dengesini kurar.</li>
<li><b>Kaymaz taban:</b> ev, kreş ve oyun alanındaki kaygan zeminlerde tutunma sağlar.</li>
<li><b>Nefes alan taban:</b> tabandaki küçük delikler ısının ve nemin dışarı çıkmasına yardım eder.</li>
<li><b>Kolay bakım:</b> çamaşır makinesinde yıkanabilir, çabuk kurur.</li>
</ul>
<p>Çocuk ayağı hızlı büyüdüğü için numarayı 2–3 ayda bir kontrol etmenizi öneririz. Ayrıntılar: <a href="/barefoot-nedir">Barefoot ayakkabı nedir?</a></p>$t$),
  faq = coalesce(faq, $j$[
    {"q": "Attipas barefoot ayakkabı mı?", "a": "Evet. Attipas'ın tabanı ince ve esnektir, topuk farkı yoktur ve ek dolgu ya da destek içermez; burnu geniştir. Böylece bebek, yalınayak yürür gibi zemini hisseder ve dengesini kendi kurar."},
    {"q": "Attipas hangi yaş için uygun?", "a": "Bebeğin ilk adımlarından itibaren, yürümeyi öğrenme ve sonrası dönem için tasarlanmıştır. Doğru numara yaşa göre değil, ayak uzunluğuna göre seçilir."},
    {"q": "Numarayı nasıl seçmeliyim?", "a": "Bebeğiniz ayaktayken topuktan en uzun parmağa kadar ölçün ve ürün sayfasındaki tabloyla karşılaştırın; parmakların önünde biraz pay kalmalı. Çocuk ayağı hızlı büyüdüğü için numarayı 2–3 ayda bir kontrol edin. Olmazsa 14 gün içinde ücretsiz değişim ve iade hakkınız var."},
    {"q": "Attipas yıkanabilir mi?", "a": "Evet, çamaşır makinesinde yıkanabilir ve çabuk kurur. Hassas programda yıkayıp doğal havada kurutmanızı öneririz."},
    {"q": "Attipas kaygan zeminde kaydırır mı?", "a": "Hayır, tabanı kaymaz olarak tasarlanmıştır; ev, kreş ve oyun alanındaki parke ve fayans gibi kaygan zeminlerde tutunma sağlar."}
  ]$j$::jsonb)
WHERE slug = 'attipas';

-- ── KATEGORİ: AYAKKABI (yetişkin) ──────────────────────────────────────────────────────────────────────────────
UPDATE public.categories SET
  intro = coalesce(intro, $t$Yetişkinler için barefoot ayakkabılar: geniş burun, sıfır topuk farkı (zero drop) ve esnek, ince tabanla ayağı sıkmadan korur. Dodura'nın dana derisi barefoot ayakkabıları ofisten hafta sonuna her gün giyilecek sade modellerdir.$t$),
  faq = coalesce(faq, $j$[
    {"q": "Barefoot ayakkabı nedir?", "a": "Ayağın doğal şeklini ve hareketini korumak için tasarlanmış minimal ayakkabıdır. Dört özelliği vardır: parmakların yayıldığı geniş burun, topuk ile ön ayak arasında 0 mm fark (zero drop), bükülebilen esnek taban ve zemini hissettiren ince taban."},
    {"q": "Barefoot ayakkabı her gün ve iş ortamında giyilir mi?", "a": "Evet. Geçiş dönemini tamamladıktan sonra günlük kullanım için tasarlanmıştır. Deri ve sade modeller, özellikle siyah renkler, iş ortamında klasik ayakkabı yerine rahatça giyilir."},
    {"q": "Barefoot ayakkabıya nasıl geçmeliyim?", "a": "Yavaş geçin: ilk haftalarda evde ve kısa yürüyüşlerde giyin, giyme süresini kademeli artırın. Ayakta ya da baldırda yorgunluk hissederseniz bir gün ara verin. Ağrınız ya da bir sağlık sorununuz varsa önce hekiminize danışın."},
    {"q": "Numara nasıl seçilir?", "a": "Ayağınızı akşam saatinde, ayakta dururken ölçüp ürün sayfasındaki tabloyla karşılaştırın. Burun geniş olduğu için çoğu kişiye alıştığı numara olur. Olmazsa 14 gün içinde ücretsiz değişim ve iade hakkınız var."}
  ]$j$::jsonb)
WHERE slug = 'ayakkabi';

-- ── KATEGORİ: BOT (yetişkin) ───────────────────────────────────────────────────────────────────────────────────
UPDATE public.categories SET
  intro = coalesce(intro, $t$Barefoot bot: kışın da ayağın doğal hareketinden vazgeçmeyenler için. Geniş burun, sıfır topuk farkı ve esnek kauçuk tabanlı Dodura botlar, dana derisi saya ve astarıyla şehirde ve serin havada her gün giyilir.$t$),
  faq = coalesce(faq, $j$[
    {"q": "Barefoot bot ile klasik bot arasındaki fark nedir?", "a": "Klasik botlar genellikle dar burunlu, topuklu ve sert tabanlıdır. Barefoot botta burun geniştir, topuk farkı 0 mm'dir ve taban esnektir; ayak kışın da doğal şeklinde hareket eder."},
    {"q": "Barefoot bot su geçirir mi?", "a": "Deri doğal yapısıyla suya dayanıklıdır, ancak dikişli olduğu için tam su geçirmez değildir. Sağanak yağmurda deri koruyucu sprey kullanmanızı öneririz."},
    {"q": "Kalın çorapla giyebilir miyim?", "a": "Evet, geniş burun kalın çoraba da yer bırakır. Botu kışın kalın çorapla giyecekseniz numarayı çorapla ölçmenizi öneririz."},
    {"q": "Numara nasıl seçilir?", "a": "Ayağınızı akşam saatinde, ayakta dururken ölçüp ürün sayfasındaki tabloyla karşılaştırın. Olmazsa 14 gün içinde ücretsiz değişim ve iade hakkınız var."}
  ]$j$::jsonb)
WHERE slug = 'bot';

-- ── KATEGORİ: BABET (yetişkin) ─────────────────────────────────────────────────────────────────────────────────
UPDATE public.categories SET
  intro = coalesce(intro, $t$Barefoot babet: klasik babetin sadeliği, parmakları sıkmayan geniş burun ve düz, esnek tabanla. Dodura babetler dana derisi sayasıyla elbiseden kota, ofisten yaza gün boyu rahat giyilir.$t$),
  faq = coalesce(faq, $j$[
    {"q": "Barefoot babetin klasik babetten farkı nedir?", "a": "Klasik babetlerin burnu genellikle daralır ve parmakları sıkıştırır. Barefoot babette burun geniştir, topuk farkı 0 mm'dir ve taban esnektir; gün boyu giyildiğinde parmaklar sıkışmaz."},
    {"q": "Çorapla mı, çıplak ayakla mı giyilir?", "a": "İkisiyle de giyilebilir. Yazın çıplak ayakla, serin günlerde ince çorap ya da babet çorabıyla kullanabilirsiniz."},
    {"q": "İş ortamında giyilir mi?", "a": "Evet. Sade deri görünümü kumaş pantolon, etek ve elbiseyle uyumludur; siyah renk geniş burun yapısını daha az belli eder."},
    {"q": "Numara nasıl seçilir?", "a": "Ayağınızı akşam saatinde, ayakta dururken ölçüp ürün sayfasındaki tabloyla karşılaştırın. Olmazsa 14 gün içinde ücretsiz değişim ve iade hakkınız var."}
  ]$j$::jsonb)
WHERE slug = 'babet';

-- ── KATEGORİ: İLKADIM (0–4 yaş) ────────────────────────────────────────────────────────────────────────────────
UPDATE public.categories SET
  intro = coalesce(intro, $t$0–4 yaş için barefoot ilk adım ayakkabıları: bebeğin yürümeyi öğrenirken zemini hissetmesi için hafif, esnek ve ince tabanlı; parmakları sıkmayan geniş burunlu ve kaymaz tabanlı. Attipas modelleri çorap kadar hafiftir ve makinede yıkanabilir.$t$),
  faq = coalesce(faq, $j$[
    {"q": "Bebek ilk adımlarında neden barefoot ayakkabı giymeli?", "a": "Bebekler yürümeyi öğrenirken ayaklarıyla zemini hissetmeye ihtiyaç duyar. Çocuk ortopedisi kaynakları, ayağın en iyi yalınayak geliştiğini ve çocuk ayakkabısının bu modele göre seçilmesini önerir: esnek, ince ve kaymaz taban, geniş burun ve hafiflik."},
    {"q": "Bebeğim ne zaman ayakkabı giymeye başlamalı?", "a": "Evde, güvenli zeminde yalınayak yürümek en iyisidir. Kaygan zeminlerde, kreşte ve dışarıda ayağı korumak için barefoot ilk adım ayakkabısı tercih edilebilir."},
    {"q": "Numara ne sıklıkla kontrol edilmeli?", "a": "Çocuk ayağı hızlı büyür; numarayı 2–3 ayda bir kontrol edin. Ölçerken bebeğiniz ayakta olsun, topuktan en uzun parmağa kadar ölçün ve parmakların önünde biraz pay bırakın."},
    {"q": "Yıkanabilir mi?", "a": "Attipas modelleri çamaşır makinesinde yıkanabilir ve çabuk kurur. Hassas programda yıkayıp doğal havada kurutmanızı öneririz."}
  ]$j$::jsonb)
WHERE slug = 'ilkadim';

-- Kontrol: dolu alanlar
SELECT 'marka' AS tur, name, intro IS NOT NULL AS tanitim, about IS NOT NULL AS hakkinda, jsonb_array_length(coalesce(faq, '[]'::jsonb)) AS sss FROM public.brands WHERE slug IN ('dodura', 'attipas')
UNION ALL
SELECT 'kategori', name, intro IS NOT NULL, NULL, jsonb_array_length(coalesce(faq, '[]'::jsonb)) FROM public.categories WHERE slug IN ('ayakkabi', 'bot', 'babet', 'ilkadim')
ORDER BY 1, 2;

COMMIT;
