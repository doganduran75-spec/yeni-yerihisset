#!/usr/bin/env bash
# YeriHisset — GECELİK OTOMATİK YEDEK
#
# Yedeklenenler (/opt/backups/daily/<tarih-saat>/):
#   db.dump        Veritabanının TAMAMI (supabase_admin ile → müşteri hesapları
#                  auth.users, görsel kayıtları storage.objects dahil). pg_dump
#                  salt okumadır, site çalışırken alınabilir.
#   storage.tar.gz Ürün görseli DOSYALARI (veritabanında değil diskte durur)
#   config.tar.gz  Sunucu ayar dosyaları (.env'ler, Caddyfile, pm2) — felakette
#                  sunucuyu yeniden kurabilmek için. chmod 600 (yalnız root).
#
# Her yedek alındıktan sonra açılabilir mi diye DOĞRULANIR (kullanıcı hesapları
# verisi içinde var mı). KEEP_DAYS günden eski yedekler silinir.
#
# Elle çalıştırma:   bash /opt/yerihisset-app/scripts/db-backup.sh
# Otomatik (cron):   /etc/cron.d/yerihisset-backup  (kurulum komutu README/rehberde)
# Log:               /var/log/yerihisset-backup.log
#
# NOT: Bu yedekler AYNI sunucuda durur → disk/sunucu kaybında işe yaramaz.
# Bir sonraki adım: sunucu DIŞINA şifreli kopya (offsite).

set -uo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
BASE_DIR="${BASE_DIR:-/opt/backups/daily}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STORAGE_DIR="${STORAGE_DIR:-/opt/yerihisset-supabase/volumes/storage}"
STAMP="$(date +%Y%m%d-%H%M)"
DIR="$BASE_DIR/$STAMP"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "HATA: $*"; exit 1; }

umask 077
mkdir -p "$DIR" || fail "klasör oluşturulamadı: $DIR"
log "Yedek başladı → $DIR"

# 1) Veritabanı (tam yetkili kullanıcı; olmazsa postgres)
DUMP_USER=postgres
docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -tAc "select 1" >/dev/null 2>&1 && DUMP_USER=supabase_admin
if ! docker exec "$DB_CONTAINER" pg_dump -U "$DUMP_USER" -d postgres -Fc --no-comments > "$DIR/db.dump" 2> "$DIR/db.err"; then
  fail "pg_dump başarısız: $(tail -3 "$DIR/db.err")"
fi
[ -s "$DIR/db.dump" ] || fail "db.dump boş"
rm -f "$DIR/db.err"
log "Veritabanı: $(du -h "$DIR/db.dump" | cut -f1) (kullanıcı: $DUMP_USER)"

# 2) Doğrulama: arşiv okunabiliyor mu + kullanıcı hesapları verisi içinde mi
docker cp "$DIR/db.dump" "$DB_CONTAINER:/tmp/yh-verify.dump" >/dev/null 2>&1 || fail "doğrulama için kopyalanamadı"
TOC="$(docker exec "$DB_CONTAINER" pg_restore -l /tmp/yh-verify.dump 2>/dev/null)"
docker exec "$DB_CONTAINER" rm -f /tmp/yh-verify.dump >/dev/null 2>&1
[ -n "$TOC" ] || fail "yedek arşivi okunamadı (bozuk olabilir)"
# Not: "echo | grep -q" + pipefail yanlış negatif verir (grep erken çıkınca SIGPIPE) → here-string
grep -q "TABLE DATA auth users"    <<< "$TOC" || fail "yedekte müşteri hesapları (auth.users) yok"
grep -q "TABLE DATA public orders" <<< "$TOC" || fail "yedekte siparişler (public.orders) yok"
log "Doğrulama OK (auth.users + orders içeride)"

# 3) Görsel dosyaları
if [ -d "$STORAGE_DIR" ]; then
  tar -czf "$DIR/storage.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" 2>/dev/null \
    || fail "görseller arşivlenemedi"
  log "Görseller: $(du -h "$DIR/storage.tar.gz" | cut -f1)"
else
  log "UYARI: görsel klasörü yok: $STORAGE_DIR"
fi

# 4) Ayar dosyaları (varsa)
CFG=()
for f in /opt/yerihisset-app/.env.local /opt/yerihisset-supabase/.env /opt/yerihisset-supabase/docker-compose.yml \
         /etc/caddy/Caddyfile /opt/yerihisset-app/ecosystem.config.js /root/yerihisset-supabase-secrets.txt; do
  [ -f "$f" ] && CFG+=("$f")
done
if [ "${#CFG[@]}" -gt 0 ]; then
  tar -czf "$DIR/config.tar.gz" "${CFG[@]}" 2>/dev/null && log "Ayar dosyaları: ${#CFG[@]} dosya"
fi
chmod -R go-rwx "$DIR"

# 5) Eski yedekleri temizle
DELETED=$(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -print -exec rm -rf {} + | wc -l)
log "Temizlik: $DELETED eski yedek silindi (saklama: $KEEP_DAYS gün)"

TOTAL=$(du -sh "$BASE_DIR" | cut -f1)
COUNT=$(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
log "Yedek TAMAM — $COUNT yedek, toplam $TOTAL"
