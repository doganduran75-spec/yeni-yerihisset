#!/usr/bin/env bash
# YeriHisset — GECELİK OTOMATİK YEDEK
#
# Yedeklenenler (/opt/backups/daily/<tarih-saat>/):
#   db.dump        Veritabanının TAMAMI (supabase_admin ile → tüm şemalar: public,
#                  auth (müşteri hesapları), storage (görsel kayıtları)…). Yeni
#                  eklenen tablolar KENDİLİĞİNDEN dahildir. pg_dump salt okumadır.
#   storage.tar.gz Görsel DOSYALARI — depolama klasörünün TAMAMI (yeni kovalar dahil).
#   config.tar.gz  Sunucu ayarları — ilgili KLASÖRLERİN tamamı (yeni ayar dosyası
#                  eklense de kaçmaz): Supabase kurulum klasörü (veri hariç),
#                  uygulama .env'leri, Caddy, cron, rclone. chmod 600.
#
# Her yedek DOĞRULANIR (arşiv açılıyor mu, üye hesapları + siparişler içinde mi),
# sonra Google Drive'a ŞİFRELİ kopyalanır. Sonuç public.backup_runs tablosuna
# yazılır → admin dashboard'daki "Yedekleme" kutusunda görünür.
#
# Elle:  bash /opt/yerihisset-app/scripts/db-backup.sh
# Cron:  /etc/cron.d/yerihisset-backup (her gece 03:30)
# Log:   /var/log/yerihisset-backup.log
# Rehber: docs/FELAKET-KURTARMA.md
#
# Sunucu dışı kopya: Google Drive (rclone "gdrive-crypt", şifreli, 30 gün).
# Şifre parolaları sunucu DIŞINDA saklanmalı (sunucu kaybında tek anahtar).

set -uo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
BASE_DIR="${BASE_DIR:-/opt/backups/daily}"
KEEP_DAYS="${KEEP_DAYS:-14}"
SUPABASE_DIR="${SUPABASE_DIR:-/opt/yerihisset-supabase}"
STORAGE_DIR="${STORAGE_DIR:-$SUPABASE_DIR/volumes/storage}"
APP_DIR="${APP_DIR:-/opt/yerihisset-app}"
OFFSITE_REMOTE="${OFFSITE_REMOTE:-gdrive-crypt}"
OFFSITE_KEEP_DAYS="${OFFSITE_KEEP_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M)"
DIR="$BASE_DIR/$STAMP"

DB_BYTES=""; ST_BYTES=""; LOCAL_OK=false; OFFSITE_OK=false

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Sonucu dashboard için veritabanına yaz (tablo yoksa sessizce geç)
record() {
  local ok="$1" msg="$2"
  printf "INSERT INTO public.backup_runs (kind, ok, local_ok, offsite_ok, backup_name, db_bytes, storage_bytes, message) VALUES ('backup', %s, %s, %s, :'name', %s, %s, :'msg');\n" \
    "$ok" "$LOCAL_OK" "$OFFSITE_OK" "${DB_BYTES:-NULL}" "${ST_BYTES:-NULL}" \
  | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -v name="$STAMP" -v msg="$msg" >/dev/null 2>&1 \
  || log "(not: sonuç dashboard tablosuna yazılamadı — migration 20260928000001 çalıştırıldı mı?)"
}
fail() { log "HATA: $*"; record false "$*"; exit 1; }

umask 077
mkdir -p "$DIR" || fail "klasör oluşturulamadı: $DIR"
log "Yedek başladı → $DIR"

# 1) Veritabanı (tam yetkili kullanıcı; olmazsa postgres)
DUMP_USER=postgres
docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -tAc "select 1" >/dev/null 2>&1 && DUMP_USER=supabase_admin
if ! docker exec "$DB_CONTAINER" pg_dump -U "$DUMP_USER" -d postgres -Fc --no-comments > "$DIR/db.dump" 2> "$DIR/db.err"; then
  fail "pg_dump başarısız: $(tail -3 "$DIR/db.err" | tr '\n' ' ')"
fi
[ -s "$DIR/db.dump" ] || fail "db.dump boş"
rm -f "$DIR/db.err"
DB_BYTES=$(stat -c %s "$DIR/db.dump")
log "Veritabanı: $(du -h "$DIR/db.dump" | cut -f1) (kullanıcı: $DUMP_USER)"

