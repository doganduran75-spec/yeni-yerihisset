#!/usr/bin/env bash
# YeriHisset — SUNUCU SAĞLIK KONTROLÜ (her 15 dakikada, cron)
#
# Kontroller: disk, bellek, yük, Supabase konteynerleri, site süreçleri (pm2),
# zombi süreçler, güncellemeler / yeniden başlatma, saat senkronu, SSL sertifikası,
# sitenin yanıt vermesi, SSH şifre denemeleri ve YENİ bir IP'den sunucu girişi.
# Sonuç public.server_health_runs tablosuna yazılır → admin dashboard'daki
# "Sunucu Sağlığı" kartı. Ardından uygulamaya haber verilir; sorun varsa
# yöneticiye e-posta gider (/api/cron/server-health; aynı sorun tekrar tekrar gönderilmez).
# Yedek ve pazaryeri senkronu kontrolleri uygulama tarafında eklenir.
#
# Kurulum (bir kez):  bash /opt/yerihisset-app/scripts/server-health.sh --install
# Elle çalıştırma:    bash /opt/yerihisset-app/scripts/server-health.sh
# Cron:   /etc/cron.d/yerihisset-health (15 dakikada bir, --quiet)
# Log:    /var/log/yerihisset-health.log
# Durum:  /var/lib/yerihisset-health (bilinen SSH IP'leri, son çalışma)

set -uo pipefail
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
for d in /root/.nvm/versions/node/*/bin; do [ -d "$d" ] && PATH="$PATH:$d"; done

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
APP_DIR="${APP_DIR:-/opt/yerihisset-app}"
STATE_DIR="${STATE_DIR:-/var/lib/yerihisset-health}"
DOMAINS="${HEALTH_DOMAINS:-dev.yerihisset.com}"
APP_URL="${HEALTH_APP_URL:-http://127.0.0.1:3000}"
QUIET=false; [ "${1:-}" = "--quiet" ] && QUIET=true

# ── Kurulum ──────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--install" ]; then
  cat > /etc/cron.d/yerihisset-health <<EOF
# YeriHisset sunucu sağlık kontrolü (scripts/server-health.sh)
*/15 * * * * root /bin/bash $APP_DIR/scripts/server-health.sh --quiet >> /var/log/yerihisset-health.log 2>&1
EOF
  chmod 644 /etc/cron.d/yerihisset-health
  cat > /etc/logrotate.d/yerihisset-health <<'EOF'
/var/log/yerihisset-health.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
}
EOF
  echo "✓ Cron kuruldu: /etc/cron.d/yerihisset-health (15 dakikada bir). İlk kontrol şimdi çalışıyor…"
  echo
  exec /bin/bash "$0"
fi

mkdir -p "$STATE_DIR" && chmod 700 "$STATE_DIR"
NOW=$(date +%s)

CHECKS=()
WORST=ok
esc() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/ }"; s="${s//$'\t'/ }"; s="${s//$'\r'/}"; printf '%s' "$s"; }
add() { # key status label value hint [alert]
  local key="$1" st="$2" label="$3" value="$4" hint="$5" alert="${6:-false}"
  CHECKS+=("{\"key\":\"$(esc "$key")\",\"status\":\"$st\",\"label\":\"$(esc "$label")\",\"value\":\"$(esc "$value")\",\"hint\":\"$(esc "$hint")\",\"alert\":$alert}")
  case "$st" in fail) WORST=fail ;; warn) [ "$WORST" = ok ] && WORST=warn ;; esac
  if ! $QUIET; then
    case "$st" in ok) m="✓" ;; warn) m="⚠" ;; *) m="✗" ;; esac
    printf '%s %-26s %s%s\n' "$m" "$label" "$value" "${hint:+  → $hint}"
  fi
}

# 1) Disk
DISK=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
if   [ "${DISK:-0}" -ge 90 ]; then add disk fail "Disk" "%$DISK dolu" "Disk neredeyse dolu; eski yedekler ve loglar temizlenmeli."
elif [ "${DISK:-0}" -ge 80 ]; then add disk warn "Disk" "%$DISK dolu" "Disk dolmaya başladı; yer açılması planlanmalı."
else add disk ok "Disk" "%$DISK dolu" ""; fi

