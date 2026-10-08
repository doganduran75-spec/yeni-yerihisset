# Regresyon Paketi — YeriHisset

Amaç: Her geliştirmeden sonra "daha önce çalışan bir şey bozuldu mu?" sorusunu **tam test yapmadan**
cevaplamak. Üç katman var; sıkça yapılan kısım otomatik, elle yapılanlar kısa tutuldu.

| Katman | Ne zaman | Süre | Kim |
|---|---|---|---|
| **1. Otomatik kontrol** | Her deploy'un sonunda kendiliğinden | ~1 dk | Sunucu |
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

Neleri kontrol eder (hiçbir veriyi değiştirmez):
- **Veritabanı güncellemeleri:** 26 migration'ın her biri uygulanmış mı (unutulan migration'ı yakalar).
- **Sayfalar:** 25+ müşteri ve admin sayfası açılıyor mu, hata metni var mı, 3 sn'den yavaş mı; gerçek bir ürün mağazada listeleniyor mu; olmayan sayfa 404 mü.
- **Uç noktalar ve yetki:** cron'lar şifresiz çalışmıyor, admin uçları girişsiz çalışmıyor, bot koruması devrede, kart ödeme ucu yanıt veriyor.
- **Veri güvenliği:** dışarıdan (anon anahtarla) üye e-postası/telefonu, gizli ayarlar, siparişler okunamıyor; sahte sipariş eklenemiyor.
- **Veri tutarlılığı:** eksi stok, kategorisiz/görselsiz/SKU'suz ürün, ürünsüz sipariş, süresi dolmuş ödenmemiş sipariş, bozuk bilgi bankası adresi, aktif kargo yöntemi, pazaryeri ve e-posta kuyruğu hataları.
- **Ayarlar ve ortam:** SMTP, iletişim/bildirim e-postası, havale bilgisi, Google Analytics, site adresi, CRON_SECRET, yönetici sayısı (`--canli` ile: e-posta kilidi, iyzico, arama motoru engeli).
- **Arka plan işleri:** gece yedeği (<26 sa), sunucu sağlık kontrolü, pazaryeri senkronu (açıksa).

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
| T4 | Kargo → iade | Bir siparişi "Kargoya Verildi (elle)" → "Teslim Edildi" → "İade al" (stoğa ekle) | Kargo "İade geldi", stok +1 |
| T5 | Şifre | Çıkış → "Şifremi unuttum" → e-postadaki bağlantı → yeni şifre | Giriş oldu; admin'de e-posta "doğrulandı" |
| T6 | Hediye | Hediyeli ürünü sepete ekle → sayfayı yenile → hediyeyi kaldır | Hediye otomatik geldi, kaybolmadı, "Sana hediye" olarak geri döndü |
| T7 | Stok bildirimi | Tükenmiş bir numarada "Stoğa girince haber ver" → e-posta | Kayıt alındı, onay e-postası geldi |
| T8 | Satış ortaklığı | Ortağın linkiyle (gizli pencere) sipariş | Admin detayında ortak kodu |
| T9 | Pazaryeri (açıksa) | Bir ürünün stoğunu değiştir | Senkron geçmişinde Trendyol/Hepsiburada ✓ |
| T10 | İçerik | Bilgi bankası makalesi, Fırsatlar, İletişim, sözleşmeler (telefonda) | Açılıyor, okunuyor |
| T11 | Kart (iyzico açıksa) | Test kartıyla ödeme; başarısız kart; iade | Başarı sayfası; hata mesajı; iyzico iadesi |

Tam tur bitince test siparişlerini **Siparişi sil** ile temizle.

---

## Yeni bir özellik eklenince

Claude, özelliği yazarken otomatik kontrole yeni bir madde ekler (ör. yeni sayfa, yeni migration
işareti). Elle doğrulanması gereken bir şeyse bu dosyadaki tam tura bir satır eklenir.
