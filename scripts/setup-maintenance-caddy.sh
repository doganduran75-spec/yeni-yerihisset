#!/usr/bin/env bash
# BAKIM SAYFASINI CADDY'YE EKLER (bir kez çalıştırılır) — docs/BAKIM-SAYFASI.md
# Site (pm2) yanıt vermezse (deploy sırasında / çökmede) Caddy 502 yerine maintenance/index.html gösterir.
# Güvenli: önce yedek alır, "caddy validate" geçmezse yedeği geri koyar, geçerse Caddy'yi yeniden yükler.
#
# Kullanım:  bash scripts/setup-maintenance-caddy.sh                 (dev.yerihisset.com)
#            bash scripts/setup-maintenance-caddy.sh yerihisset.com  (canlı)
set -euo pipefail
CF=/etc/caddy/Caddyfile
DOMAIN="${1:-dev.yerihisset.com}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

[ -f "$CF" ] || { echo "✗ $CF bulunamadı"; exit 1; }
if grep -q "$APP_DIR/maintenance" "$CF"; then echo "✓ Bakım sayfası zaten tanımlı."; exit 0; fi
BACKUP="$CF.bak-$(date +%Y%m%d-%H%M%S)"
cp "$CF" "$BACKUP"
echo "▸ Yedek: $BACKUP"

python3 - "$CF" "$DOMAIN" "$APP_DIR" <<'PY'
import re, sys
path, dom, app = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding="utf-8").read()
m = re.search(r'(?m)^[^\n#]*(?<![\w.-])' + re.escape(dom) + r'(?![\w.-])[^\n{]*\{', s)
if not m:
    sys.exit(f"✗ '{dom}' site bloğu bulunamadı — docs/BAKIM-SAYFASI.md'deki gibi elle ekle")
i, depth = m.end(), 1
while i < len(s) and depth:
    depth += {"{": 1, "}": -1}.get(s[i], 0)
    i += 1
if depth:
    sys.exit("✗ site bloğunun sonu bulunamadı")
end = i - 1
block = f"""
	# Bakım sayfası (scripts/setup-maintenance-caddy.sh): site yanıt vermezse
	handle_errors {{
		@down expression `{{err.status_code}} in [502, 503, 504]`
		handle @down {{
			root * {app}/maintenance
			rewrite * /index.html
			header Cache-Control "no-store"
			header Retry-After "10"
			file_server {{
				status 503
			}}
		}}
	}}
"""
open(path, "w", encoding="utf-8").write(s[:end].rstrip() + "\n" + block + s[end:])
print("▸ Blok eklendi:", dom)
PY

if caddy validate --config "$CF" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  systemctl reload caddy
  echo "✓ Bakım sayfası etkin. Denemek için: pm2 stop yerihisset → siteyi aç → pm2 start yerihisset"
else
  cp "$BACKUP" "$CF"
  echo "✗ Caddy ayarı doğrulanamadı, eski ayar geri yüklendi. Hata:"
  tail -5 /tmp/caddy-validate.log
  exit 1
fi
