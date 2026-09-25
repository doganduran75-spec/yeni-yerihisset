#!/usr/bin/env bash
# YeriHisset — YEDEKTEN GERİ YÜKLEME
#
# Kullanım:
#   bash scripts/db-restore.sh liste                 # hangi yedekler var (sunucu + Drive)
#   bash scripts/db-restore.sh veritabani <YEDEK>    # veritabanını o yedeğe döndür
#   bash scripts/db-restore.sh gorseller  <YEDEK>    # ürün görsellerini o yedeğe döndür
#   <YEDEK> = listedeki ad, ör. 20260925-2253   (en son için: son)
#
# GÜVENLİK:
#   - Onay için EVET yazman istenir.
#   - Geri yüklemeden ÖNCE o anki hal /opt/backups/pre-restore/ altına yedeklenir
#     (yanlış yedeği seçersen buradan geri dönebilirsin).
#   - Yedek sunucuda yoksa Google Drive'dan (şifreli) indirilir.
#   - İşlem sırasında site ve Supabase servisleri kısa süre durur (birkaç dakika).
#
# DİKKAT: Veritabanı geri yüklenince, yedeğin alındığı andan SONRAKİ tüm kayıtlar
# (sipariş, üye, mesaj…) kaybolur. Önce "liste" ile doğru yedeği seç.

set -uo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
BASE_DIR="${BASE_DIR:-/opt/backups/daily}"
PRE_DIR="/opt/backups/pre-restore"
STORAGE_DIR="${STORAGE_DIR:-/opt/yerihisset-supabase/volumes/storage}"
OFFSITE_REMOTE="${OFFSITE_REMOTE:-gdrive-crypt}"
NOW="$(date +%Y%m%d-%H%M%S)"

say()  { echo "▸ $*"; }
die()  { echo "✗ HATA: $*"; exit 1; }
svc()  { docker ps -a --format '{{.Names}}' | grep -E "^supabase-($1)$" || true; }

confirm() {
  echo
  echo "⚠  $1"
  read -r -p "Devam etmek için büyük harflerle EVET yaz: " ans
  [ "$ans" = "EVET" ] || die "İptal edildi (hiçbir şey değişmedi)."
}

# Yedek klasörünü bul; sunucuda yoksa Drive'dan indir
fetch_backup() {
  local name="$1"
  if [ "$name" = "son" ]; then
    name="$(ls -1 "$BASE_DIR" 2>/dev/null | sort | tail -1)"
    [ -n "$name" ] || die "Sunucuda yedek yok; ad vererek Drive'dan iste (liste ile bak)."
  fi
  if [ ! -d "$BASE_DIR/$name" ]; then
    say "Sunucuda yok → Drive'dan indiriliyor: $name"
    command -v rclone >/dev/null || die "rclone yok"
    rclone copy "$OFFSITE_REMOTE:daily/$name" "$BASE_DIR/$name" || die "Drive'dan indirilemedi"
  fi
  [ -d "$BASE_DIR/$name" ] || die "Yedek bulunamadı: $name"
  echo "$name"
}

cmd="${1:-}"; arg="${2:-}"

