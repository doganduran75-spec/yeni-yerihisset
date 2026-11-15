#!/usr/bin/env bash
# CANLIYA GEÇİŞ — UYGULAMA AYARLARI (.env.local): site adresi + iyzico canlı adresi. Anahtarları YAZMAZ.
#   NEXT_PUBLIC_SITE_URL → https://yerihisset.com   (e-posta bağlantıları, iyzico dönüşü, Google adresleri)
#   IYZICO_BASE_URL      → https://api.iyzipay.com  (sandbox → canlı)
# iyzico CANLI API / güvenlik anahtarlarını kullanıcı kendisi yazar (nano .env.local: IYZICO_API_KEY, IYZICO_SECRET_KEY).
# Değişiklik deploy ile etkinleşir (NEXT_PUBLIC_ değeri derlemeye gömülür). Yedek alır.
# Kullanım:  bash scripts/golive-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.local
[ -f "$F" ] || { echo "✗ $F bulunamadı"; exit 1; }
cp "$F" "$F.bak-$(date +%Y%m%d-%H%M%S)"
setv() { if grep -q "^$1=" "$F"; then sed -i "s#^$1=.*#$1=$2#" "$F"; else echo "$1=$2" >> "$F"; fi; }
setv NEXT_PUBLIC_SITE_URL https://yerihisset.com
setv IYZICO_BASE_URL https://api.iyzipay.com
echo "✓ Ayarlar:"
grep -n "^NEXT_PUBLIC_SITE_URL=\|^IYZICO_BASE_URL=\|^NEXT_PUBLIC_NOINDEX=\|^MAINTENANCE_MODE=" "$F"
echo "▸ Şimdi iyzico CANLI anahtarlarını yaz:  nano $F   (IYZICO_API_KEY= ve IYZICO_SECRET_KEY= satırları)"
