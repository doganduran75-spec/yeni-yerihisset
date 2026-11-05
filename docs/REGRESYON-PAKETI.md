# Regresyon Paketi — YeriHisset

Amaç: Her geliştirmeden sonra "daha önce çalışan bir şey bozuldu mu?" sorusunu **tam test yapmadan**
cevaplamak. Üç katman var; sıkça yapılan kısım otomatik, elle yapılanlar kısa tutuldu.

| Katman | Ne zaman | Süre | Kim |
|---|---|---|---|
| **1. Otomatik kontrol** | Her deploy'un sonunda kendiliğinden | ~1-2 dk | Sunucu |
| **2. Kısa tur** | Her geliştirmeden sonra (deploy bitince) | ~10 dk | Sen (telefonla) |
| **3. Tam tur** | Canlıya geçmeden önce + büyük değişikliklerden sonra | ~40 dk | Sen |

---

## 1. Otomatik kontrol (`scripts/regression.mjs`)

`bash scripts/deploy.sh` bitince kendiliğinden çalışır. Elle çalıştırmak için:

```bash
cd /opt/yerihisset-app && node scripts/regression.mjs
```

Canlıya geçiş günü (e-posta kilidi kapalı, iyzico canlı, arama motoru engeli kalkmış olmalı):

```bash
node scripts/regression.mjs --canli
```

**Çıktı:** her bölüm tek satır. Sorun yoksa `PASS`; varsa ✗ HATA / ! uyarı, açıklamasıyla.
En altta `SONUÇ: ✓ PASS` ya da `✗ N HATA`. **HATA varsa çıktıyı Claude'a ilet.** Uyarılar acil değildir.

Acele varsa yalnız duman kontrolleri (fonksiyonel senaryolar atlanır):

```bash
node scripts/regression.mjs --hizli
```

