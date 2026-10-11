# SEO + GEO analizi — YeriHisset (2026-10-11)

**GEO** (Generative Engine Optimization): ChatGPT, Gemini, Google AI Mode / AI Overviews, Perplexity, Copilot gibi
yapay zekâ asistanlarına bir soru sorulduğunda **cevapta sitenin / markanın anılması ve kaynak gösterilmesi**.
Bu belge: (1) araştırma bulguları, (2) bugünkü durumumuz, (3) sayfa ve içerik nasıl olmalı, (4) öncelikli yapılacaklar.
İkinci aşama (mevcut her ürün / yazı için somut değişiklik listesi) `scripts/seo-audit.mjs` çıktısıyla yapılacak.

---

## 1. Özet

1. **Boşluk büyük, fırsat büyük.** Yapay zekâ destekli aramada "Türkiye'de barefoot ayakkabı nereden alınır",
   "Türkçe barefoot rehberi", "Attipas Türkiye" sorularında **ne YeriHisset ne de başka bir Türk mağaza** çıkıyor;
   cevaplar yabancı sitelere ve Vivobarefoot adına açılmış şüpheli sitelere (Şikayetvar / Ekşi'de dolandırıcılık
   uyarıları) gidiyor. Asistan kendisi "Türkçe, kapsamlı, bağımsız bir rehber bulunamadı" diyor. Bu alanı ilk
   dolduran, kalıcı olarak "referans kaynak" olur.
2. **Marka adıyla sorulunca bulunuyoruz** (eski sitenin ürün sayfaları dizinli), ama **konu sorulunca yokuz**.
   Sebep: konu sayfalarımız ince, ürün metinleri kalıp, sitede alıntılanacak sayısal/özgün bilgi az, site dışında
   hakkımızda konuşan neredeyse yok.
3. **Teknik altyapı iyi** (sayfalar sunucuda üretiliyor → yapay zekâ tarayıcıları JavaScript çalıştırmadan okuyabiliyor;
   ürün yapısal verisi, besleme var). Bu turda **5 teknik hata düzeltildi** (bkz. 4.2) — en ciddisi: kök düzendeki
   canonical yüzünden `/barefoot-nedir` gibi sayfalar Google'a "asıl sayfam ana sayfa" diyordu.