# 2) Bellek (kullanılan = toplam - kullanılabilir)
MEM=$(free -m | awk '/^Mem:/ {printf "%d", ($2-$7)*100/$2}')
if   [ "${MEM:-0}" -ge 95 ]; then add memory fail "Bellek" "%$MEM kullanımda" "Bellek bitmek üzere; site yavaşlayabilir veya çökebilir."
elif [ "${MEM:-0}" -ge 85 ]; then add memory warn "Bellek" "%$MEM kullanımda" "Bellek yüksek; yeniden başlatma veya inceleme gerekebilir."
else add memory ok "Bellek" "%$MEM kullanımda" ""; fi

# 3) İşlemci yükü (15 dk ortalaması / çekirdek sayısı)
CPUS=$(nproc 2>/dev/null || echo 1)
LOAD15=$(awk '{print $3}' /proc/loadavg)
LOADPCT=$(awk -v l="$LOAD15" -v c="$CPUS" 'BEGIN {printf "%d", l*100/c}')
if   [ "$LOADPCT" -ge 300 ]; then add load fail "İşlemci yükü" "$LOAD15 ($CPUS çekirdek)" "Sunucu aşırı yüklü; site yavaşlar."
elif [ "$LOADPCT" -ge 150 ]; then add load warn "İşlemci yükü" "$LOAD15 ($CPUS çekirdek)" "Yük uzun süredir yüksek."
else add load ok "İşlemci yükü" "$LOAD15 ($CPUS çekirdek)" ""; fi

# 4) Supabase konteynerleri (aynı compose projesindekiler)
PROJECT=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$DB_CONTAINER" 2>/dev/null || true)
if [ -z "$PROJECT" ]; then
  add containers fail "Veritabanı / Supabase" "veritabanı konteyneri bulunamadı" "Supabase çalışmıyor olabilir: docker ps ile kontrol edilmeli."
else
  BAD=$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Names}}|{{.State}}|{{.Status}}' \
        | awk -F'|' '$2 != "running" || $3 ~ /unhealthy/ {print $1}' | paste -sd, -)
  TOTAL=$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" -q | wc -l)
  if [ -n "$BAD" ]; then add containers fail "Supabase konteynerleri" "sorunlu: $BAD" "Bu servisler durmuş veya sağlıksız; site/ödeme etkilenebilir."
  else add containers ok "Supabase konteynerleri" "$TOTAL/$TOTAL çalışıyor" ""; fi
fi

# Dağıtım sürüyor mu? (scripts/deploy.sh işareti; 20 dakikadan eskiyse dikkate alınmaz)
DEPLOYING=false
if [ -f /run/yerihisset-deploying ]; then
  DEP_AGE=$(( $(date +%s) - $(cat /run/yerihisset-deploying 2>/dev/null || echo 0) ))
  [ "$DEP_AGE" -lt 1200 ] && DEPLOYING=true
fi

# 5) Site süreçleri (pm2)
if command -v pm2 >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  read -r PM_TOTAL PM_ON PM_UNSTABLE < <(pm2 jlist 2>/dev/null | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{ try {
      const a=JSON.parse(s.slice(s.indexOf("[")));
      console.log(a.length, a.filter(p=>p.pm2_env.status==="online").length, a.reduce((x,p)=>x+(p.pm2_env.unstable_restarts||0),0));
    } catch { console.log("0 0 0"); } });' 2>/dev/null || echo "0 0 0")
  if $DEPLOYING && [ "${PM_ON:-0}" -lt "${PM_TOTAL:-1}" ]; then add app warn "Site uygulaması" "dağıtım sürüyor (${PM_ON:-0}/${PM_TOTAL:-0})" "Güncelleme sırasında site birkaç dakika durur; normal."
  elif [ "${PM_TOTAL:-0}" -eq 0 ]; then add app fail "Site uygulaması" "çalışan süreç yok" "Site kapalı olabilir: pm2 status ile kontrol edilmeli."
  elif [ "${PM_ON:-0}" -lt "${PM_TOTAL:-0}" ]; then add app fail "Site uygulaması" "$PM_ON/$PM_TOTAL süreç çalışıyor" "Bazı site süreçleri durmuş."
  elif [ "${PM_UNSTABLE:-0}" -gt 0 ]; then add app warn "Site uygulaması" "$PM_ON/$PM_TOTAL çalışıyor, $PM_UNSTABLE çökme" "Site süreçleri çöküp yeniden başlıyor; log incelenmeli."
  else add app ok "Site uygulaması" "$PM_ON/$PM_TOTAL süreç çalışıyor" ""; fi