# 2) Doğrulama: arşiv okunabiliyor mu + kritik veriler içinde mi
docker cp "$DIR/db.dump" "$DB_CONTAINER:/tmp/yh-verify.dump" >/dev/null 2>&1 || fail "doğrulama için kopyalanamadı"
TOC="$(docker exec "$DB_CONTAINER" pg_restore -l /tmp/yh-verify.dump 2>/dev/null)"
docker exec "$DB_CONTAINER" rm -f /tmp/yh-verify.dump >/dev/null 2>&1
[ -n "$TOC" ] || fail "yedek arşivi okunamadı (bozuk olabilir)"
# Not: "echo | grep -q" + pipefail yanlış negatif verir (grep erken çıkınca SIGPIPE) → here-string
grep -q "TABLE DATA auth users"    <<< "$TOC" || fail "yedekte müşteri hesapları (auth.users) yok"
grep -q "TABLE DATA public orders" <<< "$TOC" || fail "yedekte siparişler (public.orders) yok"
log "Doğrulama OK (auth.users + orders içeride)"

# 3) Görsel dosyaları (depolama klasörünün tamamı)
if [ -d "$STORAGE_DIR" ]; then
  tar -czf "$DIR/storage.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" 2>/dev/null \
    || fail "görseller arşivlenemedi"
  ST_BYTES=$(stat -c %s "$DIR/storage.tar.gz")
  log "Görseller: $(du -h "$DIR/storage.tar.gz" | cut -f1)"
else
  log "UYARI: görsel klasörü yok: $STORAGE_DIR"
fi

# 4) Ayarlar — KLASÖR bazlı (yeni ayar dosyaları kendiliğinden dahil).
#    Supabase kurulum klasörü: veritabanı verisi (volumes/db/data) ve görseller
#    (ayrı arşivde) HARİÇ; .env, docker-compose, gateway ayarları, fonksiyonlar dahil.
CFG_PATHS=()
for p in "$SUPABASE_DIR" /etc/caddy /etc/cron.d/yerihisset-backup /root/.config/rclone /root/yerihisset-supabase-secrets.txt \
         "$APP_DIR/.env" "$APP_DIR/.env.local" "$APP_DIR/.env.production" "$APP_DIR/ecosystem.config.js"; do
  [ -e "$p" ] && CFG_PATHS+=("$p")
done
if [ "${#CFG_PATHS[@]}" -gt 0 ]; then
  if tar -czf "$DIR/config.tar.gz" \
       --exclude="$SUPABASE_DIR/volumes/db/data" --exclude="$STORAGE_DIR" --exclude='*.log' \
       "${CFG_PATHS[@]}" 2>/dev/null; then
    log "Ayarlar: ${#CFG_PATHS[@]} konum ($(du -h "$DIR/config.tar.gz" | cut -f1))"
  else
    log "UYARI: ayarlar arşivlenirken sorun (bazı dosyalar okunamadı olabilir)"
  fi
fi
chmod -R go-rwx "$DIR"

# 5) Eski yerel yedekleri temizle
DELETED=$(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -print -exec rm -rf {} + | wc -l)
log "Temizlik: $DELETED eski yedek silindi (saklama: $KEEP_DAYS gün)"
LOCAL_OK=true
COUNT=$(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
log "Yerel yedek TAMAM — $COUNT yedek, toplam $(du -sh "$BASE_DIR" | cut -f1)"

# 6) Sunucu DIŞI kopya: Google Drive (şifreli). Başarısızsa yerel yedek yine geçerli.
REMOTES="$(rclone listremotes 2>/dev/null || true)"
if command -v rclone >/dev/null 2>&1 && grep -qx "${OFFSITE_REMOTE}:" <<< "$REMOTES"; then
  if rclone copy "$DIR" "$OFFSITE_REMOTE:daily/$STAMP" --retries 3 --low-level-retries 10 >/dev/null 2>"$BASE_DIR/.offsite.err"; then
    N=$(rclone ls "$OFFSITE_REMOTE:daily/$STAMP" 2>/dev/null | wc -l)
    OFFSITE_OK=true
    log "Drive kopyası OK ($N dosya → $OFFSITE_REMOTE:daily/$STAMP)"
    rclone delete "$OFFSITE_REMOTE:daily" --min-age "${OFFSITE_KEEP_DAYS}d" >/dev/null 2>&1
    rclone rmdirs "$OFFSITE_REMOTE:daily" --leave-root >/dev/null 2>&1
    rm -f "$BASE_DIR/.offsite.err"
  else
    MSG="Drive kopyası BAŞARISIZ — $(tail -2 "$BASE_DIR/.offsite.err" | tr '\n' ' ')"
    log "UYARI: $MSG"; record false "$MSG"; exit 2
  fi
else
  MSG="Drive kopyası atlandı (rclone ya da '$OFFSITE_REMOTE' ayarı yok)"
  log "UYARI: $MSG"; record false "$MSG"; exit 2
fi

record true "Yerel + Drive OK"
log "Yedek TAMAM (yerel + Drive)"
