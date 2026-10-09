# Üyelik modeli — kim, ne yapabilir

Karar: 2026-10-09 (migration `20261028000001_member_status.sql`). İki ayrı eksen var; bir kişi her ikisinden de birer durum taşır.

## Eksen A — Hesap durumu

| Durum | Tanım | Nasıl olunur |
|---|---|---|
| **Misafir** | Hesap var, şifre yok | Misafir siparişi, eski siteden (WordPress) aktarım, e-bülten formu |
| **Doğrulanmamış** | Şifre var, e-posta doğrulanmadı | Kayıt formu |
| **Üye** | Şifre var + e-posta doğrulandı | Kayıt e-postasındaki bağlantı · sipariş e-postasındaki "Adresimi doğrula" · Hesabım › "Doğrulama e-postası gönder" · şifre belirleme / sıfırlama bağlantısı |

"Üye" rolü yalnız bu durumda bulunur; sistem kendiliğinden ekler/kaldırır.

## Eksen B — Alışveriş seviyesi

| Seviye | Tanım |
|---|---|
| — | Ödenmiş siparişi yok |
| **Müşteri** | En az 1 ödenmiş sipariş |
| **Müdavim** (isim değişecek) | En az N ödenmiş sipariş (Ayarlar › Roller) |

**İş ortağı** ayrı bir rozettir; yalnız **Üye** olabilir (başvuru anında onaylanır).

## Kim ne yapabilir

| İş | Misafir | Doğrulanmamış | Üye |
|---|---|---|---|
| Sipariş vermek | ✓ (misafir olarak) | ✓ | ✓ |
| Giriş / Hesabım / sipariş geçmişi | ✗ (önce şifre belirler) | ✓ (doğrula uyarısıyla) | ✓ |
| Hoş geldin kuponu | ✗ | ✗ (doğrulayınca atanır) | ✓ |
| Fırsatlar (seviyeli) | ✗ | ✗ — seviye 0 | ✓ — Üye 1 · Müşteri 2 · Müdavim 3 |
| İş ortaklığı başvurusu | ✗ | ✗ (bilgi görünür, "doğrulayınca açılır") | ✓ |
| YeriHisset Kredisi harcamak | ✗ | — | ✓ (iş ortağıysa) |

Eski siteden aktarılan müşteriler şifre belirleyince Üye olur ama hoş geldin kuponu almaz (yeni değiller).

Admin › Üyeler listesinde rozetler: **Misafir / Doğrulanmamış / Üye** + Müşteri / Müdavim / İş ortağı.
