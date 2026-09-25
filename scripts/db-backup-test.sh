#!/usr/bin/env bash
# YeriHisset — VERİTABANI YEDEK DENETİMİ + GERİ YÜKLEME TESTİ
#
# Ne yapar (canlı veritabanına HİÇBİR ŞEY YAZMAZ):
#   1) Mevcut otomatik yedekleme düzenini raporlar (cron, systemd timer, yedek klasörleri).
#   2) Canlı DB'den taze bir yedek alır (pg_dump = salt okuma).
#   3) Yedeği GEÇİCİ, ayrı bir Postgres konteynerine geri yükler (aynı Supabase imajı).
#   4) Kritik tabloların satır sayılarını canlı ile karşılaştırır.
#   5) Geçici konteyneri siler; yedek dosyası /opt/backups/test altında kalır.
#
# Çalıştırma (sunucuda, root):
#   bash /opt/yerihisset-app/scripts/db-backup-test.sh
#
# Süre: veri boyutuna göre birkaç dakika. Geçici konteyner ~300-500 MB RAM kullanır.

set -uo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
OUT_DIR="${OUT_DIR:-/opt/backups/test}"
TMP_CONTAINER="yh-restore-test"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="$OUT_DIR/yerihisset-$STAMP.dump"
TABLES="profiles orders order_items products product_variants coupons user_coupons affiliate_profiles store_credit_ledger shipping_methods settings email_templates analytics_sessions"

line() { printf '%s\n' "------------------------------------------------------------"; }
ok()   { printf '  [OK]  %s\n' "$*"; }
warn() { printf '  [!!]  %s\n' "$*"; }

line; echo "1) MEVCUT OTOMATİK YEDEKLEME DÜZENİ"; line
echo "- root crontab:";            (crontab -l 2>/dev/null | grep -iE "dump|backup|yedek" || echo "    (yedekle ilgili satır yok)")
echo "- /etc/cron.d ve cron.daily:"; (grep -rilE "dump|backup|yedek" /etc/cron.d /etc/cron.daily 2>/dev/null || echo "    (bulunamadı)")
echo "- systemd timer'lar:";       (systemctl list-timers --all 2>/dev/null | grep -iE "backup|dump|yedek" || echo "    (yedek timer'ı yok)")
echo "- Olası yedek klasörleri:"
for d in /opt/backups /var/backups /root/backups /opt/yerihisset-supabase/backups; do
  [ -d "$d" ] && { echo "    $d:"; ls -lht "$d" 2>/dev/null | head -5 | sed 's/^/      /'; }
done
LAST=$(find / -xdev \( -name "*.dump" -o -name "*.sql.gz" -o -name "*.sql" \) -path "*back*" -newermt "-7 days" 2>/dev/null | head -3)
[ -n "$LAST" ] && ok "Son 7 günde yedek benzeri dosya var:" && echo "$LAST" | sed 's/^/      /' || warn "Son 7 günde yedek dosyası bulunamadı → OTOMATİK YEDEK YOK görünüyor"
echo "- Storage (ürün görselleri) klasör boyutu:"
du -sh /opt/yerihisset-supabase/volumes/storage 2>/dev/null | sed 's/^/    /' || echo "    (bulunamadı)"

line; echo "2) TAZE YEDEK (pg_dump, salt okuma)"; line
mkdir -p "$OUT_DIR"
T0=$(date +%s)
# Supabase'te tam yetkili kullanıcı supabase_admin'dir (auth/storage şemalarının
# sahibi). postgres kullanıcısı bu şemalara geri yükleme YAPAMAZ → kullanıcı
# hesapları (auth.users) kaybolur. Mümkünse supabase_admin kullan.
DUMP_USER=postgres
docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -tAc "select 1" >/dev/null 2>&1 && DUMP_USER=supabase_admin
echo "  Yedek kullanıcısı: $DUMP_USER"
if docker exec "$DB_CONTAINER" pg_dump -U "$DUMP_USER" -d postgres -Fc --no-comments > "$DUMP" 2> "$OUT_DIR/dump-$STAMP.err"; then
  ok "Yedek alındı: $DUMP ($(du -h "$DUMP" | cut -f1), $(( $(date +%s) - T0 )) sn)"
else
  warn "pg_dump HATA verdi — ayrıntı: $OUT_DIR/dump-$STAMP.err"; tail -5 "$OUT_DIR/dump-$STAMP.err"; exit 1
fi
# Yedekte kullanıcı hesapları (auth.users verisi) var mı?
docker cp "$DUMP" "$DB_CONTAINER:/tmp/yh-verify.dump" >/dev/null 2>&1
TOC="$(docker exec "$DB_CONTAINER" pg_restore -l /tmp/yh-verify.dump 2>/dev/null)"
if grep -q "TABLE DATA auth users" <<< "$TOC"; then
  ok "Yedekte kullanıcı hesapları (auth.users) VAR"
else
  warn "Yedekte auth.users verisi YOK"
