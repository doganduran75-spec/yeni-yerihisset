#!/usr/bin/env bash
# YeriHisset — SUNUCU GÜVENLİK TARAMASI (bir kerelik, SALT OKUNUR: hiçbir şeyi değiştirmez)
#
# Sunucunun güvenlik durumunu ✓ / ⚠ / ✗ ile, Türkçe açıklamalı listeler:
# SSH ayarları ve saldırı denemeleri, otomatik engelleme (fail2ban), güvenlik duvarı,
# İNTERNETE AÇIK KAPILAR (Docker güvenlik duvarını atlayabilir), otomatik güvenlik
# güncellemeleri, gizli dosyaların izinleri, kullanıcı hesapları, Caddy'nin yayınladığı
# alan adları. Çıktı kişisel veri / şifre içermez; Claude'a yapıştırılabilir.
#
# Kullanım:  bash /opt/yerihisset-app/scripts/server-audit.sh

set -uo pipefail
OK=0; WARN=0; BAD=0
ok()   { OK=$((OK+1));   echo "  ✓ $*"; }
warn() { WARN=$((WARN+1)); echo "  ⚠ $*"; }
bad()  { BAD=$((BAD+1));  echo "  ✗ $*"; }
info() { echo "    · $*"; }
sec()  { echo; echo "── $* ──"; }

echo "== SUNUCU GÜVENLİK TARAMASI — $(hostname) — $(date '+%F %T') =="
echo "   $(. /etc/os-release; echo "$PRETTY_NAME") · çekirdek $(uname -r)"

# ── 1) SSH ───────────────────────────────────────────────────────────────────
sec "1) SSH (sunucuya uzaktan bağlanma)"
SSHD=$(sshd -T 2>/dev/null)
get() { awk -v k="$1" '$1==k {print $2; exit}' <<< "$SSHD"; }
PORT=$(get port); ROOT=$(get permitrootlogin); PASS=$(get passwordauthentication); KBD=$(get kbdinteractiveauthentication)
info "port: ${PORT:-?} · root girişi: ${ROOT:-?} · şifreyle giriş: ${PASS:-?}"
KEYS=0; [ -s /root/.ssh/authorized_keys ] && KEYS=$(grep -cE '^(ssh|ecdsa|sk-)' /root/.ssh/authorized_keys)
info "root için kayıtlı SSH anahtarı: $KEYS"
if [ "$ROOT" = "yes" ] && [ "$PASS" = "yes" ]; then
  bad "root ŞİFREYLE girebiliyor — internetteki botlar sürekli şifre dener; tek koruma şifrenin gücü. Öneri: otomatik engelleme (fail2ban) + uzun vadede SSH anahtarıyla giriş."
elif [ "$PASS" = "yes" ]; then
  warn "Şifreyle giriş açık (root dışı). Öneri: SSH anahtarı."
else
  ok "Şifreyle giriş kapalı (yalnız anahtar)."
fi
FAILS24=$(journalctl -u ssh -u sshd --since "-24h" --no-pager -q 2>/dev/null | grep -cE "Failed password|Invalid user|authentication failure" || true)
IPS24=$(journalctl -u ssh -u sshd --since "-24h" --no-pager -q 2>/dev/null | grep -oP '(Failed password|Invalid user).* from \K[0-9a-fA-F.:]+' | sort -u | wc -l)
info "son 24 saatte başarısız giriş denemesi: $FAILS24 (farklı IP: $IPS24)"
if [ "$FAILS24" -ge 100 ]; then warn "Yoğun şifre deneme saldırısı var (normal internet gürültüsü ama engellenmeli)."; fi
F2B=$(systemctl is-active fail2ban 2>/dev/null || echo "kurulu değil")
if [ "$F2B" = "active" ]; then ok "fail2ban çalışıyor (şifre deneyenleri otomatik engelliyor)."
else bad "fail2ban yok/çalışmıyor ($F2B) — şifre deneyen IP'ler engellenmiyor."; fi
SUCC=$(journalctl -u ssh -u sshd --since "-30d" --no-pager -q 2>/dev/null | grep -oP 'Accepted \S+ for \S+ from \K[0-9a-fA-F.:]+' | sort | uniq -c | sort -rn)
info "son 30 günde başarılı giriş yapılan IP'ler (adet IP):"
if [ -n "$SUCC" ]; then while read -r l; do info "   $l"; done <<< "$SUCC"; else info "   (kayıt yok)"; fi

# ── 2) Güvenlik duvarı ───────────────────────────────────────────────────────
sec "2) Güvenlik duvarı"
if command -v ufw >/dev/null 2>&1; then
  UFW=$(ufw status 2>/dev/null | head -1)
  if grep -q "active" <<< "$UFW" && ! grep -q "inactive" <<< "$UFW"; then
    ok "ufw açık."; ufw status 2>/dev/null | sed -n '4,30p' | while read -r l; do [ -n "$l" ] && info "$l"; done
  else
    warn "ufw kapalı — sunucuda yazılım güvenlik duvarı yok (sağlayıcının güvenlik duvarı varsa onu da kontrol et)."
  fi
else
  warn "ufw kurulu değil."
fi
info "Not: Docker'ın yayınladığı kapılar ufw kurallarını ATLAR; asıl önemli olan aşağıdaki liste."

