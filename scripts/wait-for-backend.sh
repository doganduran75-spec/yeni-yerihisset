#!/usr/bin/env bash
# AÇILIŞTA SİTE, ARKA UÇ HAZIR OLUNCA BAŞLAR (kullanıcı 2026-11-14: "siteyi gören her işlevi çalışır görmeli; yarım
# çalışan site yerine bakım sayfası görsün").
#
# Sunucu yeniden başlarken Docker (Supabase: veritabanı, REST, giriş) ile site (pm2 / Next.js) aynı anda kalkar; site
# birkaç saniyede açılır ama veritabanı 30–90 sn sürebilir. Bu arada site açık görünür, ürünler / giriş / ödeme çalışmaz.
# Çözüm: pm2'nin açılış servisi (pm2-root) bu betiği önce çalıştırır (systemd ExecStartPre — scripts/server-update.sh
# kurar). Betik bitene kadar site kapalıdır → Caddy ziyaretçiye bakım sayfasını gösterir (docs/BAKIM-SAYFASI.md, 503 +
# 5 sn'de bir yenileme). Veritabanı + REST + giriş servisi cevap verince betik biter, site başlar — ilk sayfa tam çalışır.
#
# Güvenlik ağı: en fazla WAIT_MAX sn (varsayılan 600) bekler, sonra site yine de başlar (sonsuza dek bakımda kalmasın).
# Kullanım:  bash scripts/wait-for-backend.sh            (açılışta; bekler)
#            bash scripts/wait-for-backend.sh --check    (şu an hazır mı? tek deneme, çıktı + çıkış kodu)
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG=/var/log/yerihisset-boot.log
get() { grep -hE "^$1=" "$APP_DIR/.env.local" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'\r"; }
URL="$(get NEXT_PUBLIC_SUPABASE_URL)"; URL="${URL%/}"
KEY="$(get NEXT_PUBLIC_SUPABASE_ANON_KEY)"
MAX="${WAIT_MAX:-600}"

code() { curl -sk -o /dev/null -w '%{http_code}' --max-time 5 -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "$1" 2>/dev/null || echo 000; }
probe() {
  DB=false; REST=false; AUTH=false
  docker exec supabase-db pg_isready -U postgres -q >/dev/null 2>&1 && DB=true
  if [ -n "$URL" ] && [ -n "$KEY" ]; then
    [ "$(code "$URL/rest/v1/products?select=id&limit=1")" = 200 ] && REST=true
    [ "$(code "$URL/auth/v1/health")" = 200 ] && AUTH=true
  fi
  $DB && $REST && $AUTH
}

if [ "${1:-}" = "--check" ]; then
  if probe; then echo "✓ Arka uç hazır (veritabanı, REST, giriş)"; exit 0; fi
  echo "✗ Arka uç hazır değil — veritabanı=$DB REST=$REST giriş=$AUTH${URL:+ (adres: $URL)}"; exit 1
fi

t=0
while :; do
  if probe; then echo "$(date '+%F %T') açılış: arka uç hazır (${t} sn) — site başlıyor" >>"$LOG"; exit 0; fi
  if [ "$t" -ge "$MAX" ]; then
    echo "$(date '+%F %T') açılış: ZAMAN AŞIMI (${MAX} sn; veritabanı=$DB REST=$REST giriş=$AUTH) — site yine de başlatılıyor" >>"$LOG"
    exit 0
  fi
  sleep 3; t=$((t + 3))
done