### 1a. Duman kontrolleri — her şey yerinde mi (yalnız okur)
- **Veritabanı güncellemeleri:** her migration uygulanmış mı (unutulan migration'ı yakalar).
- **Sayfalar:** 25+ müşteri ve admin sayfası açılıyor mu, hata metni var mı, 3 sn'den yavaş mı; gerçek bir ürün mağazada listeleniyor mu; olmayan sayfa 404 mü; ana sayfada prensip metni (panelden), kategori kutuları segment mağazasına bağlı ve fiyat aralığı gösteriyor, masaüstünde Popüler Modeller yok, ilk prensip görseli ve yazı tipi dosyaları açılıyor.
- **Uç noktalar ve yetki:** cron'lar şifresiz çalışmıyor, admin uçları girişsiz çalışmıyor, bot koruması devrede, kart ödeme ucu yanıt veriyor.
- **Veri güvenliği:** dışarıdan (anon anahtarla) üye e-postası/telefonu, gizli ayarlar, siparişler okunamıyor; sahte sipariş eklenemiyor.
- **Veri tutarlılığı:** eksi stok, kategorisiz/görselsiz/SKU'suz ürün, ürünsüz sipariş, süresi dolmuş ödenmemiş sipariş, bozuk bilgi bankası adresi, aktif kargo yöntemi, pazaryeri ve e-posta kuyruğu hataları, aynı pazaryeri kodunun (barkod / satıcı kodu) birden çok varyantta olması.
- **Beden tablosu:** ölçü tabloları okunabiliyor ama dışarıdan değiştirilemiyor; aralıklar geçerli ve çakışmasız; tablolu markanın ürün sayfasında "Numaramı bul" var.
- **Üyelik:** 'Üye' rolü yalnız şifreli + e-postası doğrulanmış hesaplarda (model: `docs/UYELIK-MODELI.md`).
- **Ayarlar ve ortam:** SMTP, iletişim e-postası (yönetici bildirimleri buraya gider), havale bilgisi, Google Analytics, site adresi, CRON_SECRET, yönetici sayısı (`--canli` ile: e-posta kilidi, iyzico, arama motoru engeli).
- **Ürün beslemesi ve reklam etiketleri:** Google/Meta katalog beslemesi açılıyor, ürün sayısı ve fiyatı veritabanıyla aynı, numaralar `size` alanında, reklam bağlantısı (`?variant=`) çalışıyor, Meta Pixel onaysız yüklenmiyor, Conversions API anahtarı dışarıya kapalı (`--canli`: test olay kodu dolu → HATA).
- **Veritabanı güvenliği (her deploy):** RLS kapalı tablo, girişsiz yazma, herkesin her satırı değiştirebildiği kural, kişisel veri tablosunda herkese açık okuma, üyenin rol alanını değiştirmesi, gizli ayarlar, dosya deposunda girişsiz yazma, girişsiz çağrılabilen yetkili fonksiyonlar (`scripts/regression/05-veritabani-guvenligi.mjs`).
- **SEO / yapay zekâ görünürlüğü:** eğitim ve ürün sayfası kendi canonical'ı, ürün meta açıklaması ≤160, Product yapısal verisi, ürün içeriği JavaScript'siz HTML'de, OnlineStore + arama yapısal verisi, site haritasında kategori/rehber; `--canli`: robots.txt tarayıcılara açık. İçerik denetimi ayrı: `node scripts/seo-audit.mjs`.
- **İletişim › WhatsApp:** numara girilmişse ve düğme açıksa İletişim'de wa.me bağlantısı; kapalıysa yok; "yalnız WhatsApp" işaretliyse künyede yazar. MIG 20261167. Elle: düğme mobilde WhatsApp'ı, bilgisayarda WhatsApp Web'i hazır mesajla açar.
- **Marka / kategori sayfa metni:** aktif ürünü olan marka ya da kategoride tanıtım metni veya SSS boşsa uyarı (ilk taslak: scripts/content/20261105-marka-kategori-metinleri.sql).
- **Sunucu kaynak uyarıları:** disk %80 (kırmızı %90), bellek %85 30 dk (kırmızı %95), işlemci %90 30 dk (kırmızı %200; dağıtımda susar) — sarılar da Telegram + e-posta (alert). Regresyon son çalıştırmada bu kontrollerin sarısının işaretli olduğunu doğrular. Elle: Telegram › Sunucu uyarısı konusu açık olmalı.
- **Hukuki metinler:** künye, ön bilgilendirme, çerez tercih bağlantısı; `--canli` ile taslak / eksik künye HATA.
- **Sunucu güncellemesi (Ne yapmalıyım?):** sarı / kırmızı sunucu kontrolünün altında adım adım yol ve kopyalanabilir komut; güncellemede `scripts/server-update.sh` (yükler, site / veritabanını denetler, tek SONUÇ satırı: TAMAM / YENİDEN BAŞLATMA GEREKİYOR / HATA) ve `--reboot` (Docker / konteyner yeniden başlama kuralı / pm2 açılış / Caddy denetimi, pm2 açılışı kurulu değilse kurar, hazır değilse yeniden başlatmaz). Regresyon betik + kart eşleşmesini denetler. Elle: uyarı çıkınca karttaki adımları izle.
- **Pano / Sistem:** sistem durumu ucu girişsiz açılmıyor, müşteri hata kayıtları ve e-posta sağlık kaydı dışarıya kapalı, `/admin/system` açılıyor.
- **Arka plan işleri:** gece yedeği (<26 sa), sunucu sağlık kontrolü, pazaryeri senkronu (açıksa).

### 1b. Fonksiyonel senaryolar — iş akışları doğru çalışıyor mu (`scripts/regression/`)

Gerçek uçlara gerçek istek atar, sonucu veritabanında doğrular. Kendi test verisini kurar ve
sonunda siler: pasif `REGRESYON-TEST` ürünleri (mağazada görünmez, pazaryerine gitmez), `RGT…`
kuponları, `@yerihisset.test` üyeleri (bu adreslere e-posta **hiç** gitmez, yöneticiye "yeni sipariş"
bildirimi düşmez). Tek iz: sipariş numaraları birkaç numara atlar.

| Bölüm | Neyi kanıtlar |
|---|---|
| Sipariş: fiyat, stok, kargo, hediye | İstekte fiyat değiştirilse de veritabanı fiyatı alınır; tutar = ürün + kargo; stok düşer; stoktan fazlası reddedilir; hediye 0 TL ve stoğu düşer; tetikleyicisiz hediye reddedilir |
| Kargo yöntemi (varsayılan) | Üye kargo ayarı değiştiremez; pasif yöntem varsayılan yapılamaz; sepet/ödeme listesi panel sırasıyla, üye sırayı değiştiremez; pasif yöntem müşteriye görünmez (duman: tam bir varsayılan var ve aktif) |
| Kupon kuralları | Yüzde / sabit / ücretsiz kargo: sepetteki indirim = siparişteki indirim, kullanım sayılır. Alt limit, süresi dolmuş, başlamamış, başkasına özel, olmayan kupon ve kişi başı limit **hem sepette hem doğrudan sipariş isteğinde** reddedilir |
| Kupon kapsamı + birden çok kupon | Marka / kategoriye bağlı kupon kendi ürününde geçerli, başkasında sepette ve siparişte reddedilir; iki kupon birlikte uygulanır (%10 + 100 TL = 200), her biri `order_coupons`'ta ayrı satır ve sayılır; ödenmiş sipariş tam iade edilince iki kuponun kullanımı da geri verilir |
| Kargo etiketi | Üye etiket verisi alamaz (403); kargo kodu olan siparişin etiketi adres + paket içeriğiyle gelir, kodsuz sipariş atlanır; yazdırılan kod siparişe kaydedilir, kod değişince fark edilir ('etiketi yeniden yazdır'); boyut ayarı okunur, geçersiz boyut reddedilir |
| Paket hazır → kurye aldı | Üye 'Paket hazır' diyemez; ödemesi alınmamış site siparişi paketlenemez; paket hazır = kargo bekliyor (Kargoda değil, e-posta yok); 'Kurye aldı' → Kargoda; ikinci kez işlenmez; eski siteden aktarılan sipariş de paketlenip kuryeye verilir (paketlemede fatura yok); Hepsiburada paketleme yalnız Hepsiburada siparişinde; paket desisi ayarı okunur, geçersiz değer reddedilir |
| Trendyol iadesi (kısmi) | Üye işleyemez; Trendyol'da onaylanmış talep sitede işlenir: 2 adetten 1'i iade gelir, yalnız o ürünün tutarı cirodan düşer (kısmi iade); talep 'işlendi' olur; ikinci kez işlenmez; satış özetinde 'İade olan satış' (kanal kırılımı); elle: listede Trendyol iadesi 'İade bekleniyor' rozeti + 'İade bekleniyor' / 'Yolda olan iade' süzgecinde görünür; sipariş içeriğinde iade gelen satırda 'İade edildi' ('1/2 iade edildi') |
| Hepsiburada iadesi (elle) | 'İade geldi' stoğa eklemeden: ödeme 'iade edildi', iade tutarı = sipariş tutarı (cirodan düşer), kargo 'iade geldi', stok değişmez; üye işaretleyemez |
| Otomatik fatura (site) | Müşteri 'oldu' deyince / değişim tamamlanınca fatura kendiliğinden kesilir — test siparişinde (@….test üye) Paraşüt'e GİTMEZ (gerçek fatura kesilmez) |
| CRM kampanyası | Üye kitleyi göremez; kategoriden alışveriş yapan üye kitlede (son alışveriş + sipariş sayısı), 'hiç almamış' süzgeci onu getirmez; kupon kişiye 7 gün süreyle (atandığı andan) tanımlanır, sepette geçerli; 3 gün kala hatırlatma listesinde; kişiye özel süresi dolunca reddedilir; raporda görünür; kupon kodu tahmin edilemez biçimde (YH-XXXX-XXXX) |
| Kuponu hesabına ekle | Üye kampanya bağlantısındaki kuponu tek tıkla ekler (süre eklendiği andan, ikinci eklemede uzamaz); formsuz (bot) istekle hesap açılmaz; misafir e-postasıyla şifresiz hesap açılır ve kupon eklenir; olmayan kampanya reddedilir |
| E-posta denemesi | Üye deneme yapamaz; liste gelir, alıcı yöneticinin kendisi; deneme siparişin verisiyle hazırlanır, müşterinin bildirim kaydına yazılmaz; olmayan sipariş no reddedilir |
| SSH giriş uyarısı onayı | Üye kapatamaz; yalnız 'yeni IP'den SSH girişi' uyarısı kapatılabilir; 'Evet, bendim' kimin onayladığıyla kaydedilir |
| Biz (Hakkımızda) sayfası | /hakkimizda açılıyor; bölümlü yeni sayfa (hikâye panelden, ilkeler, 'Sana sözümüz', markalar, iki mağaza) — duman testinde 'Sana sözümüz' aranır. Sekmeli "Ayakkabılarımız hakkında" (Ayarlar › Sayfalar, her H2 bir sekme): taslakken görünmez; yayındayken köşeli parantezli doldurulmamış not kalmamalı (duman). Elle: taslağı kaldır → Hakkımızda'da sekmeler arası geçiş, mobilde yatay kaydırma |
| Misafir siparişi | Bot isteği reddedilir; misafir siparişi açılır; sonuç sayfası verisi (havale bekliyor); e-posta kontrolü; üyenin e-postasıyla misafir siparişi reddedilir |
| Yetki | Üye yönetici işlemi / silme yapamaz, başkasının siparişini göremez, kendi siparişini "ödendi" yapamaz |
| Ödeme onayı, iade, iptal | Ödenmemiş iptal (stok geri, fatura "gerekmiyor"); yönetici "Ödendi" → üye **Müşteri** rolü; ürün gelmeden tek başına ücret iadesi reddedilir (sıra kuralı); ödenmiş sipariş iptali (kalan iade, stok geri); çift iptal reddedilir |
| Kargo → teslim → iade al | "Kargoya Verildi (elle)" ve "Teslim Edildi"; kargolanmış sipariş iptal edilemez; kargolanmamışta "İade al" reddedilir; iade gelen ürün stoğa, ücret iadesi kaydı, aynı ürün iki kez stoğa eklenmez; iade geldikten sonra kalan tutar iade edilebilir, onay kutusu şart. Elle: İade al / İptal / Ücret iadesi penceresi sipariş detayının üstünde tam görünür (detay kaydırılmış olsa da); işlem bitip detay kapanınca süzgeçteki liste güncellenir ('Yolda olan iade'den düşer) |
| Satış sonrası: oldu / değişim / iade | Teslim edilince "müşteri deniyor"; imzalı müşteri bağlantısı (değiştirilmiş reddedilir), Hesabım'dan yalnız kendi siparişi; "oldu" bir kez; değişim döngüsü (talep → alternatif gönder, stok düşer, ek ücret yok → teslim → müşteri seçer → kod → tutulmayan gelir, stoğa eklenir, para iadesi yok → sipariş "oldu"); iade: havalede IBAN şart ve geçerli olmalı, IBAN müşteriye açık dönmez, yönetici kargo yolunu değiştirip kod gönderebilir, iade gelince talep kapanır ve ödeme iade edilir; üye yönetici talep işlemi yapamaz |
| Satış ortaklığı | Ortak linkiyle sipariş ortağa yazılır; ortağın kendi alışverişi, askıya alınmış ortak ve olmayan kod sayılmaz (sipariş yine verilir) |
| Reklamdan gelen sipariş | Instagram reklamı kaynağı siparişe yazılır; test siparişi Meta'ya gönderilmez ve geçici IP/tarayıcı bilgisi silinir; çerez onayı yoksa Meta bilgisi hiç saklanmaz; bozuk bilgi siparişi bozmaz |
| Üyelik durumu ve e-posta doğrulama | Misafir ve doğrulanmamış hesap "Üye" sayılmaz (seviye 0); sipariş e-postasında doğrulama bağlantısı üretilir; yeniden gönderim, eski bağlantı geçersiz, yenisiyle doğrulama → Üye + Müşteri seviyesi + hoş geldin kuponları; Fırsat kuponu ve iş ortaklığı doğrulamadan alınamaz; üst seviye fırsatı doğrudan istekle alınamaz; test fırsatı sitede görünmez; başkasının siparişi için mesaj e-postası tetiklenemez |
| Kampanya e-postası izni | Varsayılan izinsiz; girişsiz/bağlantısız izin verilemez; Hesabım'dan izin + ispat kaydı; tarayıcıdan doğrudan değiştirilemez; e-posta bağlantısıyla durum okuma ve çıkış; değiştirilmiş bağlantı reddedilir; ödeme sayfasındaki kutu üye ve misafirde izni kaydeder, işaretsiz sipariş izni geri almaz |
| Pano: sistem durumu | Yönetici 7 kutuyu (sunucu, entegrasyon, e-posta, yedek, saldırı, yetkisiz giriş, hata alan müşteriler) görür, üye göremez / deneme e-postası gönderemez; ödeme sayfası hatası kaydedilir |
| Bugünün işleri: sonuçsuz arama | Aramalar adetle listelenir, bot aramaları sayılmaz, dışarıya / üyeye kapalı; Sil ve Talebe ekle listeden kaldırır; silinen terim yeniden aranınca geri gelir |
| Düzenlenebilir sayfalar | Yönetici kaydeder; taslak dışarıya/üyeye kapalı; üye yayına alamaz; yayındaki herkese açık. Duman: hukuki sayfalar + Hakkımızda'da yer tutucu doldurulmamış kalmıyor, sayfa metinleri dışarıdan değiştirilemiyor |
| Çerez onayı | Mod okunuyor; izinli ziyaret IP ile kaydediliyor; Reddet → IP siliniyor, seçim "red", onay defterinde; izinsiz ziyaret kimliksiz sayılıyor; onay defteri ve sayaç dışarıya kapalı |
| Pazaryeri stok görevi | Stok 0'a düşünce entegrasyonu açık kanala görev açılmaz, entegrasyonu olmayan aktif kanala açılır |
| Satış kanalları bağımsız | Sitede kapalı numara sipariş edilemez ama Trendyol'a gerçek stok gider; ürünü sitede kapalıyken açık numarası da (eski sepet) satılmaz; üye açamaz; Trendyol'da "Kapalı" → Trendyol'a 0, sitede satış sürer, açınca gerçek stok; Amazon satış fiyatı kuyruğa girer (geri alınan işlem) |
| Kargonomi panel gönderisi | Entegrasyon dışında (Kargonomi panelinden) açılmış gönderi, siparişteki takip kodu / ref no ile eşleşir (saatte bir, 7. dakika); eşleşince sipariş saatlik durum sorgusuna girer, teslimde Teslim edildi + e-posta. Elle: siparişe "Kargonomi gönderisi bağlandı" notu düşer |
| Kargonomi kodu | Firma siparişi oluşunca (takip kodu henüz yokken) entegrasyon kodu / ref no siparişe yazılır; firmanın takip kodu gelince etiket kodu değişmez, müşteri takip numarası takip kodu olur. Elle: ilk gönderide siparişe düşen "Kargonomi kodları" notu hangi alanın dolu olduğunu gösterir |
| Kargonomi: yetki ve ödemesiz sipariş | Girişsiz 401, üye 403, geçersiz işlem 400; ödemesi alınmamış sipariş için Kargonomi'de gönderi açılmaz (teklif → firma seçimi → kod bekleme akışı gerçek API'yi çağırmadan). Elle: Kargonomi'de silinmiş / iptal taslak → "Teklifleri yenile" yeni taslak açar; onayda taslak bulunamazsa kayıt temizlenir ve "Teklifleri yenile" denir (422 "Gönderi ID geçersiz" çıkmaz); taslak duruyorsa hata gönderinin Kargonomi durumunu da yazar; onay hata döndürse de Kargonomi'de gönderi oluşmuşsa sipariş onaylı sayılır (not düşer); Kargonomi'de onaylanmış gönderide "Vazgeç" / "Teklifleri yenile" silmez, siparişi onaylı duruma alır; firma seçimi / taslak silme / iptal talebi siparişe not düşer; aynı anda iki onay isteği tek onay olur |
| Paraşüt: yetki ve gizli bilgiler | Üye fatura kesemez; ödemesiz siparişe fatura açılmaz (Paraşüt'e gitmez); faturasız siparişte PDF yok; girişsiz 401, üye 403, yönetici durumu görür (gizli bilgi dönmez); Client Secret dışarıdan, oturum anahtarı yöneticinin tarayıcısından bile okunamaz; kanal ayarlarını yalnız yönetici görür; üye kargo VKN'si ekleyemez |
| Google Merchant API: kuyruk ve yetki | Girişsiz 401, üye 403, yönetici durumu anahtarsız görür; servis hesabı anahtarı dışarıdan okunamaz; API açıkken numara stoğu değişince ürün kuyruğa girer, kapalıyken girmez (geri alınan işlem) |
| Üye temizliği: misafir süzgeci ve silme | Misafir + siparişsiz süzgeci çalışır; siparişi olan üye "siparişi yok"a girmez; üye silemez; yönetici siparişsiz misafiri siler (hesap + profil); siparişi olan ve yönetici hesaplar silinmez |
| Yorum isteme + seni özledik | Yorum bağlantısı giriş gerektirmeden soruları getirir; geçersiz bağlantı 404; yorum genel puan + cevaplarla onay bekler; ikinci yorum yazılmaz; uzun süre gelmeyip dönen üye işaretlenir (geri alınan işlem) |
| Deneme e-postası → mail-tester | Yönetici deneme e-postasını mail-tester.com adresine yönlendirebilir; başka adres reddedilir (gönderilmeden kontrol). Elle: Pano › Sistem › E-posta kutusuna mail-tester adresini yaz → Deneme e-postası gönder → mail-tester puanı |
| Ürünü yayına alma | Fiyatlı numaralar kapalıyken ürün yayına alınamaz; numara açılınca alınır. Ürün formu numaraları önce, "Satışa açık"ı en son kaydeder (kapalı ürünü numaralarını açıp yayına alırken "fiyat yok" hatası çıkmaz). Elle: hiç numara açık değilse uyarı "Hiçbir numara açık değil" der |
| Paraşüt yeni kimlik (id.parasut.com) | Üye bağlantı başlatamaz; kayıtlı olmayan adresten (dev / www / yerihisset.com dışı) giriş adresi üretilmez; yanlış state'li dönüş reddedilir ve mevcut bağlantı değişmez; yeni Client Secret dışarıdan okunamaz. MIG 20261168. Elle: Ayarlar › Paraşüt › yeni Client ID / Secret → "Paraşüt ile bağlan" → Paraşüt onayı → /admin/parasut/baglan "Paraşüt bağlandı (yeni altyapı)"; eski bağlantı yeniden bağlanana kadar çalışır; oturum 3 günde bir yenilenir; koparsa Telegram (entegrasyon hatası) + panelde kırmızı not |
| Paraşüt iade faturası | Üye kesemez; satış faturası olmayan siparişte Paraşüt'e gidilmez; iade faturası adımında önce Paraşüt düğmesi, sonra elle işaret. MIG 20261166. Elle (ilk gerçek iade): siparişte "İade faturasını kes (Paraşüt)" → Paraşüt'te "İade Faturası": aynı müşteri + kategori, yalnız iade gelen kalemler satıştaki fiyat / KDV ile, giriş deposu, ödendi (kanal hesabı); sipariş "İade faturası kesildi", panodaki satırdan düşer. Asıl faturaya bağlı değil ("İade edilen faturaya git" yok). Satış faturası `include=contact,category,details…` ile okunur (Paraşüt ilişki kimliğini yalnız include'da verir; yoksa "müşteri yok" hatası) |
| Pano: İade faturası kesilecek | Sırada yalnız iade faturası olan sipariş (Trendyol iadesi işlendi / site iadesi + ücret iadesi, faturalı) ayrı satırda sayılır, "Bekleyen sipariş işi"nde sayılmaz; "İade faturası kesildi" deyince düşer. Elle: satıra tıkla → sipariş listesi "İade faturası kesilecek" filtresiyle açılır |
| Talep & Geri Bildirim: Planla + silme | Yönetici "Planla" deyince talep Planlandı sekmesine geçer, panodaki Talep sayısından düşer; üye planlayamaz. Üye talep notunu silemez; yönetici siler. Elle: Bekleyen / Planlandı sekmeleri, Planlandı'da "Geri Al"; çöp kutusu "silinsin mi?" diye sorar |
| Eşleşmeyen eski ürünler | Ekran ve /api/admin/legacy-match kaldırıldı (kullanıcı 2026-11-03) — 404 |
| Ürün metinleri | Aktif ürünün Kısa / Detaylı Açıklamasında `[DOLDUR: …]` taslak notu kalmasın (docs/RENK-PARAGRAFLARI.md) — uyarı |
| Basit Kargo | Girişsiz / üye ayara erişemez; API token ve webhook anahtarı yanıtta yok, dışarıdan / üyeden okunamaz, genel ayar yanıtında yok; webhook anahtarsız / yanlış anahtarla 401; Kargoya ver etkin sağlayıcıyı + hazır sağlayıcı listesini gösterir (üye çağıramaz); Kargonomi bağlantı denemesi yalnız yönetici, token yanıtta yok; durum sorgusu olmayan siparişte 404. Entegrasyon kodlu ödenmiş siparişte etiket basılınca kendiliğinden Kargo hazırlandı (ödenmemişte değil; eski siteden aktarılmış siparişte de). Elle: aktarılmış siparişte Kargoya ver kullanıldıysa sipariş detayında Kargo etiketi kutusu görünür, toplu etiket / kurye listelerine girer. Entegrasyon kodlu paket hazır olunca yöneticiden iş beklenmez (bekleyen işlerde yok, Kurye aldı düğmesi yok; 2 gün geçerse bekleyen işe düşer ve Kurye aldı yedek olarak çıkar); elle kodda Kurye aldı durur. Pano bekleyen işleri sipariş listesiyle aynı alanlardan hesaplar (aynı sayı). Elle: Sevkiyat kutusu ve listede paket hazır sipariş "Kargo hazırlandı" görünür; toplu Kurye aldı listesinde entegrasyon kodlu paket yok. Elle: etiket kutusundaki teslimat notu yazıldıysa etiketin altına 2 kat büyük basılır (kaydedilmez; boşsa not kutusu çıkmaz). Elle (Kargonomi ilk gönderi): kod gelir → etiket (Kargo hazırlandı kendiliğinden) → teslim sürecinde (saatlik sorgu) Kargoda + e-posta → teslimde Teslim edildi + e-posta; teslim edilmiş sipariş sorgulanmaz; teslim edilemedi / geri geliyor / kayıp → siparişe hata; Basit Kargo gönderisi olmayan siparişte resmî etiket yok; siparişte sağlayıcı yalnız kargonomi / basitkargo. Elle (token girilince): Ayarlar › Basit Kargo hesap durumu + bakiye + adres; siparişte Kargoya ver → fiyatlar → firma seç → kod hemen → Basit Kargo etiketi yazdır → kurye alınca / teslimde sipariş kendiliğinden güncellenir (webhook ya da saatlik sorgu); iptal (kurye almadan); teslim edilmiş siparişte talepten iade kodu |
| Telegram bildirimleri | Girişsiz / üye ayara erişemez; bot token yanıtta yok, dışarıdan / üyeden okunamaz; kuyruk üyeye kapalı; havale siparişi kuyruğa girer, kart siparişi ödeme gelince girer, eski siteden aktarılan girmez; mesaj önizlemesinde sipariş no + ürün + stok kaçtan kaça; test siparişi gönderilmez; müşteri mesajı / iade-değişim talebi / stok talebi kuyruğa girer (yönetici yanıtı girmez); günlük özet hazırlanır, üye gönderemez. Elle (Telegram açıkken): gerçek siparişte mesaj ~20 sn içinde gelir, entegrasyon satırları gönderim bitince güncellenir |
| Model (kategorinin alt kırılımı) | Üye model ekleyemez; yönetici kategoriye model ekler (01); aynı kategoride aynı kod ikinci kez eklenmez; modeller girişsize ve üyeye görünmez; ürünün kategorisi değişince / başka kategorinin modeli seçilince model boşalır; model silinince ürün modelsiz kalır. Elle: Ayarlar › Varyasyonlar › Modeller, ürün formunda Model seçimi, Stok Yönetimi'nde model süzgeci + numara toplamları |
| Stok talebi 'Model · Numara' + akış | Stok yokken talep Bekleyenler'de; kendi numarası ya da ("her renk" talebinde) başka rengin aynı numarası stoğa girince Manuel bildirim'e düşer; "stok geldi" listesi girişsize kapalı, üye yalnız kendi kaydını görür. "Her renk" talebi modelin başka renginde aynı numara stoğa girince haber listesine girer; normal talep girmez; farklı numara girmez; kendi ürünü gelince ikisi de girer; model kaldırılınca eşleşme biter; eşleştirme fonksiyonu dışarıdan çağrılamaz (geri alınan işlem). Elle: Stok Bildirimleri › Manuel Ekle › modelli ürünün numarasını seç → "Modelin her renginde" kutusu; listede mor "· her renk" etiketi, başka renkte stok varsa "Başka renkte stokta: …". Panodaki "Stok geldi — elden haber verilecek" tıklanınca Manuel bildirim sekmesi açılır; "Haber Verdim" → Bildirildi'ye geçer, panodan düşer |
| Varyasyon değeri taşıma | Üye taşıyamaz; yönetici değeri başka gruba taşır (aynı kimlik — ürünler bağlı kalır) |
| Ödeme alınmadan sevkiyat başlamıyor | Ödemesi bekleyen site siparişi Hazırlanıyor / Kargoda yapılamaz (veritabanı kuralı); Ödeme alındı + Hazırlanıyor birlikte yapılabilir |
| Kategori sayfa metni | Yönetici tanıtım + SSS kaydeder, üye değiştiremez, sayfada ve FAQPage yapısal verisinde görünür. Duman: ana rehber, mağaza H1, eski yazı yönlendirmesi, beslemede renk / yaş grubu |
| Kampanya e-postası kuralı | İzinsiz üyeye kuyruktaki kampanya gitmiyor (skipped); bülten aboneliği izin; abonelikten çık bağlantısı (kişi) çalışıyor. Duman: Google Analytics onaysız yüklenmiyor; profillerde TC kimlik yok |
| Stok bildirimi | Bot kaydı reddedilir; misafir kaydı + Kişiler; çift kayıt olmaz; üye kaydı; üye "stok geldi" gönderemez; gönderilemeyen bildirim "bekliyor" kalır |
| Silme ve süre dolumu | "Siparişi sil" (stok geri, kupon sayısı düzelir); 24 saat ödenmeyen havale siparişi iptal olur, stok geri |

Raporlar: `/opt/yerihisset-app/.regression-report/`

---

## 2. Kısa tur (~10 dk, telefonla) — her geliştirmeden sonra

Sitenin en çok kullanılan yolu. Hepsi tamamsa yazmana gerek yok; sorun olursa numarasıyla yaz.
Kullanacağın e-posta **izinli listede** olmalı (Ayarlar › Genel › E-posta Kilidi).

| # | Yap | Beklenen |
|---|---|---|
| K1 | Telefonla ana sayfa → Mağaza | Ürünler 2 sütun, filtreler tek satır, sayfa yana kaymıyor |
| K2 | Bir ürüne gir → numara seç → Sepete ekle | "Sepete eklendi" bildirimi ekrana sığıyor; hediye kuralı varsa hediye de sepette |
| K3 | Sepet → Ödeme → misafir olarak bilgileri gir → Havale → Siparişi tamamla | `/siparis-tamam` sayfası: sipariş no, tutar, banka bilgisi |
| K4 | E-posta kutusu | Sipariş e-postası (banka bilgili) + hesap aktivasyonu e-postası geldi |
| K5 | Admin › Siparişler → bu sipariş | Listede en üstte; detayda ürünler doğru; stok düşmüş |
| K6 | Detayın en altında **Siparişi sil** | Sipariş kalktı, stok geri geldi |
| K7 | Telefonla `ana sayfa adresi + ?hikaye=1` | Tam ekran prensip hikâyesi: turuncu çubuklar ilerliyor, dokununca geçiyor, basılı tutunca duruyor; "Alışverişe geç" → Yetişkin / İlkadım seçimi. Ana sayfada prensip kartları kayıyor, kategori kutusu doğru mağazaya gidiyor |

---

## 3. Tam tur (~40 dk) — canlıya geçmeden önce ve büyük değişikliklerden sonra

Kısa turu yap, ardından:

| # | Konu | Yap | Beklenen |
|---|---|---|---|
| T1 | Üye siparişi + kupon | Giriş yap → sepette "Kuponların"dan kupon uygula → havale | İndirim düştü; admin'de kupon satırı |
| T2 | Ödeme onayı | Admin'de T1 siparişinin ödemesini "Ödendi" yap | Üyede **Müşteri** rozeti + etiketler; ciro arttı |
| T3 | İptal | T1'i "Siparişi iptal et" (iade onay kutusu) | Ödeme "İade edildi", stok geri; e-posta "banka hesabına iade edildi" |
| T4 | İade e-postası | Bir siparişin iadesinde müşteriye giden e-posta | Tutar ve yöntem doğru (akışın kendisi otomatik testte) |
| T5 | Şifre | Çıkış → "Şifremi unuttum" → e-postadaki bağlantı → yeni şifre | Giriş oldu; admin'de e-posta "doğrulandı" |
| T6 | Hediye | Hediyeli ürünü sepete ekle → sayfayı yenile → hediyeyi kaldır | Hediye sepet listesinde ürünlerin altında, ürün kartı boyutunda; otomatik geldi, kaybolmadı, "Sana hediye" olarak geri döndü |
| T7 | Stok bildirimi e-postaları | Tükenmiş numarada "Stoğa girince haber ver" → stok gir → "Stok geldi" gönder | Onay ve "stok geldi" e-postaları geldi, görünüm düzgün (kayıt akışı otomatik testte) |
| T8 | Satış ortağı linki + hakediş | Ortağın linkini gizli pencerede aç → sipariş ver; dönem sonunda Admin › Satış ortakları › Hakediş › Hesaba İşle | Link kodu sepete taşınıyor; ortağa "hakedişin hesabına yüklendi" e-postası (tutar + bakiye) |
| T9 | Pazaryeri (açıksa) | Bir ürünün stoğunu değiştir | Senkron geçmişinde Trendyol/Hepsiburada ✓ |
| T10 | İçerik | Bilgi bankası makalesi, Fırsatlar, İletişim, sözleşmeler (telefonda) | Açılıyor, okunuyor |
| T12 | Meta reklamı (canlıda) | Çerezde "Kabul Et" → bir ürüne bak, sepete ekle, sipariş ver; Events Manager › Test olayları | ViewContent, AddToCart, InitiateCheckout, Purchase (tarayıcı + sunucu, tek satış) görünüyor |
| T14 | Beden tablosu / Numaramı bul (telefonla) | Dodura ürününde 25,3 yaz → 40; Attipas ürününde 107 yaz → M (büyüme payı); önerilen numarayı seç | Öneri doğru, stok durumu doğru, numara seçildi |
| T15 | Mobil karşılama videosu (telefonla) | Ayarlar › Genel › Video yükle ile video seç (önizleme görünür); telefonda ana sayfayı `?intro=1` ile aç; sonra normal aç | Sayfa önce geliyor, video tam ekran oynuyor, bitince / "Geç" ile ana sayfa kartları; ikinci girişte çıkmıyor |
| T16 | Pano tek ekran (bilgisayarda) | Yönetim › Pano'yu aç; bir kutuya tıkla | Sistem şeridi + satış + bugünün işleri + bekleyen işler kaydırmadan görünüyor; kutu Sistem sayfasında ilgili bölüme götürüyor |
| T17 | E-posta gerçekten gidiyor mu | Sistem › E-posta › “Deneme e-postası gönder” | Yönetici adresine deneme e-postası geldi (spam klasörüne de bak) |
| T13 | Satış sonrası e-postaları (canlı öncesi metin kontrolü) | Bir siparişi "Teslim edildi" yap → e-posta; değişim / iade talebi aç → yöneticiye bildirim; kod gönder → müşteri e-postası | "Acele yok, evde dene" kutusu ve düğmeler; kod e-postası UPS uyarısıyla; metinler onaylandı |
| T11 | Kart (iyzico açıksa) | Test kartıyla ödeme; başarısız kart; iade | Başarı sayfası; hata mesajı; iyzico iadesi |

Tam tur bitince test siparişlerini **Siparişi sil** ile temizle.

---

## Yeni bir geliştirme teste nasıl dahil edilir (kural)

Her geliştirme **aynı commit'te** teste eklenir; Claude bunu kendiliğinden yapar ve teslim
mesajında "**Regresyona eklenen:** …" satırıyla söyler. Neyin nereye ekleneceği:

| Geliştirme | Teste eklenen |
|---|---|
| Yeni migration | 1a › Veritabanı güncellemeleri listesine bir işaret (tablo/kolon/fonksiyon var mı) |
| Yeni sayfa | 1a › Sayfalar listesine adres |
| Yeni API ucu | Yetki: girişsiz / yetkisiz → 401/403 (1a) ve **asıl işi** yapan senaryo (1b) |
| İş kuralı (fiyat, kupon, stok, kargo, hediye, kredi, iade…) | 1b › ilgili modüle senaryo: hem **izin verilen** hem **reddedilen** durum, sonuç veritabanında doğrulanır |
| Hata düzeltmesi | Hatayı yeniden üreten senaryo (bir daha geri gelirse yakalansın) |
| Yeni herkese açık form | Bot koruması → 429 kontrolü |
| Ayar / ortam değişkeni | 1a › Ayarlar ve ortam (canlıda şartsa `--canli` kontrolü) |
| Ekranda görünmesi gereken şey (görsel, mobil düzen, e-posta içeriği) | Otomatik test edilemez → kısa tur ya da tam tura satır |

Senaryo modülü yazım kuralları (`scripts/regression/NN-konu.mjs`, numara sırasıyla çalışır):
- `export default { name, async run(t) { await t.part("Bölüm", async () => { … t.add("ok"|"fail"|"warn", ad, açıklama) }) } }`
- `t` içinde: `sql / one / num / lit` (veritabanı), `api` (site uçları), `rest` (tarayıcı gibi, RLS geçerli), `auth` (test üyesi), `sleep`.
- Test verisi yalnız işaretli adlarla: ürün `REGRESYON-TEST…`, kupon `RGT…`, üye `…@yerihisset.test`. Modül başta ve sonda kendi verisini siler.
- Gerçek müşteriye / pazaryerine / yöneticiye dokunan hiçbir şey tetiklenmez (SKU/barkodsuz ürün, test e-posta alanı).
- Hata açıklaması "ne bekleniyordu, ne geldi"yi söyler.

Mevcut modüller: `10-siparis-akisi.mjs` (havale siparişi, kupon, stok, hediye, misafir, yetki, iade/iptal, kargo → iade al, satış ortaklığı, iade gelecek (yönetici açar), stok bildirimi, silme, süre dolumu, aynı barkod / SKU reddi).
Sıradaki adaylar: kart ödeme (iyzico sandbox açılınca), YeriHisset Kredisi.
