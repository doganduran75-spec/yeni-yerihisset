# YeriHisset — Yedekten Geri Dönüş Rehberi

## Yedekler nerede?

| Nerede | Ne kadar | İçerik |
|---|---|---|
| Sunucu: `/opt/backups/daily/<tarih-saat>/` | 14 gün | `db.dump` (veritabanı + üye hesapları), `storage.tar.gz` (ürün görselleri), `config.tar.gz` (sunucu ayarları) |
| Google Drive: `yerihisset-yedek` klasörü (şifreli) | 30 gün | Aynı dosyaların şifreli kopyası |

- Yedek her gece **03:30**'da otomatik alınır. Log: `/var/log/yerihisset-backup.log`
- Kontrol: `tail -8 /var/log/yerihisset-backup.log` → son satır `Yedek TAMAM (yerel + Drive)` olmalı.
- **Şifre parolaları (PAROLA1 / PAROLA2) sunucu dışında saklanmalı.** Sunucu kaybolursa Drive'daki yedeği açmanın tek yolu budur.

> Geri yükleme, yedeğin alındığı ana döner. O andan **sonraki** sipariş/üye/mesaj kayıtları geri gelmez.

---

## Durum 1 — Veri kazası (yanlış silme, bozuk güncelleme)

Sunucu çalışıyor, sadece veri bozuk.

```bash
cd /opt/yerihisset-app
bash scripts/db-restore.sh liste                       # yedekleri gör
bash scripts/db-restore.sh veritabani 20260925-0330    # o geceye dön (ya da: son)
```

- Onay için `EVET` yazılır.
- İşlemden önce o anki hal `/opt/backups/pre-restore/` altına yedeklenir (yanlış seçim olursa geri dönülür).
- Site birkaç dakika kapalı kalır, sonra kendiliğinden açılır.

## Durum 2 — Görseller silindi / bozuldu

```bash
bash scripts/db-restore.sh gorseller son
```

Önceki görsel klasörü silinmez, `...storage.pre-<tarih>` adıyla kenara alınır.

---

## Durum 3 — Sunucu tamamen kayboldu (disk arızası, hack, sağlayıcı sorunu)

Yeni bir Ubuntu 24.04 sunucusunda (≥ 4 CPU, 8 GB RAM):

1. **Temel kurulum:** Docker, Caddy, Node 22, pm2, git, rclone (`apt-get install -y rclone`).
2. **Drive bağlantısı:** Rehberdeki gibi laptop'tan Google izni al (`rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"`) ve `gdrive` ayarını yaz; ardından şifreli katmanı **kayıtlı PAROLA1/PAROLA2** ile yeniden tanımla:
   ```bash
   printf '\n[gdrive-crypt]\ntype = crypt\nremote = gdrive:yerihisset-yedek\nfilename_encryption = standard\ndirectory_name_encryption = true\npassword = %s\npassword2 = %s\n' "$(rclone obscure 'PAROLA1')" "$(rclone obscure 'PAROLA2')" >> /root/.config/rclone/rclone.conf
   rclone lsf gdrive-crypt:daily      # yedekler listelenmeli
   ```
3. **Son yedeği indir:**
   ```bash
   mkdir -p /opt/backups/daily
   rclone copy gdrive-crypt:daily/<EN-SON-YEDEK> /opt/backups/daily/<EN-SON-YEDEK>
   ```
4. **Ayar dosyalarını geri koy:** `tar -xzf config.tar.gz -C /` → `.env.local`, Supabase `.env` + `docker-compose.yml`, `Caddyfile`, `ecosystem.config.js`, Supabase sırları yerine gelir.
5. **Supabase'i başlat:** `cd /opt/yerihisset-supabase && docker compose up -d` (aynı sırlarla).
6. **Uygulama kodu:** GitHub'dan `/opt/yerihisset-app`'e klonla (deploy key gerekir), `npm ci`.
7. **Veri + görseller:**
   ```bash
   cd /opt/yerihisset-app
   bash scripts/db-restore.sh veritabani <EN-SON-YEDEK>
   bash scripts/db-restore.sh gorseller  <EN-SON-YEDEK>
   ```
8. **Siteyi aç:** `bash scripts/deploy.sh` → `systemctl reload caddy`.
9. **DNS:** `dev.yerihisset.com` / `supabase.yerihisset.com` (ve canlıda `yerihisset.com`) A kayıtlarını yeni sunucu IP'sine çevir.
10. **Gece yedeğini yeniden kur:** `/etc/cron.d/yerihisset-backup` satırı (bkz. sunucu kurulum notları).

Tahmini süre: 1–2 saat.

---

## Prova

Canlıya geçmeden önce ve sonra yılda 1–2 kez:

- `bash scripts/db-backup-test.sh` → yedeği geçici veritabanına açıp kayıt sayılarını karşılaştırır (canlıya dokunmaz).
- İsteğe bağlı: staging'de `db-restore.sh veritabani son` ile uçtan uca geri yükleme provası.