# ── 3) İnternete açık kapılar ────────────────────────────────────────────────
sec "3) İnternete açık kapılar (dinleyen servisler)"
PUBLIC=$(ss -tlnpH 2>/dev/null | awk '{print $4, $6}' | grep -vE '^(127\.|\[::1\]|::1:|\[::ffff:127\.)' )
while read -r addr proc; do
  [ -z "${addr:-}" ] && continue
  port="${addr##*:}"; name=$(grep -oP 'users:\(\("\K[^"]+' <<< "$proc" | head -1)
  case "$port" in
    22|"${PORT:-22}") ok "$port ($name) — SSH, beklenen." ;;
    80|443) ok "$port ($name) — site (Caddy), beklenen." ;;
    *) bad "$port ($name) dışarıya açık — beklenmiyor. İnternetten erişilebiliyorsa veritabanı / yönetim paneli riski. Yalnız 127.0.0.1'e bağlanmalı." ;;
  esac
done <<< "$(echo "$PUBLIC" | sort -u -t' ' -k1,1)"
info "Docker'ın yayınladığı kapılar:"
docker ps --format '{{.Names}}|{{.Ports}}' 2>/dev/null | while IFS='|' read -r n p; do
  [ -z "$p" ] && continue
  if grep -qE '0\.0\.0\.0:|\[::\]:|:::' <<< "$p"; then info "   ✗ $n → $p (TÜM ağlara açık)"; else info "   ✓ $n → $p"; fi
done

# ── 4) Güncellemeler ─────────────────────────────────────────────────────────
sec "4) Güncellemeler"
UU=$(systemctl is-enabled unattended-upgrades 2>/dev/null || echo "yok")
AUTO=$(apt-config dump 2>/dev/null | grep -E 'APT::Periodic::Unattended-Upgrade ' | grep -oE '"[0-9]+"' | tr -d '"')
if [ "$UU" = "enabled" ] && [ "${AUTO:-0}" != "0" ]; then ok "Otomatik güvenlik güncellemeleri açık."
else warn "Otomatik güvenlik güncellemeleri kapalı (unattended-upgrades: $UU, periyot: ${AUTO:-yok})."; fi
UPD=$(/usr/lib/update-notifier/apt-check 2>&1 || echo "?;?")
info "bekleyen güncelleme: ${UPD%%;*} (güvenlik: ${UPD##*;})"
[ -f /var/run/reboot-required ] && warn "Yeniden başlatma bekliyor." || ok "Yeniden başlatma gerekmiyor."

# ── 5) Gizli dosyaların izinleri ─────────────────────────────────────────────
sec "5) Gizli dosyalar (şifreler / anahtarlar)"
for f in /opt/yerihisset-app/.env.local /opt/yerihisset-app/.env /opt/yerihisset-app/.env.woo \
         /opt/yerihisset-supabase/.env /opt/yerihisset-supabase/.env.bak-20261002 \
         /root/yerihisset-supabase-secrets.txt /root/.config/rclone/rclone.conf; do
  [ -e "$f" ] || continue
  P=$(stat -c '%a' "$f"); O=$(stat -c '%U' "$f")
  if [ "$O" = "root" ] && [ "${P: -1}" = "0" ] && [ "${P: -2:1}" = "0" ]; then ok "$f ($P, $O)"
  elif [ "${P: -1}" != "0" ]; then bad "$f HERKES TARAFINDAN OKUNABİLİR ($P) — chmod 600 yapılmalı."
  else warn "$f ($P, $O) — 600 olması önerilir."; fi
done
[ -e /opt/yerihisset-app/.env.woo ] && info "  .env.woo aktarım bittiyse silinebilir (WooCommerce anahtarları)."

# ── 6) Kullanıcılar ──────────────────────────────────────────────────────────
sec "6) Kullanıcı hesapları"
SHELLS=$(awk -F: '$7 ~ /(bash|sh|zsh)$/ {print $1}' /etc/passwd | paste -sd' ' -)
info "kabuk (giriş) yetkisi olan hesaplar: $SHELLS"
UID0=$(awk -F: '$3==0 {print $1}' /etc/passwd | paste -sd' ' -)
[ "$UID0" = "root" ] && ok "Yalnız root yönetici (uid 0)." || bad "Birden fazla uid 0 hesabı: $UID0"
EMPTY=$(awk -F: '($2=="") {print $1}' /etc/shadow 2>/dev/null | paste -sd' ' -)
[ -z "$EMPTY" ] && ok "Şifresiz hesap yok." || bad "Şifresiz hesap(lar): $EMPTY"

# ── 7) Yayındaki alan adları (Caddy) ─────────────────────────────────────────
sec "7) Caddy'nin yayınladığı adresler"
if [ -f /etc/caddy/Caddyfile ]; then
  grep -E '^[^#[:space:]][^{]*\{' /etc/caddy/Caddyfile | sed 's/{//' | while read -r site; do
    BLOCK=$(awk -v s="$site" 'index($0,s)==1 {f=1} f {print} f && /^}/ {exit}' /etc/caddy/Caddyfile)
    if grep -qiE 'basic_?auth' <<< "$BLOCK"; then info "$site → şifre korumalı (basic auth)"; else info "$site → herkese açık"; fi
  done
  info "(Supabase Studio / yönetim panelleri herkese açık olmamalı.)"
else
  info "Caddyfile bulunamadı."
fi

# ── 8) Docker ────────────────────────────────────────────────────────────────
sec "8) Docker"
if ss -tlnH 2>/dev/null | grep -qE ':2375|:2376'; then bad "Docker uzaktan yönetim kapısı açık (2375/2376) — çok tehlikeli."
else ok "Docker uzaktan yönetime kapalı."; fi
ZOMBIE=$(ps -eo stat= | grep -c '^Z' || true)
[ "$ZOMBIE" -lt 20 ] && ok "Zombi süreç: $ZOMBIE" || warn "Zombi süreç: $ZOMBIE"

echo
echo "== ÖZET: ✓ $OK  ⚠ $WARN  ✗ $BAD =="
echo "Bu çıktıyı Claude'a yapıştır; ✗ ve ⚠ maddeleri sırayla birlikte kapatılacak."
