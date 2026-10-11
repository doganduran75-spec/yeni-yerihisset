# Güvenlik turu — canlı öncesi (2026-10-11)

Önceki denetim: 2026-09 (profiles rol yükseltme, kişisel veri açığı, storage silme — hepsi kapatıldı, regresyonda test ediliyor).

## Düzeltilenler

| Önem | Bulgu | Düzeltme |
|---|---|---|
| **Yüksek** | `link_contacts_for_user` herkese açıktı: giriş yapmış bir üye, başkasının e-postasını vererek o kişinin stok bildirimi / kişi kayıtlarını (telefon, Instagram) kendi hesabına bağlayıp okuyabiliyordu. | Fonksiyon dışarıya kapatıldı (yalnız veritabanı tetikleyicisi kullanır). Migration `20261107000001`. |
| Orta | `rollup_analytics_daily` / `prune_analytics` girişsiz çağrılabiliyordu → geçmiş günlük istatistik silinebilirdi. | Dışarıya kapatıldı (yalnız bakım cron'u). |
| Orta | İlk sürümden kalma "her üye tüm stok bildirimlerini okur/günceller" kuralları sunucuda kalmış olabilir. | Varsa kaldırılıyor (aynı migration). |
| Orta | **Next.js 16.3.6**: önbellek zehirlenmesi (ISR/SSG sayfalar) açığı. | 16.3.8'e güncellendi (yalnız yama sürümü; `~16.3.8`). |
| Orta | **sharp** (görsel işleme) — librsvg açığı. | 0.35.5'e zorlandı (`overrides`). |
| Düşük | Satış ortağı tıklama sayacı sınırsızdı (komisyon raporu şişirilebilirdi). | Aynı IP'den aynı ortağa 30 dk'da 1 tıklama sayılır. |
| Düşük | `shadcn` (yalnız geliştirme aracı) canlı bağımlılıklar arasındaydı → gereksiz paketler (express vb.). | Geliştirme bağımlılığına taşındı. |
| — | Alt bilgideki bülten kutusu (ana sayfa dışı) hiçbir yere bağlı değildi. | Çalışan bülten formu bağlandı (bot koruması dahil). |

## Kontrol edilip sorun bulunmayanlar

- **69 API ucu** tek tek sınıflandırıldı: yönetici uçlarının hepsi rol kontrolü yapıyor; cron uçları gizli anahtarla; müşteri uçları oturum / imzalı bağlantı ile; herkese açık formlar hız sınırı + bot tuzağıyla.
- **Sunucu anahtarı tarayıcıya sızmıyor:** 111 istemci dosyası (dolaylı içe aktarmalar dahil) tarandı.
- **Kart ödemesi dönüşü:** iyzico'dan sunucu-sunucu doğrulanıyor, tutar karşılaştırılıyor.
- **Güvenlik başlıkları:** CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy aktif.

## Bilinçli kabul edilen (düşük) riskler

- `checkout/email-check`: e-postanın kayıtlı olup olmadığını söylüyor (ödeme sayfası akışı için gerekli). IP başına 10 dakikada 15 sorgu sınırı var.
- `lead-magnet/claim`: herhangi bir e-postayla hesap açtırılabilir (onay kutusu + bot tuzağı + IP başına saatte 5).
- `orders/summary`: sipariş kimliğini (tahmin edilemez UUID) bilen, 3 gün boyunca sipariş özetini görür; e-posta maskeli.
- Kalan `npm audit` bulguları yalnız derleme araçlarında (Tailwind 3 → braces, postcss) veya iyzico kütüphanesinin içinde (qs, uuid; dışarıdan tetiklenemez).
- Hız sınırı pm2 süreci başına bellekte (4 süreç → pratikte en fazla 4 katı).

## Otomatik denetim (her deploy'da)

Yeni regresyon modülü `scripts/regression/05-veritabani-guvenligi.mjs`:
RLS kapalı tablo · girişsiz yazma kuralı · herkesin her satırı değiştirebildiği kural · kişisel veri tablosunda herkese açık okuma · üyenin rol/doğrulama alanını değiştirebilmesi · gizli ayar kolonları · dosya deposunda girişsiz yazma · boyut sınırsız kova · girişsiz çağrılabilen yetkili fonksiyonlar · kapatılan fonksiyonlar gerçek çağrıyla.

## Senden (canlı öncesi)

1. **CRON_SECRET'ı yenile** (eski değer sohbette görünmüştü).
2. **SSH'ı anahtarla giriş** yap, şifreyle root girişini kapat.
3. Sunucuda yönetici şifresi güçlü; gereksiz yönetici hesabı yok (regresyon yönetici sayısını gösteriyor).
