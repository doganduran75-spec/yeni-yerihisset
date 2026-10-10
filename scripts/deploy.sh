#!/usr/bin/env bash
# YeriHisset üretim dağıtımı (staging/prod sunucuda çalıştırılır).
#
# Neden bu sıralama:
#  - pm2 önce DURDURULUR: build sırasında çalışan süreç yarı-yazılmış .next'i
#    okuyup 502 vermesin diye. (Site build boyunca kısa süre kapalı.)
#  - .next TAMAMEN silinmez: sadece derleme ÇIKTISI temizlenir, `.next/cache`
#    korunur. Bu cache Next'in resmi artımlı derleme önbelleğidir; silmek
#    çıktı doğruluğunu artırmaz, yalnızca her build'i sıfırdan yaptırır.
#    Korumak ardışık build'leri belirgin hızlandırır, riski yoktur.
#  - build BİTTİKTEN sonra pm2 yeniden başlatılır (taze .next ile).
#  - Dağıtım süresince /run/yerihisset-deploying işareti durur: sağlık kontrolü
#    (scripts/server-health.sh) bu sırada duran süreçleri "sorun" saymaz, e-posta atmaz.
#    Dağıtım yarıda kalırsa işaret silinir → sonraki kontrol gerçek sorunu bildirir.
#
# Kullanım:  bash scripts/deploy.sh
set -euo pipefail

# Script'in bulunduğu repo köküne geç (nereden çağrılırsa çağrılsın doğru dizin)
cd "$(dirname "$0")/.."

DEPLOY_FLAG=/run/yerihisset-deploying
date +%s > "$DEPLOY_FLAG"
trap 'rm -f "$DEPLOY_FLAG"' EXIT
trap 'echo; echo "✗ DAĞITIM YARIDA KALDI — site süreçleri durmuş olabilir (site kapalı)."; echo "  Hatayı düzeltip tekrar: bash scripts/deploy.sh   ·   durum: pm2 status"' ERR

LOCK_BEFORE="$(sha1sum package-lock.json 2>/dev/null | cut -d' ' -f1)"
echo "▸ git pull"
git pull
LOCK_AFTER="$(sha1sum package-lock.json 2>/dev/null | cut -d' ' -f1)"

echo "▸ pm2 stop (build sırasında 502 olmasın)"
pm2 stop yerihisset || true

# Bağımlılıklar değiştiyse (package-lock.json) temiz kurulum — ör. Next sürüm yükseltmesi
if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ] || [ "${FORCE_NPM_CI:-0}" = "1" ]; then
  echo "▸ package-lock değişti → npm ci"
  npm ci --no-audit --no-fund
fi

echo "▸ .next çıktısı temizleniyor (cache korunuyor)"
if [ -d .next ]; then
  find .next -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} +
fi

echo "▸ npm run build"
npm run build

echo "▸ pm2 başlat/yükle (cluster — ecosystem.config.js)"
# İlk geçişte tek-instance süreçten cluster'a geçmek için bir kez:
#   pm2 delete yerihisset && pm2 start ecosystem.config.js && pm2 save
# Sonrasında startOrReload cluster'ı 0-kesinti güncelleyerek yeniden başlatır.
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

# ISR ISITMA: ana sayfaları bir kez çağırarak önbelleği önceden üret; böylece
# deploy sonrası İLK ziyaretçi soğuk render'ı beklemez ("aniden yükleme" biter).
# Caddy basic-auth'u aşmak için doğrudan localhost:3000'e (pm2) gideriz.
echo "▸ ISR ısıtma"
for i in 1 2 3 4 5 6 7 8; do
  curl -sf -o /dev/null "http://localhost:3000/" && break || sleep 2
done
for path in "/" "/products" "/firsatlar"; do
  curl -s -o /dev/null "http://localhost:3000${path}" || true
done

echo "✓ Dağıtım tamam."

# Sağlık kartını tazele: dağıtım sırasında çalışan kontrol "dağıtım sürüyor (0/4)" diye sarı bırakır;
# işareti kaldırıp kontrolü hemen bir kez çalıştırınca kart 15 dk beklemeden yeşile döner.
rm -f "$DEPLOY_FLAG"
bash scripts/server-health.sh --quiet >/dev/null 2>&1 || true

# REGRESYON (otomatik kontrol): her deploy'dan sonra ~1 dk. Hata olsa da dağıtım geri alınmaz;
# sonucu okuyup HATA varsa Claude'a ilet. Atlamak için: SKIP_REGRESSION=1 bash scripts/deploy.sh
if [ "${SKIP_REGRESSION:-0}" != "1" ]; then
  echo
  node scripts/regression.mjs || true
fi