else
  add app warn "Site uygulaması" "pm2 bulunamadı" "Kontrol betiği pm2'ye erişemedi."
fi

# 6) Site dışarıdan yanıt veriyor mu (Caddy üzerinden; şifreli staging'de 401 da "çalışıyor" demek)
for D in $DOMAINS; do
  CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 --resolve "$D:443:127.0.0.1" "https://$D/" 2>/dev/null || echo 000)
  if $DEPLOYING && { [ "$CODE" = "000" ] || [ "${CODE:0:1}" = "5" ]; }; then add "site:$D" warn "Site ($D)" "dağıtım sürüyor (HTTP $CODE)" "Güncelleme sırasında site birkaç dakika durur; normal."
  elif [ "$CODE" = "000" ] || [ "${CODE:0:1}" = "5" ]; then add "site:$D" fail "Site ($D)" "yanıt yok (HTTP $CODE)" "Site açılmıyor."
  else add "site:$D" ok "Site ($D)" "yanıt veriyor (HTTP $CODE)" ""; fi

  # 7) SSL sertifikası
  END=$(echo | timeout 15 openssl s_client -servername "$D" -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -z "$END" ]; then add "ssl:$D" warn "SSL ($D)" "sertifika okunamadı" "HTTPS sertifikası kontrol edilmeli."
  else
    DAYS=$(( ($(date -d "$END" +%s) - NOW) / 86400 ))
    if   [ "$DAYS" -lt 5 ];  then add "ssl:$D" fail "SSL ($D)" "$DAYS gün kaldı" "Sertifika yenilenmiyor; Caddy logları incelenmeli."
    elif [ "$DAYS" -lt 14 ]; then add "ssl:$D" warn "SSL ($D)" "$DAYS gün kaldı" "Caddy normalde 30 gün kala yeniler; yenilenmemiş."
    else add "ssl:$D" ok "SSL ($D)" "$DAYS gün geçerli" ""; fi
  fi
done

# 8) Zombi süreçler
ZOMBIE=$(ps -eo stat= | grep -c '^Z' || true)
if   [ "$ZOMBIE" -ge 100 ]; then add zombies fail "Zombi süreçler" "$ZOMBIE" "Bir servis biten süreçleri toplamıyor; kaynağı bulunmalı."
elif [ "$ZOMBIE" -ge 20 ];  then add zombies warn "Zombi süreçler" "$ZOMBIE" "Birikiyor; kaynağı incelenmeli."
else add zombies ok "Zombi süreçler" "$ZOMBIE" ""; fi

# 9) Güncellemeler + yeniden başlatma
UPD=$(/usr/lib/update-notifier/apt-check 2>&1 || echo "0;0")
UPD_ALL=${UPD%%;*}; UPD_SEC=${UPD##*;}
if [ -f /var/run/reboot-required ]; then
  add updates warn "Güncellemeler" "yeniden başlatma bekliyor (güvenlik: $UPD_SEC, toplam: $UPD_ALL)" "Güncellemelerin bir kısmı yeniden başlatmadan sonra devreye girer; sakin bir saatte bakım yapılmalı."
elif [ "${UPD_SEC:-0}" -gt 0 ] 2>/dev/null; then
  add updates warn "Güncellemeler" "$UPD_SEC güvenlik güncellemesi bekliyor (toplam $UPD_ALL)" "Güvenlik güncellemeleri yüklenmeli (apt upgrade)."
else
  add updates ok "Güncellemeler" "güvenlik güncellemesi yok (toplam $UPD_ALL)" ""
fi

# 10) Saat senkronu (SSL, ödeme ve pazaryeri imzaları doğru saate bağlı)
NTP=$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo "?")
if [ "$NTP" = "yes" ]; then add clock ok "Saat senkronu" "senkron" ""
else add clock warn "Saat senkronu" "senkron değil ($NTP)" "Sunucu saati kayabilir; timedatectl ile kontrol edilmeli."; fi

