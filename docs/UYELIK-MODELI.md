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
| **Barefoot Meraklısı** (kısa ad `musteri`) | En az 1 ödenmiş sipariş |
| **Barefoot Tutkunu** (kısa ad `mudavim`) | En az N ödenmiş sipariş (Ayarlar › Roller, varsayılan 2) |
| **Barefoot Gurusu** (kısa ad `guru`) | Kendisi en az 1 ödenmiş sipariş + iş ortağı olarak en az 1 ödenmiş satış (kendi siparişi sayılmaz); panelden elle de verilebilir |

Topluluk katmanları kararı: 2026-11-11 (migration `20261177000001_community_tiers.sql`). "Müşteri" / "Müdavim" adları kalktı; kısa adlar (kod, fırsat seviyeleri) aynı.

**İş ortağı** ayrı bir rozettir; yalnız **Üye** olabilir (başvuru anında onaylanır).

## Kim ne yapabilir

| İş | Misafir | Doğrulanmamış | Üye |
|---|---|---|---|
| Sipariş vermek | ✓ (misafir olarak) | ✓ | ✓ |
| Giriş / Hesabım / sipariş geçmişi | ✗ (önce şifre belirler) | ✓ (doğrula uyarısıyla) | ✓ |
| Hoş geldin kuponu | ✗ | ✗ (doğrulayınca atanır) | ✓ |
| Fırsatlar (seviyeli) | ✗ | ✗ — seviye 0 | ✓ — Üye 1 · Meraklı 2 · Tutkun 3 · Guru 4 |
| İş ortaklığı başvurusu | ✗ | ✗ (bilgi görünür, "doğrulayınca açılır") | ✓ |
| YeriHisset Kredisi harcamak | ✗ | — | ✓ (iş ortağıysa) |

Eski siteden aktarılan müşteriler şifre belirleyince Üye olur ama hoş geldin kuponu almaz (yeni değiller).

Admin › Üyeler listesinde rozetler: **Misafir / Doğrulanmamış / Üye** + Barefoot Meraklısı / Tutkunu / Gurusu / İş ortağı.
