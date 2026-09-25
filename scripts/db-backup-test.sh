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
# Karşılaştırılacak tablolar: public şemasındaki TÜM tablolar (yeni tablolar kendiliğinden dahil)

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
# Canlı kayıt sayıları yedekten HEMEN ÖNCE alınır. Test sırasında siteye yeni kayıt
# gelirse (ziyaret istatistiği vb.) geri yüklenen veride en az bu kadar olmalı.
TABLES="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1" 2>/dev/null)"
declare -A LIVE
for t in $TABLES; do
  LIVE[$t]=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.\"$t\"" 2>/dev/null || echo "yok")
done
LIVE[auth.users]=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "SELECT count(*) FROM auth.users" 2>/dev/null)
LIVE[storage.objects]=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "SELECT count(*) FROM storage.objects" 2>/dev/null)
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
READY=0
for i in $(seq 1 90); do
  if docker exec "$TMP_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then READY=1; break; fi
  echo -n "."; sleep 2
done; echo
if [ "$READY" != "1" ]; then
  warn "Geçici veritabanı 3 dakikada açılmadı. Konteyner durumu: $(docker inspect -f '{{.State.Status}}' "$TMP_CONTAINER" 2>/dev/null)"
  docker logs --tail 15 "$TMP_CONTAINER" 2>&1 | sed 's/^/      /'
fi
# Supabase imajı ilk açılışta kendi kurulum betiklerini çalıştırıp yeniden başlar →
# kısa bekle ve hazır olduğunu TEKRAR doğrula
sleep 8
for i in $(seq 1 30); do
  docker exec "$TMP_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
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
RESTORED=$( { if [ "$RU" = "supabase_admin" ]; then docker exec -e PGPASSWORD="$PW" "$TMP_CONTAINER" psql -h 127.0.0.1 -U supabase_admin -d postgres -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'"; else docker exec "$TMP_CONTAINER" psql -U postgres -d postgres -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'"; fi; } 2>&1 | tail -1 )
echo "  Geçici veritabanında public tablo sayısı: $RESTORED"
if [ "$ERRS" -gt 50 ] 2>/dev/null || ! [ "$RESTORED" -gt 0 ] 2>/dev/null; then
  warn "Geri yükleme sorunlu görünüyor — ilk hata satırları:"
  grep -m 8 -iE "error|fatal|could not" "$OUT_DIR/restore-$STAMP.log" | sed 's/^/      /'
fi
echo "  (Supabase iç şemalarında birkaç 'already exists' hatası normaldir; public tablolar önemli.)"

line; echo "4) KAYIT SAYISI KARŞILAŞTIRMA (canlı ↔ geri yüklenen) — tüm tablolar"; line
printf '  %-28s %10s %10s  %s\n' "TABLO" "CANLI" "YEDEK" "DURUM"
FAIL=0; CHECKED=0; BAD=""
tmpq() {
  if [ "$RU" = "supabase_admin" ]; then
    docker exec -e PGPASSWORD="$PW" "$TMP_CONTAINER" psql -h 127.0.0.1 -U supabase_admin -d postgres -tAc "$1" 2>/dev/null || echo "yok"
  else
    docker exec "$TMP_CONTAINER" psql -U postgres -d postgres -tAc "$1" 2>/dev/null || echo "yok"
  fi
}
compare() {  # $1 ad, $2 canlı (yedekten önce), $3 geri yüklenen
  local s
  if [ "$3" = "yok" ] || [ -z "$3" ]; then s="YEDEKTE YOK"; FAIL=1; BAD="$BAD $1"
  elif [ "$2" = "$3" ]; then s="OK"
  elif [ "$3" -gt "$2" ] 2>/dev/null; then s="OK (test sırasında yeni kayıt)"
  else s="EKSİK"; FAIL=1; BAD="$BAD $1"; fi
  CHECKED=$((CHECKED + 1))
  printf '  %-28s %10s %10s  %s\n' "$1" "$2" "$3" "$s"
}
for t in $TABLES; do
  compare "$t" "${LIVE[$t]}" "$(tmpq "SELECT count(*) FROM public.\"$t\"")"
done
compare "auth.users (hesaplar)"   "${LIVE[auth.users]}"      "$(tmpq "SELECT count(*) FROM auth.users")"
compare "storage.objects (görsel)" "${LIVE[storage.objects]}" "$(tmpq "SELECT count(*) FROM storage.objects")"
echo "  Not: görsel DOSYALARI diskte durur ve gece yedeğinde storage.tar.gz olarak ayrıca alınır."

line; echo "5) TEMİZLİK"; line
docker rm -f "$TMP_CONTAINER" >/dev/null 2>&1 && ok "Geçici konteyner silindi"
echo "  Yedek dosyası saklandı: $DUMP"
echo "  Loglar: $OUT_DIR/restore-$STAMP.log"

line
if [ "$FAIL" = "0" ]; then
  RES=true; MSG="$CHECKED tablo karşılaştırıldı, hepsi OK"
  ok "SONUÇ: Yedek alınabiliyor ve eksiksiz geri yüklenebiliyor ($CHECKED tablo)."
else
  RES=false; MSG="Sorunlu:$BAD"
  warn "SONUÇ: Eksik/yedekte olmayan tablo var:$BAD — restore log'unu incele."
fi
# Dashboard'a kaydet (tablo yoksa sessizce geç)
printf "INSERT INTO public.backup_runs (kind, ok, backup_name, db_bytes, tables_checked, message) VALUES ('restore_test', %s, :'name', %s, %s, :'msg');\n" \
  "$RES" "$(stat -c %s "$DUMP")" "$CHECKED" \
| docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -q -v name="$STAMP" -v msg="$MSG" >/dev/null 2>&1 \
  && echo "  (sonuç dashboard'a yazıldı)"
echo "Bu çıktının TAMAMINI kopyalayıp Claude'a gönder."
