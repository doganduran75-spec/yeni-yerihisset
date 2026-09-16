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
#
# Kullanım:  bash scripts/deploy.sh
set -euo pipefail

# Script'in bulunduğu repo köküne geç (nereden çağrılırsa çağrılsın doğru dizin)
cd "$(dirname "$0")/.."

echo "▸ git pull"
git pull

echo "▸ pm2 stop (build sırasında 502 olmasın)"
pm2 stop yerihisset || true

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

echo "✓ Dağıtım tamam."