4. **En büyük iş içerik:** ürün metinlerinin özgünleştirilmesi (Dodura'nın tüm renkleri aynı metin), ölçü verisi
   (taban mm, ağırlık gr, ayak boyu mm), kategori/marka tanıtım metinleri, kaynaklı rehberler.
5. **Site dışı görünürlük** (YouTube, Ekşi/Reddit, ebeveyn toplulukları, basın, pazar yerleri) yapay zekâ cevaplarını
   en az site içi kadar etkiliyor.

---

## 2. Araştırma: yapay zekâ kaynakları nasıl seçiyor?

### 2.1 Hakemli çalışma — Princeton "GEO" (KDD 2024)
Aynı içeriğe yapılan değişikliklerin yapay zekâ cevabındaki görünürlüğe etkisi (GEO-bench, 10.000 soru):

| Yöntem | Görünürlük değişimi |
|---|---|
| **Alıntı ekleme** (uzman / kaynak cümlesi) | **+%41** |
| **İstatistik / sayısal veri ekleme** | **+%33** |
| Akıcı, net anlatım | +%29 |
| **Kaynak gösterme** | +%28 (diğerleriyle birlikte en etkili) |
| Teknik terim | +%18 |
| Anahtar kelime doldurma | **−%9 (zarar)** |

En önemli bulgu: **arama sonuçlarında alt sıralardaki (küçük) siteler bu yöntemlerden çok daha fazla kazanıyor**
(5. sıradaki site için kaynak göstermek +%115). Yani yapay zekâ, domain otoritesinden çok **içeriğin kendisine** bakıyor —
küçük bir mağaza için iyi haber.

### 2.2 Platformlar farklı davranıyor
- **Google AI Overviews / AI Mode:** Google'ın resmî tavrı "ayrı bir optimizasyon yok, iyi SEO yeter": sayfa dizinde
  ve snippet'e uygun olmalı, önemli içerik metin olarak bulunmalı, yapısal veri görünen içerikle aynı olmalı,
  **Merchant Center bilgileri güncel tutulmalı**. Google'ın Mayıs 2026 rehberi `llms.txt`, içeriği parçalara bölme,
  yapay zekâ için ayrı metin yazma ve **toplu üretilmiş sayfaların spam sayılacağını** açıkça yazıyor.
- **Google alışveriş (AI Mode, Gemini):** Merchant Center ürün verisi altı yüzeyi besliyor; eksik özellikli (renk,
  malzeme, numara, kullanım alanı) ürün "kaybolmuyor ama geride kalıyor". Yeni "sohbet" özellikleri (ürün SSS'si,
  kullanım senaryoları, alternatifler) önce ABD'de.
- **ChatGPT:** Arama için **OAI-SearchBot** tarayıcısı (engellenirse ChatGPT aramasında çıkılmaz), eğitim için
  GPTBot ayrı. Alışverişte Mart 2026'dan beri **ürün beslemelerine** dayanıyor (ACP; başvuruyla, Türkiye desteği belirsiz).
  Bing dizini hâlâ önemli bir kaynak sayılıyor → **Bing Webmaster Tools** ucuz sigorta.
- **Perplexity / Gemini:** Reddit, YouTube ve inceleme/karşılaştırma listelerinden çok besleniyor; güncelliği ödüllendiriyor.
- **Platformlar arası örtüşme düşük** (aynı soruya aynı alan adını gösterme oranı çok düşük) → tek bir yere değil,
  "her yerde tutarlı bilgi"ye çalışmak gerekiyor.

### 2.3 Teknik gerçekler
- **Yapay zekâ tarayıcıları (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot) JavaScript çalıştırmıyor.** Yalnız
  ilk HTML'i okuyorlar. Bizde ürün, kategori, rehber sayfaları sunucuda üretiliyor ✓ — ama yorumlar gibi sonradan
  yüklenen kısımlar görünmüyor.
- **`llms.txt`:** sunucu kayıtlarına göre dosyaların %97'si hiç okunmuyor, Google kullanmıyor. **Öncelik değil.**
- **Yapısal veri** (schema.org) tek başına sıralama vermiyor ama Google zengin sonuç + Merchant Center için gerekli,
  ürün varlığını (marka, fiyat, stok, iade) makinelerin hatasız anlamasını sağlıyor.

### 2.4 Site dışı sinyaller
YouTube ve Reddit yapay zekâ cevaplarında en çok kaynak gösterilen alan adları arasında. Türkiye için karşılıkları:
**YouTube, Ekşi Sözlük, Reddit (r/Turkey, r/barefootshoes), DonanımHaber, Kadınlar Kulübü / ebeveyn forumları,
Instagram, haber siteleri, pazar yeri mağaza sayfaları.** Kural: gerçek kişi, gerçek deneyim — sahte yorum / sahte
forum mesajı hem etik değil hem platformlar ve Google tarafından cezalandırılıyor.

---

## 3. Bugünkü durum — yapay zekâ bizi nasıl görüyor?

**Yapılan testler (yapay zekâ destekli arama, 2026-10-11):**

| Soru | Sonuç |
|---|---|
| "barefoot ayakkabı nereden alınır Türkiye, çocuk önerisi" | YeriHisset yok; Idefix'te bir ürün + yabancı mağazalar |
| "YeriHisset barefoot" | Bulunamadı (marka varlık olarak tanınmıyor) |
| `"yerihisset" ayakkabı` (tırnaklı) | Bulundu: eski sitenin Dodura / Attipas ürün sayfaları |
| "Attipas Türkiye ilk adım ayakkabısı satış" | YeriHisset yok; Kore / Japonya satıcıları |
| "barefoot ayakkabı nedir, Türkçe rehber" | YeriHisset yok; "Türkçe kapsamlı rehber bulunamadı" |
| "barefoot ayakkabı Türkiye satan siteler" (geniş arama) | YeriHisset ana sayfası çıktı (Dodura); yanında sahte Vivobarefoot siteleri |

**Eski sitedeki içerik (taşınacak / zaten taşındı):** 11 blog yazısı (barefoot nedir, zero drop, çocukların ayak
gelişimi, postür, Attipas hakkında, taban neden ince, barefoot rehberi …) + SSS, Attipas ölçü rehberi, Attipas bakım
rehberi, Attipas marka hakkında, Hakkımızda, Neden barefoot. **Bu sayfaların adresleri 301 ile yeni adreslere
yönlendirilmeli** (canlı geçiş listesinde var) — yoksa Google'daki birikim sıfırlanır.

**Ürün metinleri (eski site incelemesi):**
- **Dodura:** ~400 kelime, iyi başlıklar (ince taban, geniş burun, eşit yükseklik, Orthoflex 3 mm iç taban, malzeme
  %100 deri / kauçuk, Türkiye üretimi) ama **tüm renklerde aynı metin** (yalnız renk adı değişiyor), giriş paragrafı
  sayfada iki kez tekrar ediyor. **Eksik:** taban kalınlığı (mm), ağırlık (gr), kalıp genişliği, numara–ayak boyu
  tablosu (metin olarak; şu an yalnız görselde), kalıp tavsiyesi ("alıştığın numarayı al"), bakım, kimler için.
- **Attipas:** ~190 kelime, çoğu marka metni ("bilimsel 7 nokta"). **Eksik:** yaş aralığı, numara → ayak boyu (mm),
  taban kalınlığı / ağırlık, malzeme, yıkama/bakım, hangi dönemde (emekleme / ilk adım / yürüme) uygun.
- Görsel alt metinleri: ürün adı + "Görsel 2/3"; bazıları boş. Yeni sitede tüm görsellerde yalnız ürün adı.

---

## 4. Yeni site — teknik durum

### 4.1 İyi olanlar
- Ürün / kategori / marka / rehber sayfaları sunucuda üretiliyor → yapay zekâ tarayıcıları okuyabiliyor.
- Ürün yapısal verisi (Product + Offer + stok + puan + breadcrumb), Organization / WebSite, Open Graph.
- Google / Meta ürün beslemesi (barkod, numara, marka, kategori).
- robots.txt tüm tarayıcılara açık (yapay zekâ botları engellenmiyor — bot koruması yalnız formlarda).

### 4.2 Bu turda düzeltilenler
| Sorun | Etki | Düzeltme |
|---|---|---|
| Kök düzende `canonical = ana sayfa` → kendi canonical'ı olmayan her sayfaya miras | `/barefoot-nedir`, `/affiliate`, yasal sayfalar Google'a "kopya" görünürdü | Kök düzenden kaldırıldı; her sayfa kendi adresini gösteriyor |
| Site haritasında yalnız ürünler | Kategori, marka, rehber, barefoot-nedir keşfedilmiyordu | Hepsi eklendi (yalnız ürünü olan kategori/marka) |
| Site başlığı "Kaliteli Alışveriş ve Bilgi Platformu" | Marka konusu belirsiz (yapay zekâ "ne satıyor?" anlamıyor) | "Barefoot Ayakkabı — Yetişkin ve Çocuk" + açıklama |
| Kurum yapısal verisi boş (adres, iletişim, iade yok); site içi arama adresi yanlış (`/?q=`) | Varlık tanımı zayıf | `OnlineStore`: unvan, adres, vergi no, e-posta, 14 gün ücretsiz iade politikası; arama `/ara?q=` |
| Ürün meta açıklaması = tüm ürün metni | Arama sonucunda kesik / anlamsız özet | ~155 karakter, kelime sınırında |
| Breadcrumb'da kategori bağlantısı ana sayfaya gidiyordu | Hatalı yapı | `/kategori/<slug>` |
| İçeriksiz ara sayfalar (giriş, sipariş sonucu, şifre…) taranabiliyordu | Tarama bütçesi israfı | robots.txt'te kapatıldı |

### 4.3 Kalan teknik işler (karar / içerik gerektiren)
- **Ürün yapısal verisi:** `ProductGroup` + varyant (numara) yapısı, `color`, `material`, `audience` (çocuk/yetişkin),
  `gtin` (barkod), `size` + `sizeSystem`; ürün SSS'si için `FAQPage` (yalnız sayfada gerçekten SSS varsa).
- **Merchant Center beslemesi:** `color`, `gender`, `age_group`, `material`, `product_highlight`, `product_detail`
  (taban kalınlığı vb.), `size_system`. Kargo ve iade politikası Merchant Center hesabında tanımlanmalı.
- **Yorumlar:** ürün sayfasında sunucuda basılmalı (şu an puan özeti var; yorum metinleri yapay zekâya görünmüyor).
- **Kategori / marka sayfalarına tanıtım metni + SSS alanı** (veritabanında alan yok → eklenmeli).
- **Bilgi bankası:** yazar, son güncelleme tarihi, özet alanı; `Article` yapısal verisi.
- **Görsel alt metni:** "ürün adı" yerine görselin ne gösterdiği ("Dodura mavi-natürel — esnek kauçuk taban bükülüyor").
- **Hukuki sayfalar onaylanınca** site haritasına + dizine.
- **Canlıda:** Google Search Console + **Bing Webmaster Tools** (+ IndexNow), sitemap gönderimi, eski URL → 301 haritası.

---

## 5. Sayfalar ve içerik nasıl olmalı?

Genel kural (araştırmanın özü): **ilk 2–3 cümlede doğrudan cevap**, ardından **sayısal / doğrulanabilir bilgi**,
**kaynak**, **soru-cevap**. Pazarlama dili değil, "ölçülebilir gerçek". Her sayfa tek bir soruya en iyi cevabı versin.

### 5.1 Ürün sayfası şablonu
1. **Özet (2–3 cümle, renk/modele özel):** "Dodura Mavi-Natürel; %100 dana derisi, [X] mm kauçuk tabanlı, sıfır topuk
   farklı yetişkin barefoot ayakkabı. Günlük kullanım ve şehir yürüyüşü için; geniş burun yapısı sayesinde
   parmaklar sıkışmaz."
2. **Teknik tablo (metin olarak):** taban kalınlığı (mm, iç taban dahil/hariç) · topuk farkı (0 mm) · ağırlık (gr, 42 numara)
   · malzeme (dış, astar, iç taban, taban) · kalıp genişliği (dar/normal/geniş) · üretim yeri · numara aralığı.
3. **Numara seçimi:** ayak boyu (mm) → numara tablosu (metin), "alıştığınız numarayı alın", geniş ayak / yüksek
   üst ayak için not. Attipas'ta: ay/yaş aralığı, büyüme payı, "ölçü nasıl alınır".
4. **Kimler için / kimler için değil:** ör. "Barefoot'a yeni geçiyorsanız ilk 2–4 hafta günde birkaç saat" (kaynaklı).
5. **Bakım.**
6. **Bu renge/modele özel 1–2 paragraf** (fotoğraftaki doku, kombin, mevsim) — kopya içeriği kıran kısım.
7. **SSS (4–6 gerçek müşteri sorusu):** "Kışın giyilir mi?", "Islanınca ne olur?", "Ortopedik sorunum var, uygun mu?"
   (→ "hekiminize danışın" + genel bilgi), "Numaram 41,5, hangisini almalıyım?".
8. **Yorumlar** (sunucuda, metinleriyle).

> Dodura'da tüm renkler için ortak teknik bölüm + **renge özel özet ve paragraf** yeterli; 10 ayrı uzun metin gerekmez.

### 5.2 Kategori / marka sayfası
- 80–150 kelime giriş: "Attipas, ilk adım dönemine özel çorap-ayakkabı üreten … markası; YeriHisset Türkiye'de …"
  (kuruluş yılı / ülke gibi bilgiler markanın resmî kaynağından doğrulanarak — internette Kore ve Japonya diye çelişkili).
- Kısa karşılaştırma tablosu (modeller arası fark: taban, dönem, mevsim).
- 3–5 SSS. Ürün listesi altta.

### 5.3 Rehber (bilgi bankası) yazısı
- Başlık = gerçek soru ("Bebeğe ilk ayakkabı ne zaman alınır?").
- **İlk paragraf 40–60 kelimelik doğrudan cevap** (yapay zekânın alıntılayacağı kısım).
- Sayısal bilgi + **kaynak**: ör.
  - 6 ay minimal ayakkabıyla günlük kullanımda ayak kuvveti **%57** arttı (Curtis vd., *Scientific Reports* 2021).
  - Minimal ayakkabıyla yürüme, 8 haftada ayak kası gelişiminde egzersiz kadar etkili (Ridge vd., *MSSE* 2019) —
    geçiş için **günde ~2.500 adımla başlayıp haftalık artırma** önerisi.
  - Ayakkabı giyen çocuklarda düz taban sıklığı %8,6, giymeyenlerde %2,8 (Rao & Joseph, *JBJS* 1992, 2.300 çocuk;
    ilişki, nedensellik değil).
  - Staheli (*Pediatrics* 1991): çocuk ayakkabısı seçiminde "yalınayak modeli" esas alınmalı.
- Yazar / uzman görüşü (fizyoterapist, çocuk ortopedisti ile iş birliği çok değerli), son güncelleme tarihi.
- İlgili ürünlere ve diğer rehberlere iç bağlantı.
- **Sağlık iddiası dikkat:** "tedavi eder", "düzeltir", "iyileştirir" yazılmaz (Reklam Kurulu / sağlık beyanı
  mevzuatı). "Çalışmalar … ilişkisini göstermiştir", "ayağın doğal hareketine alan bırakır" gibi ölçülü dil + kaynak.

### 5.4 Ana sayfa / Hakkımızda — varlık tanımı
Yapay zekânın "YeriHisset nedir?" sorusuna cevap verebileceği net bir paragraf: kim (Kromozom Dış Ticaret, İstanbul),
ne zamandan beri, ne satıyor (Dodura yetişkin, Attipas bebek-çocuk), neden (barefoot felsefesi), kaç müşteri / sipariş
(gerçek sayı varsa), iade güvencesi, iletişim. Her yerde (site, Instagram, pazar yerleri, basın) **aynı tanım**.

---

## 6. İçerik planı (öncelik sırasıyla)

Mevcut 11 yazı güncellenip genişletilecek; eksik konular yeni yazılacak. Her biri gerçek bir aramaya cevap:

| # | Konu | Neden |
|---|---|---|
| 1 | **Barefoot ayakkabı nedir?** (mevcut yazı + `/barefoot-nedir` birleşik, kaynaklı, tanım tablosu) | En çok sorulan; "Türkçe rehber yok" |
| 2 | **Bebeğe / çocuğa ilk adım ayakkabısı nasıl seçilir?** | Attipas'ın ana sorusu; ebeveynler yapay zekâya soruyor |
| 3 | **Bebek ve çocuk ayak ölçüsü nasıl alınır + numara tablosu (mm)** | Sayısal, alıntılanabilir, her satıcıya lazım |
| 4 | **Barefoot'a geçiş: ilk 6 hafta planı** (Ridge vd. adım önerisi) | Sakatlık korkusunu gideren, kaynaklı |
| 5 | **Türkiye'de barefoot ayakkabı nereden alınır? Güvenli alışveriş rehberi** (sahte site uyarısı, iade, şirket bilgisi kontrolü) | Tam boşluk; sahte Vivobarefoot siteleri |
| 6 | **Barefoot ayakkabı ile ortopedik ayakkabı farkı** | Sık karışan kavram (ölçülü sağlık dili) |
| 7 | **Zero drop (sıfır topuk farkı) nedir?** (mevcut yazı genişlet) | Teknik terim sorguları |
| 8 | **Kışın / yağmurda barefoot ayakkabı** | Mevsimsel; Dodura deri avantajı |
| 9 | **Attipas numara rehberi + bakım** (mevcut sayfalar birleşik) | Marka sorguları |
| 10 | **Dodura model ve renk rehberi** | Marka sorguları |
| 11 | **Çocukların ayak gelişimi yaş yaş** (mevcut yazı genişlet, kaynaklı) | Uzun vadeli otorite |
| 12 | **Barefoot ayakkabı SSS** (tek sayfa, 20 soru) | Asistanların sevdiği soru-cevap biçimi |

Sıklık: haftada 1 kaliteli yazı > haftada 5 zayıf yazı. Toplu yapay zekâ üretimi **yapılmamalı** (Google spam politikası).

---

## 7. Site dışı görünürlük

| Kanal | Ne yapılmalı |
|---|---|
| **YouTube** | Kısa Türkçe videolar: "Dodura esneklik testi", "Attipas nasıl giydirilir", "ayak ölçüsü nasıl alınır". Açıklamada siteye bağlantı. Yapay zekâ cevaplarında en çok kaynak gösterilen alan adı. |
| **Instagram** | Mevcut hesap(lar) Organization `sameAs`'e eklenecek; biyografide aynı tanım. |
| **Ekşi Sözlük / Reddit / forumlar** | Gerçek müşteri deneyimlerinin paylaşılmasını teşvik (sipariş sonrası "deneyimini paylaşır mısın"), marka hesabıyla şeffaf cevaplar. Sahte hesap / sahte entry **yok**. |
| **Basın / blog** | Ebeveyn blogları, fizyoterapist/pedagog iş birliği, haber sitelerinde "barefoot trendi" haberlerine uzman görüşü. |
| **Pazar yerleri** | Trendyol / Hepsiburada / Amazon mağaza ve ürün sayfalarında aynı marka tanımı, aynı teknik bilgi (asistanlar pazar yeri sayfalarını da okuyor). |
| **Şikayetvar** | Marka sayfası sahiplenilip cevaplar verilmeli (güven sinyali; sahte sitelerden ayrışma). |
| **Vikipedi (TR)** | "Minimalist ayakkabı" maddesi Türkçe'de yok. Tarafsız, kaynaklı bir madde yapay zekâ bilgisinin temel taşı olur; **ancak çıkar çatışması kuralları gereği markayı/siteyi kaynak göstermeden**, yalnız bilimsel kaynaklarla. |

---

## 8. Ölçüm

- **Aylık soru seti (20 soru):** ChatGPT, Gemini, Google AI Mode, Perplexity, Copilot'a aynı soruları sor; YeriHisset
  anılıyor mu / kaynak gösteriliyor mu tabloya işle. (Ör.: "çocuğuma ilk adım ayakkabısı önerir misin", "Türkiye'de
  barefoot ayakkabı markaları", "Dodura ayakkabı yorumları", "Attipas nereden alınır".)
- **Google Search Console** (AI Overviews tıklamaları "Web" raporunda) + **Bing Webmaster Tools AI Performance**
  (Copilot alıntıları; ChatGPT için dolaylı gösterge).
- **Kendi istatistiğimiz:** ChatGPT bağlantıları `utm_source=chatgpt.com` taşıyor → İstatistikler › kaynak tablosunda
  ayrı görünür. Perplexity / Gemini yönlendirmeleri referrer'dan.

---

## 9. Yapılmaması gerekenler
- Anahtar kelime doldurma (yapay zekâ görünürlüğünü **düşürüyor**).
- Her renk / her soru için toplu, birbirine benzeyen sayfa üretmek (Google "scaled content abuse").
- `llms.txt` gibi tek bir hileye bel bağlamak.
- Sahte yorum, sahte forum hesabı, satın alınmış bahsetme.
- Kanıtsız sağlık vaadi ("halluks valgusu düzeltir", "tedavi eder").

---

## 10. Yol haritası

**Canlıya geçmeden (benden):**
1. ✅ Teknik düzeltmeler (bu tur).
2. `scripts/seo-audit.mjs` sunucuda çalıştırılıp çıktı paylaşılacak → ürün ürün / yazı yazı değişiklik listesi.
3. Ürün yapısal verisi + besleme özellikleri (renk, cinsiyet, yaş grubu, malzeme, öne çıkanlar).
4. Kategori / marka tanıtım + SSS alanları; bilgi bankası yazar / güncelleme / özet alanları; yorumların sunucuda basılması.
5. Eski URL → yeni URL 301 haritası (blog + sayfalar dahil).

**Senden (bilgi):**
- Dodura: taban kalınlığı (mm), 42 numara ağırlık (gr), kalıp genişliği, numara–ayak boyu (mm) tablosu.
- Attipas: her model için yaş/ay aralığı, numara–ayak boyu (mm), ağırlık, malzeme, yıkama talimatı.
- Kuruluş yılı, toplam müşteri / sipariş sayısı (yaklaşık), Instagram ve diğer hesap adresleri.
- En sık gelen 20 müşteri sorusu (mesajlardan / DM'den).

**Canlıdan sonra (1–3 ay):**
- Haftada 1 rehber (bölüm 6 sırasıyla), her ay mevcut 2 yazının güncellenmesi.
- YouTube'da ayda 2 kısa video; sipariş sonrası deneyim paylaşım daveti.
- Search Console + Bing Webmaster + aylık 20 soruluk test.

---

## Kaynaklar
- Aggarwal vd., *GEO: Generative Engine Optimization*, KDD 2024 — https://arxiv.org/abs/2311.09735
- Google, *AI features and your website* — https://developers.google.com/search/docs/appearance/ai-features
- Google, *Optimising your website for generative AI features* (Mayıs 2026; ikincil özet) — https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/575026
- OpenAI, *Overview of OpenAI Crawlers* — https://developers.openai.com/api/docs/bots
- OpenAI ürün keşfi / ACP (ikincil özet) — https://almcorp.com/news/chatgpt-shopping-pulls-product-picks-merchant-feeds/
- Vercel, *The rise of the AI crawler* (JS çalıştırmama) — https://vercel.com/blog/the-rise-of-the-ai-crawler
- llms.txt kullanım verisi (Ahrefs, ikincil) — https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/
- Merchant Center sohbet özellikleri — https://www.productsup.com/blog/google-introduces-six-conversational-attributes-in-merchant-center-here-what-you-need-to-know/
- Bing Webmaster AI Performance raporu — https://www.searchenginejournal.com/bing-webmaster-tools-adds-ai-citation-performance-data/566874/
- Yapay zekâ alıntı kaynakları (YouTube / Reddit payı) — https://llmpulse.ai/data-studies/top-cited-domains
- Curtis vd., *Daily activity in minimal footwear increases foot strength*, Sci Rep 2021 — https://pmc.ncbi.nlm.nih.gov/articles/PMC8452613/
- Ridge vd., *Walking in Minimalist Shoes Is Effective for Strengthening Foot Muscles*, MSSE 2019 — https://pubmed.ncbi.nlm.nih.gov/30113521/
- Rao & Joseph, *The influence of footwear on the prevalence of flat foot*, JBJS Br 1992 — https://pubmed.ncbi.nlm.nih.gov/1624509/
- Staheli, *Shoes for children: a review*, Pediatrics 1991 (özet) — https://www.hmpgloballearningnetwork.com/site/podiatry/blogged/how-shoe-choices-children-can-affect-foot-development
