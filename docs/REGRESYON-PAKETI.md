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
- **Sayfalar:** 25+ müşteri ve admin sayfası açılıyor mu, hata metni var mı, 3 sn'den yavaş mı; gerçek bir ürün mağazada listeleniyor mu; olmayan sayfa 404 mü.
- **Uç noktalar ve yetki:** cron'lar şifresiz çalışmıyor, admin uçları girişsiz çalışmıyor, bot koruması devrede, kart ödeme ucu yanıt veriyor.
- **Veri güvenliği:** dışarıdan (anon anahtarla) üye e-postası/telefonu, gizli ayarlar, siparişler okunamıyor; sahte sipariş eklenemiyor.
- **Veri tutarlılığı:** eksi stok, kategorisiz/görselsiz/SKU'suz ürün, ürünsüz sipariş, süresi dolmuş ödenmemiş sipariş, bozuk bilgi bankası adresi, aktif kargo yöntemi, pazaryeri ve e-posta kuyruğu hataları.
- **Üyelik:** 'Üye' rolü yalnız şifreli + e-postası doğrulanmış hesaplarda (model: `docs/UYELIK-MODELI.md`).
- **Ayarlar ve ortam:** SMTP, iletişim e-postası (yönetici bildirimleri buraya gider), havale bilgisi, Google Analytics, site adresi, CRON_SECRET, yönetici sayısı (`--canli` ile: e-posta kilidi, iyzico, arama motoru engeli).
- **Ürün beslemesi ve reklam etiketleri:** Google/Meta katalog beslemesi açılıyor, ürün sayısı ve fiyatı veritabanıyla aynı, numaralar `size` alanında, reklam bağlantısı (`?variant=`) çalışıyor, Meta Pixel onaysız yüklenmiyor, Conversions API anahtarı dışarıya kapalı (`--canli`: test olay kodu dolu → HATA).
- **Arka plan işleri:** gece yedeği (<26 sa), sunucu sağlık kontrolü, pazaryeri senkronu (açıksa).

### 1b. Fonksiyonel senaryolar — iş akışları doğru çalışıyor mu (`scripts/regression/`)

Gerçek uçlara gerçek istek atar, sonucu veritabanında doğrular. Kendi test verisini kurar ve
sonunda siler: pasif `REGRESYON-TEST` ürünleri (mağazada görünmez, pazaryerine gitmez), `RGT…`
kuponları, `@yerihisset.test` üyeleri (bu adreslere e-posta **hiç** gitmez, yöneticiye "yeni sipariş"
bildirimi düşmez). Tek iz: sipariş numaraları birkaç numara atlar.

| Bölüm | Neyi kanıtlar |
|---|---|
| Sipariş: fiyat, stok, kargo, hediye | İstekte fiyat değiştirilse de veritabanı fiyatı alınır; tutar = ürün + kargo; stok düşer; stoktan fazlası reddedilir; hediye 0 TL ve stoğu düşer; tetikleyicisiz hediye reddedilir |
| Kupon kuralları | Yüzde / sabit / ücretsiz kargo: sepetteki indirim = siparişteki indirim, kullanım sayılır. Alt limit, süresi dolmuş, başlamamış, başkasına özel, olmayan kupon ve kişi başı limit **hem sepette hem doğrudan sipariş isteğinde** reddedilir |
| Misafir siparişi | Bot isteği reddedilir; misafir siparişi açılır; sonuç sayfası verisi (havale bekliyor); e-posta kontrolü; üyenin e-postasıyla misafir siparişi reddedilir |
| Yetki | Üye yönetici işlemi / silme yapamaz, başkasının siparişini göremez, kendi siparişini "ödendi" yapamaz |
| Ödeme onayı, iade, iptal | Ödenmemiş iptal (stok geri, fatura "gerekmiyor"); yönetici "Ödendi" → üye **Müşteri** rolü; onaysız iade reddedilir; kısmi iade; ödenmiş sipariş iptali (kalan iade, stok geri); çift iptal reddedilir |
| Kargo → teslim → iade al | "Kargoya Verildi (elle)" ve "Teslim Edildi"; kargolanmış sipariş iptal edilemez; kargolanmamışta "İade al" reddedilir; iade gelen ürün stoğa, ücret iadesi kaydı, aynı ürün iki kez stoğa eklenmez |
| Satış ortaklığı | Ortak linkiyle sipariş ortağa yazılır; ortağın kendi alışverişi, askıya alınmış ortak ve olmayan kod sayılmaz (sipariş yine verilir) |
| Reklamdan gelen sipariş | Instagram reklamı kaynağı siparişe yazılır; test siparişi Meta'ya gönderilmez ve geçici IP/tarayıcı bilgisi silinir; çerez onayı yoksa Meta bilgisi hiç saklanmaz; bozuk bilgi siparişi bozmaz |
| Üyelik durumu ve e-posta doğrulama | Misafir ve doğrulanmamış hesap "Üye" sayılmaz (seviye 0); sipariş e-postasında doğrulama bağlantısı üretilir; yeniden gönderim, eski bağlantı geçersiz, yenisiyle doğrulama → Üye + Müşteri seviyesi + hoş geldin kuponları; Fırsat kuponu ve iş ortaklığı doğrulamadan alınamaz; üst seviye fırsatı doğrudan istekle alınamaz; test fırsatı sitede görünmez; başkasının siparişi için mesaj e-postası tetiklenemez |
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
| T6 | Hediye | Hediyeli ürünü sepete ekle → sayfayı yenile → hediyeyi kaldır | Hediye otomatik geldi, kaybolmadı, "Sana hediye" olarak geri döndü |
| T7 | Stok bildirimi e-postaları | Tükenmiş numarada "Stoğa girince haber ver" → stok gir → "Stok geldi" gönder | Onay ve "stok geldi" e-postaları geldi, görünüm düzgün (kayıt akışı otomatik testte) |
| T8 | Satış ortağı linki | Ortağın linkini gizli pencerede aç → sipariş ver | Link kodu sepete taşınıyor (tarayıcı kısmı; sipariş tarafı otomatik testte) |
| T9 | Pazaryeri (açıksa) | Bir ürünün stoğunu değiştir | Senkron geçmişinde Trendyol/Hepsiburada ✓ |
| T10 | İçerik | Bilgi bankası makalesi, Fırsatlar, İletişim, sözleşmeler (telefonda) | Açılıyor, okunuyor |
| T12 | Meta reklamı (canlıda) | Çerezde "Kabul Et" → bir ürüne bak, sepete ekle, sipariş ver; Events Manager › Test olayları | ViewContent, AddToCart, InitiateCheckout, Purchase (tarayıcı + sunucu, tek satış) görünüyor |
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

Mevcut modüller: `10-siparis-akisi.mjs` (havale siparişi, kupon, stok, hediye, misafir, yetki, iade/iptal, kargo → iade al, satış ortaklığı, stok bildirimi, silme, süre dolumu).
Sıradaki adaylar: kart ödeme (iyzico sandbox açılınca), YeriHisset Kredisi.
