#!/usr/bin/env bash
# YeriHisset — SUNUCU GÜNCELLEME (panel › Ayrıntı › Sunucu Sağlığı › Güncellemeler › "Ne yapmalıyım?")
#
#   bash /opt/yerihisset-app/scripts/server-update.sh           → bekleyen güncellemeleri yükler, sonucu söyler
#   bash /opt/yerihisset-app/scripts/server-update.sh --reboot  → yeniden başlatma hazırlığını denetler, sunucuyu yeniden başlatır
#
# Çıktının sonunda tek bir "SONUÇ" satırı vardır: TAMAM / YENİDEN BAŞLATMA GEREKİYOR / HATA (→ Claude'a danış).
# Yeniden başlatmada Docker (Supabase) ve pm2 (site) kendiliğinden kalkmalı: --reboot bunu önce denetler,
# pm2'nin açılışta başlaması kurulu değilse kurar; bir konteynerin yeniden başlama kuralı yoksa durur.
set -uo pipefail
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
for d in /root/.nvm/versions/node/*/bin; do [ -d "$d" ] && PATH="$PATH:$d"; done
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
APP_DIR="${APP_DIR:-/opt/yerihisset-app}"
LOG=/var/log/yerihisset-update.log

line() { printf '%s\n' "────────────────────────────────────────────────────────────"; }
fail() { line; echo "SONUÇ: ✗ HATA — $1"; echo "→ Bu çıktının tamamını kopyalayıp Claude'a danış. (Ayrıntılı kayıt: $LOG)"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "root olarak çalıştırılmalı (sudo -i)."; exit 1; }

# Yeniden başlatma sonrası her şey kendiliğinden kalkar mı? (fix=true → düzeltilebileni düzeltir)
READY_MSG=()
ready() {
  local fix="$1" okk=true
  READY_MSG=()
  if [ "$(systemctl is-enabled docker 2>/dev/null)" = enabled ]; then READY_MSG+=("✓ Docker açılışta başlıyor")
  elif $fix && systemctl enable docker >/dev/null 2>&1; then READY_MSG+=("✓ Docker açılışta başlayacak şekilde ayarlandı")
  else READY_MSG+=("✗ Docker açılışta başlamıyor"); okk=false; fi
  local nopol
  nopol=$(docker ps --format '{{.Names}}' 2>/dev/null | while read -r n; do
    p=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$n" 2>/dev/null)
    case "$p" in always|unless-stopped|on-failure) ;; *) printf '%s ' "$n" ;; esac
  done)
  if [ -z "$nopol" ]; then READY_MSG+=("✓ Konteynerler ($(docker ps -q | wc -l)) kendiliğinden yeniden başlıyor")
  else READY_MSG+=("✗ Yeniden başlama kuralı olmayan konteyner: $nopol"); okk=false; fi
  if command -v pm2 >/dev/null 2>&1; then
    if [ "$(systemctl is-enabled pm2-root 2>/dev/null)" = enabled ]; then READY_MSG+=("✓ Site (pm2) açılışta başlıyor")
    elif $fix && pm2 startup systemd -u root --hp /root >>"$LOG" 2>&1 && [ "$(systemctl is-enabled pm2-root 2>/dev/null)" = enabled ]; then
      READY_MSG+=("✓ Site (pm2) açılışta başlayacak şekilde ayarlandı")
    else READY_MSG+=("$($fix && echo ✗ || echo •) Site (pm2) açılışta başlama kurulu değil$($fix || echo ' — --reboot kurar')"); $fix && okk=false; fi
    $fix && { pm2 save >>"$LOG" 2>&1 && READY_MSG+=("✓ Çalışan site süreçleri kaydedildi (pm2 save)") || { READY_MSG+=("✗ pm2 save başarısız"); okk=false; }; }
  else READY_MSG+=("✗ pm2 bulunamadı"); okk=false; fi
  if systemctl list-unit-files caddy.service >/dev/null 2>&1 && systemctl list-unit-files caddy.service | grep -q caddy; then
    if [ "$(systemctl is-enabled caddy 2>/dev/null)" = enabled ]; then READY_MSG+=("✓ Caddy (https) açılışta başlıyor")
    else READY_MSG+=("✗ Caddy açılışta başlamıyor"); okk=false; fi
  fi
  $okk
}

# ── --reboot ─────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--reboot" ]; then
  echo "YeriHisset — yeniden başlatma"; line
  if [ ! -f /var/run/reboot-required ]; then line; echo "SONUÇ: ✓ TAMAM — yeniden başlatma gerekmiyor, bir şey yapılmadı."; exit 0; fi
  if [ -f /run/yerihisset-deploying ] && [ $(( $(date +%s) - $(cat /run/yerihisset-deploying 2>/dev/null || echo 0) )) -lt 1200 ]; then
    fail "şu an dağıtım (deploy) sürüyor; bitince tekrar çalıştır."
  fi
  echo "Gerektiren paketler: $(sort -u /var/run/reboot-required.pkgs 2>/dev/null | paste -sd' ' - || echo '?')"
  ready true; R=$?
  printf '%s\n' "${READY_MSG[@]}"
  [ $R -eq 0 ] || fail "yeniden başlatma sonrası her şey kendiliğinden kalkmayabilir; yeniden başlatılmadı."
  line
  echo "SONUÇ: ↻ Sunucu 10 saniye içinde yeniden başlıyor (iptal: Ctrl+C)."
  echo "→ SSH bağlantın kopacak. Site ~2-3 dakika kapalı olur."
  echo "→ 5 dakika sonra panelde Ayrıntı › Sunucu Sağlığı'na bak (Ctrl+Shift+R); 15 dk içindeki kontrolde her şey yeşil olmalı."
  echo "$(date '+%F %T') reboot (server-update.sh)" >>"$LOG"
  sleep 10
  systemctl reboot
  exit 0
fi

# ── Güncelleme ───────────────────────────────────────────────────────────────
echo "YeriHisset — sunucu güncellemesi ($(date '+%d.%m.%Y %H:%M'))"; line
echo "$(date '+%F %T') ===== güncelleme başladı" >>"$LOG"
echo "1/4 Paket listesi yenileniyor…"
apt-get update -q >>"$LOG" 2>&1 || fail "paket listesi yenilenemedi (apt-get update)."

PKGS=$(apt list --upgradable 2>/dev/null | tail -n +2 | cut -d/ -f1)
N=$(printf '%s' "$PKGS" | grep -c . || true)
if [ "$N" -eq 0 ]; then
  echo "   Yüklenecek güncelleme yok."
else
  echo "   $N paket: $(printf '%s' "$PKGS" | head -20 | paste -sd' ' -)$([ "$N" -gt 20 ] && echo ' …')"
  if printf '%s' "$PKGS" | grep -qE '^(docker|containerd)'; then
    echo
    echo "   ⚠ Docker güncelleniyor: veritabanı ve site ~1 dakika kesilebilir (konteynerler kendiliğinden geri gelir)."
    if [ -t 0 ]; then read -r -p "   Devam edilsin mi? (e/h) " a; [ "$a" = e ] || [ "$a" = E ] || { line; echo "SONUÇ: Vazgeçildi — bir şey yüklenmedi. Sakin bir saatte tekrar çalıştır."; exit 0; }; fi
  fi
fi

echo "2/4 Güncellemeler yükleniyor (birkaç dakika sürebilir)…"
if [ "$N" -gt 0 ]; then
  apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold --with-new-pkgs upgrade >>"$LOG" 2>&1 \
    || { tail -n 15 "$LOG"; fail "güncelleme yüklenirken hata çıktı (son satırlar yukarıda)."; }
fi
LEFT=$(/usr/lib/update-notifier/apt-check 2>&1 || echo "?;?")
echo "   Kalan: ${LEFT%%;*} paket (güvenlik: ${LEFT##*;})$([ "${LEFT%%;*}" != 0 ] && echo ' — Ubuntu bazılarını kademeli dağıtır, sonraki günlerde gelir; sorun değil')"

echo "3/4 Site ve veritabanı kontrol ediliyor…"
sleep 5
DOWN=$(docker ps -a --format '{{.Names}}|{{.State}}' 2>/dev/null | awk -F'|' '$2 != "running" {print $1}' | paste -sd, -)
CODE=$(curl -s -o /dev/null -m 15 -w '%{http_code}' http://127.0.0.1:3000/ || echo 000)
[ -z "$DOWN" ] && echo "   ✓ Konteynerler çalışıyor" || echo "   ✗ Çalışmayan konteyner: $DOWN"
[ "${CODE:0:1}" = 2 ] || [ "${CODE:0:1}" = 3 ] && echo "   ✓ Site yanıt veriyor (HTTP $CODE)" || echo "   ✗ Site yanıt vermiyor (HTTP $CODE)"

echo "4/4 Panel durumu yenileniyor…"
bash "$APP_DIR/scripts/server-health.sh" --quiet >>"$LOG" 2>&1 || true

line
if [ -n "$DOWN" ] || ! { [ "${CODE:0:1}" = 2 ] || [ "${CODE:0:1}" = 3 ]; }; then
  fail "güncelleme sonrası site / veritabanı çalışmıyor."
fi
if [ -f /var/run/reboot-required ]; then
  echo "Yeniden başlatma isteyen paketler: $(sort -u /var/run/reboot-required.pkgs 2>/dev/null | paste -sd' ' - || echo '?')"
  ready false
  printf '   %s\n' "${READY_MSG[@]}"
  line
  echo "SONUÇ: ↻ YÜKLENDİ, YENİDEN BAŞLATMA GEREKİYOR"
  echo "→ Sakin bir saatte (site ~2-3 dk kapanır) şunu çalıştır:"
  echo "   bash $APP_DIR/scripts/server-update.sh --reboot"
else
  echo "SONUÇ: ✓ TAMAM — güncellemeler yüklendi, yeniden başlatma gerekmiyor."
  echo "→ Paneli yenile (Ctrl+Shift+R); uyarı kalkmış olmalı."
fi
echo "$(date '+%F %T') ===== bitti" >>"$LOG"