case "$cmd" in
  liste)
    echo "── Sunucudaki yedekler ($BASE_DIR) ──"
    for d in $(ls -1 "$BASE_DIR" 2>/dev/null | sort); do
      printf '  %s   %s\n' "$d" "$(ls "$BASE_DIR/$d" 2>/dev/null | tr '\n' ' ')"
    done
    echo "── Google Drive'daki yedekler ($OFFSITE_REMOTE:daily) ──"
    rclone lsf "$OFFSITE_REMOTE:daily" --dirs-only 2>/dev/null | sed 's#/$##; s/^/  /' || echo "  (Drive okunamadı)"
    ;;

  veritabani)
    [ -n "$arg" ] || die "Yedek adı ver (ör. 20260925-2253 ya da son)"
    NAME="$(fetch_backup "$arg")" || exit 1
    NAME="$(echo "$NAME" | tail -1)"
    DUMP="$BASE_DIR/$NAME/db.dump"
    [ -s "$DUMP" ] || die "db.dump yok: $DUMP"
    confirm "Veritabanı $NAME yedeğine DÖNDÜRÜLECEK. O andan sonraki tüm kayıtlar kaybolur."

    mkdir -p "$PRE_DIR"; chmod 700 "$PRE_DIR"
    say "Önce şu anki hal yedekleniyor → $PRE_DIR/db-$NOW.dump"
    docker exec "$DB_CONTAINER" pg_dump -U supabase_admin -d postgres -Fc --no-comments > "$PRE_DIR/db-$NOW.dump" \
      || die "Güvenlik yedeği alınamadı — geri yükleme YAPILMADI"

    say "Site ve Supabase servisleri durduruluyor"
    pm2 stop yerihisset >/dev/null 2>&1 || true
    STOPPED="$(svc 'rest|auth|storage|realtime|meta')"
    [ -n "$STOPPED" ] && docker stop $STOPPED >/dev/null

    say "Geri yükleniyor…"
    docker cp "$DUMP" "$DB_CONTAINER:/tmp/yh-restore.dump" >/dev/null || die "yedek konteynere kopyalanamadı"
    docker exec "$DB_CONTAINER" pg_restore -U supabase_admin -d postgres --clean --if-exists \
      /tmp/yh-restore.dump > "$PRE_DIR/restore-$NOW.log" 2>&1
    docker exec "$DB_CONTAINER" rm -f /tmp/yh-restore.dump
    ERRS=$(grep -c "error:" "$PRE_DIR/restore-$NOW.log" || true)

    say "Servisler yeniden başlatılıyor"
    [ -n "$STOPPED" ] && docker start $STOPPED >/dev/null
    sleep 5
    pm2 start yerihisset >/dev/null 2>&1 || pm2 start /opt/yerihisset-app/ecosystem.config.js >/dev/null 2>&1

    U=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "select count(*) from auth.users" 2>/dev/null)
    O=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "select count(*) from public.orders" 2>/dev/null)
    echo
    echo "✓ Veritabanı $NAME yedeğine döndürüldü. Üye: $U, sipariş: $O  (pg_restore uyarı satırı: $ERRS)"
    echo "  Log: $PRE_DIR/restore-$NOW.log"
    echo "  Geri almak istersen (işlem öncesi hal): $PRE_DIR/db-$NOW.dump"
    ;;

  gorseller)
    [ -n "$arg" ] || die "Yedek adı ver (ör. 20260925-2253 ya da son)"
    NAME="$(fetch_backup "$arg")" || exit 1
    NAME="$(echo "$NAME" | tail -1)"
    TGZ="$BASE_DIR/$NAME/storage.tar.gz"
    [ -s "$TGZ" ] || die "storage.tar.gz yok: $TGZ"
    confirm "Ürün görselleri $NAME yedeğine DÖNDÜRÜLECEK."

    STO="$(svc storage)"
    [ -n "$STO" ] && docker stop $STO >/dev/null
    mkdir -p "$PRE_DIR"; chmod 700 "$PRE_DIR"
    if [ -d "$STORAGE_DIR" ]; then
      say "Şu anki görseller kenara alınıyor → $STORAGE_DIR.pre-$NOW"
      mv "$STORAGE_DIR" "$STORAGE_DIR.pre-$NOW" || die "mevcut klasör taşınamadı"
    fi
    tar -xzf "$TGZ" -C "$(dirname "$STORAGE_DIR")" || die "arşiv açılamadı"
    [ -n "$STO" ] && docker start $STO >/dev/null
    echo "✓ Görseller $NAME yedeğine döndürüldü ($(du -sh "$STORAGE_DIR" | cut -f1))."
    echo "  Önceki hal: $STORAGE_DIR.pre-$NOW (sorun yoksa sonra silebilirsin)"
    ;;

  *)
    sed -n '3,9p' "$0"
    exit 1
    ;;
esac
