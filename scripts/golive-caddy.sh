#!/usr/bin/env bash
# CANLIYA GEÇİŞ — CADDY: yerihisset.com + www bloklarını ekler (bir kez; DNS yeni sunucuyu gösterdikten HEMEN SONRA).
# Neden DNS'ten sonra: Caddy blok eklenince sertifika ister; DNS eski sunucudaysa istek düşer ve tekrar deneme
# giderek seyrekleşir. DNS değişince eklenirse sertifika genelde 1–2 dakikada gelir.
#   yerihisset.com      → uygulama (127.0.0.1:3000), şifre kapısı YOK, noindex YOK, bakım sayfası var,
#                         eski WordPress bot adresleri (xmlrpc, wp-login, wp-admin, wp-json) → 410
#   www.yerihisset.com  → kalıcı olarak yerihisset.com (eski site de böyleydi; Google kayıtları kökte)
# dev.yerihisset.com ve supabase bloklarına DOKUNMAZ. Güvenli: yedek alır, "caddy validate" geçmezse geri koyar.
# Kullanım:  bash scripts/golive-caddy.sh
set -euo pipefail
CF=/etc/caddy/Caddyfile
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NEW_IP=169.58.225.68

[ -f "$CF" ] || { echo "✗ $CF bulunamadı"; exit 1; }
if grep -qE '^yerihisset\.com[[:space:]]*\{' "$CF"; then echo "✓ yerihisset.com zaten tanımlı — bir şey yapılmadı."; exit 0; fi

# DNS kontrolü (uyarı): ad sunucusuna doğrudan sor
NOW_IP=$(getent ahostsv4 yerihisset.com 2>/dev/null | awk 'NR==1{print $1}')
if [ "$NOW_IP" != "$NEW_IP" ]; then
  echo "⚠ Bu sunucudan yerihisset.com hâlâ $NOW_IP görünüyor (beklenen $NEW_IP)."
  echo "  gkg panelinde @ ve www kaydını $NEW_IP yaptıysan birkaç dakika bekleyip yeniden çalıştır."
  exit 1
fi

BACKUP="$CF.bak-$(date +%Y%m%d-%H%M%S)"
cp "$CF" "$BACKUP"
echo "▸ Yedek: $BACKUP"

cat >> "$CF" <<EOF

# ── CANLI SİTE (scripts/golive-caddy.sh, $(date +%Y-%m-%d)) ──
yerihisset.com {
	# Eski WordPress'e saldıran botlar uygulamaya ulaşmasın
	@wpbot path /xmlrpc.php /wp-login.php /wp-admin /wp-admin/* /wp-json /wp-json/*
	respond @wpbot 410

	reverse_proxy 127.0.0.1:3000

	# Bakım sayfası: site yanıt vermezse (deploy sırasında / çökmede)
	handle_errors {
		@down expression \`{err.status_code} in [502, 503, 504]\`
		handle @down {
			root * $APP_DIR/maintenance
			rewrite * /index.html
			header Cache-Control "no-store"
			header Retry-After "10"
			file_server {
				status 503
			}
		}
	}
}

www.yerihisset.com {
	redir https://yerihisset.com{uri} permanent
}
EOF

if caddy validate --config "$CF" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  systemctl reload caddy
  echo "✓ Caddy güncellendi. Sertifika 1–2 dakikada gelir; kontrol:"
  echo "  curl -sI https://yerihisset.com | head -3"
else
  cp "$BACKUP" "$CF"
  echo "✗ Caddy ayarı doğrulanamadı, eski ayar geri yüklendi. Hata:"
  tail -5 /tmp/caddy-validate.log
  exit 1
fi