# 11) SSH: şifre denemeleri (24 saat) + YENİ bir IP'den başarılı giriş
SSH_LOG() { journalctl -u ssh -u sshd --since "$1" --no-pager -q 2>/dev/null; }
FAILS=$(SSH_LOG "-24h" | grep -cE "Failed password|Invalid user|authentication failure" || true)
F2B=$(systemctl is-active fail2ban 2>/dev/null || echo "yok")
if [ "$FAILS" -ge 300 ] && [ "$F2B" != "active" ]; then
  add ssh_attempts warn "SSH şifre denemeleri" "$FAILS deneme / 24 saat (otomatik engel: kapalı)" "Sunucuya şifre deneme saldırısı var; otomatik engelleme (fail2ban) kurulmalı."
else
  add ssh_attempts ok "SSH şifre denemeleri" "$FAILS deneme / 24 saat (otomatik engel: $F2B)" ""
fi

KNOWN="$STATE_DIR/known_ips"; RECENT="$STATE_DIR/new_ip_logins"; LAST_RUN_FILE="$STATE_DIR/last_run"
if [ ! -f "$KNOWN" ]; then
  # İlk çalışma: bugüne kadarki giriş IP'lerini "bilinen" kabul et (uyarı yok)
  { last -i -a 2>/dev/null | awk '{print $NF}'; SSH_LOG "-30d" | grep -oP 'Accepted \S+ for \S+ from \K[0-9a-fA-F.:]+'; } \
    | grep -E '^[0-9a-fA-F.:]+$' | grep -vE '^0\.0\.0\.0$' | sort -u > "$KNOWN"
  touch "$RECENT"
fi
SINCE="-20min"; [ -f "$LAST_RUN_FILE" ] && SINCE="@$(cat "$LAST_RUN_FILE")"
while read -r IP; do
  [ -z "$IP" ] && continue
  if ! grep -qxF "$IP" "$KNOWN"; then
    echo "$IP" >> "$KNOWN"
    echo "$NOW $IP" >> "$RECENT"
  fi
done < <(SSH_LOG "$SINCE" | grep -oP 'Accepted \S+ for \S+ from \K[0-9a-fA-F.:]+' | sort -u)
echo "$NOW" > "$LAST_RUN_FILE"
# Son 24 saatteki yeni-IP girişleri kartta görünsün (ve bir kez e-posta gitsin)
awk -v n="$NOW" '$1 > n-86400' "$RECENT" > "$RECENT.tmp" 2>/dev/null && mv "$RECENT.tmp" "$RECENT"
NEWIPS=0
while read -r TS IP; do
  [ -z "${IP:-}" ] && continue
  NEWIPS=$((NEWIPS+1))
  add "ssh_new_ip:$IP" warn "Yeni IP'den sunucu girişi" "$IP — $(date -d "@$TS" '+%d.%m %H:%M')" "Bu giriş sen değilsen sunucu şifresini hemen değiştir ve bana haber ver." true
done < "$RECENT"
[ "$NEWIPS" -eq 0 ] && add ssh_logins ok "Sunucu girişleri" "bilinmeyen IP'den giriş yok" ""

# ── Kaydet + uygulamaya haber ver ───────────────────────────────────────────
JSON="[$(IFS=,; echo "${CHECKS[*]}")]"
if ! printf "INSERT INTO public.server_health_runs (status, checks) VALUES (:'st', :'checks'::jsonb);\nDELETE FROM public.server_health_runs WHERE created_at < now() - interval '14 days';\n" \
  | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -v st="$WORST" -v checks="$JSON" >/dev/null 2>"$STATE_DIR/db.err"; then
  echo "[$(date '+%F %T')] HATA: sonuç veritabanına yazılamadı: $(tail -2 "$STATE_DIR/db.err" | tr '\n' ' ')"
fi

SECRET=$(grep -hE '^CRON_SECRET=' "$APP_DIR/.env.local" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'\r")
if [ -n "$SECRET" ]; then
  RES=$(curl -s -m 60 -X POST -H "x-cron-secret: $SECRET" "$APP_URL/api/cron/server-health" 2>/dev/null || echo "bağlanılamadı")
  case "$RES" in *'"ok":true'*) ;; *) echo "[$(date '+%F %T')] UYARI: uyarı servisi yanıtı: ${RES:0:200}" ;; esac
fi

$QUIET || echo -e "\nGenel durum: $WORST  (sonuç dashboard'daki 'Sunucu Sağlığı' kartında)"
exit 0