fi
docker exec "$DB_CONTAINER" rm -f /tmp/yh-verify.dump >/dev/null 2>&1

line; echo "3) GERİ YÜKLEME TESTİ (geçici konteyner)"; line
IMAGE=$(docker inspect "$DB_CONTAINER" --format '{{.Config.Image}}')
echo "  İmaj: $IMAGE"
docker rm -f "$TMP_CONTAINER" >/dev/null 2>&1
docker run -d --name "$TMP_CONTAINER" -e POSTGRES_PASSWORD="restoretest-$STAMP" "$IMAGE" >/dev/null || { warn "Geçici konteyner başlatılamadı"; exit 1; }
echo -n "  Postgres açılıyor"
for i in $(seq 1 60); do
  docker exec "$TMP_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  echo -n "."; sleep 2
done; echo
sleep 5
T0=$(date +%s)
PW="restoretest-$STAMP"
RU=postgres
docker exec -e PGPASSWORD="$PW" "$TMP_CONTAINER" psql -h 127.0.0.1 -U supabase_admin -d postgres -tAc "select 1" >/dev/null 2>&1 && RU=supabase_admin
echo "  Geri yükleme kullanıcısı: $RU"
if [ "$RU" = "supabase_admin" ]; then
  docker exec -i -e PGPASSWORD="$PW" "$TMP_CONTAINER" pg_restore -h 127.0.0.1 -U supabase_admin -d postgres --clean --if-exists < "$DUMP" > "$OUT_DIR/restore-$STAMP.log" 2>&1
else
  docker exec -i "$TMP_CONTAINER" pg_restore -U postgres -d postgres --no-owner --clean --if-exists < "$DUMP" > "$OUT_DIR/restore-$STAMP.log" 2>&1
fi
ERRS=$(grep -c "error:" "$OUT_DIR/restore-$STAMP.log" || true)
echo "  Geri yükleme süresi: $(( $(date +%s) - T0 )) sn — pg_restore hata satırı: $ERRS"
echo "  (Supabase iç şemalarında birkaç 'already exists' hatası normaldir; public tablolar önemli.)"

line; echo "4) SATIR SAYISI KARŞILAŞTIRMA (canlı ↔ geri yüklenen)"; line
printf '  %-24s %10s %10s  %s\n' "TABLO" "CANLI" "YEDEK" "DURUM"
FAIL=0
tmpq() {
  if [ "$RU" = "supabase_admin" ]; then
    docker exec -e PGPASSWORD="$PW" "$TMP_CONTAINER" psql -h 127.0.0.1 -U supabase_admin -d postgres -tAc "$1" 2>/dev/null || echo "yok"
  else
    docker exec "$TMP_CONTAINER" psql -U postgres -d postgres -tAc "$1" 2>/dev/null || echo "yok"
  fi
}
for t in $TABLES; do
  a=$(docker exec "$DB_CONTAINER"  psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.$t" 2>/dev/null || echo "yok")
  b=$(tmpq "SELECT count(*) FROM public.$t")
  if [ "$a" = "yok" ]; then s="(tablo yok)"; elif [ "$a" = "$b" ]; then s="OK"; else s="FARKLI"; FAIL=1; fi
  printf '  %-24s %10s %10s  %s\n' "$t" "$a" "$b" "$s"
done
AU_A=$(docker exec "$DB_CONTAINER"  psql -U postgres -d postgres -tAc "SELECT count(*) FROM auth.users" 2>/dev/null)
AU_B=$(tmpq "SELECT count(*) FROM auth.users")
if [ "$AU_A" = "$AU_B" ]; then AU_S="OK"; else AU_S="FARKLI"; FAIL=1; fi
printf '  %-24s %10s %10s  %s\n' "auth.users" "$AU_A" "$AU_B" "$AU_S"
OB_A=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "SELECT count(*) FROM storage.objects" 2>/dev/null)
OB_B=$(tmpq "SELECT count(*) FROM storage.objects")
if [ "$OB_A" = "$OB_B" ]; then OB_S="OK"; else OB_S="FARKLI"; FAIL=1; fi
printf '  %-24s %10s %10s  %s\n' "storage.objects (kayıt)" "$OB_A" "$OB_B" "$OB_S"
echo "  Not: görsel DOSYALARI veritabanında değil, disktedir (volumes/storage) — ayrıca yedeklenmeli."

line; echo "5) TEMİZLİK"; line
docker rm -f "$TMP_CONTAINER" >/dev/null 2>&1 && ok "Geçici konteyner silindi"
echo "  Yedek dosyası saklandı: $DUMP"
echo "  Loglar: $OUT_DIR/restore-$STAMP.log"

line
if [ "$FAIL" = "0" ]; then ok "SONUÇ: Yedek alınabiliyor ve eksiksiz geri yüklenebiliyor."; else warn "SONUÇ: Satır sayılarında fark var — restore log'unu incele."; fi
echo "Bu çıktının TAMAMINI kopyalayıp Claude'a gönder."
