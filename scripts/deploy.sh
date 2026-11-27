#!/usr/bin/env bash
# YeriHisset üretim dağıtımı (staging/prod sunucuda çalıştırılır).
#
# KESİNTİSİZ (2026-11-27 — kullanıcı: "deploy sırasında sunucu yorulmasın"; canlıda müşteri build boyunca bakım
# sayfası görüyordu):
#  - Yeni sürüm site AÇIKKEN ayrı klasörde hazırlanır (NEXT_DIST_DIR=.next-build — next.config.ts distDir), düşük
#    öncelikle (nice / ionice): sitenin istekleri hep önde.
#  - Build hata verirse yeni sürüm yayına alınmaz, site eski sürümle çalışmaya devam eder.
#  - Build bitince klasörler yer değiştirir (.next → .next-old, .next-build → .next) ve pm2 süreçleri sırayla yenilenir
#    (cluster reload) — geçiş birkaç saniye. Önceki sürüm .next-old'da bir sonraki deploy'a kadar durur.
#  - Önbellek (.next/cache) yeni klasöre sabit bağlantıyla (cp -al) kopyalanır: ardışık build'ler hızlı kalır, çalışan
#    site kendi önbelleğine yazmaya devam eder.
#  - Yalnız bağımlılıklar değiştiyse (package-lock) site npm ci süresince durdurulur (node_modules çalışan sürecin altında
#    değişmesin) — o deploy'da kısa kesinti olur.
#  - Dağıtım süresince /run/yerihisset-deploying işareti durur: sağlık kontrolü (scripts/server-health.sh) bu sırada
#    "sorun" saymaz, e-posta atmaz. Dağıtım yarıda kalırsa işaret silinir → sonraki kontrol gerçek sorunu bildirir.
#
# Kullanım:  bash scripts/deploy.sh
set -euo pipefail

# Script'in bulunduğu repo köküne geç (nereden çağrılırsa çağrılsın doğru dizin)
cd "$(dirname "$0")/.."

DEPLOY_FLAG=/run/yerihisset-deploying
date +%s > "$DEPLOY_FLAG"
trap 'rm -f "$DEPLOY_FLAG"' EXIT
trap 'echo; echo "✗ DAĞITIM YARIDA KALDI — durum: pm2 status (site eski sürümle çalışıyor olabilir)."; echo "  Hatayı düzeltip tekrar: bash scripts/deploy.sh"' ERR

# Düşük öncelik: build / regresyon / görsel ısıtma sitenin isteklerinin önüne geçmesin
LOW="nice -n 10"
if command -v ionice >/dev/null 2>&1; then LOW="$LOW ionice -c2 -n7"; fi

echo "▸ git pull"
git pull
# Bağımlılık damgası: son BAŞARILI kurulumdaki package-lock özeti node_modules içinde saklanır.
# git pull'u betikten önce elle yapmak da (sık yapılıyor) artık kurulumu atlatmaz.
LOCK_NOW="$(sha1sum package-lock.json 2>/dev/null | cut -d' ' -f1)"
LOCK_STAMP_FILE=node_modules/.yh-lock-sha1
LOCK_STAMP="$(cat "$LOCK_STAMP_FILE" 2>/dev/null || true)"

# Bağımlılıklar son kurulumdan beri değiştiyse (package-lock.json) temiz kurulum — ör. Next sürüm yükseltmesi, yeni paket.
# node_modules çalışan sürecin altında değişmesin diye yalnız bu durumda site durdurulur.
if [ "$LOCK_NOW" != "$LOCK_STAMP" ] || [ "${FORCE_NPM_CI:-0}" = "1" ]; then
  echo "▸ bağımlılıklar değişmiş → site durduruluyor, npm ci (bu deploy'da kısa kesinti)"
  pm2 stop yerihisset || true
  npm ci --no-audit --no-fund
  echo "$LOCK_NOW" > "$LOCK_STAMP_FILE"
fi
echo "  next $(node -p "require('next/package.json').version" 2>/dev/null || echo '?')"

# Sürüm kimliği (kullanıcı 2026-11-18: deploy'dan önce açık kalan sekme "Failed to load chunk" ile çöktü): her build'e
# commit kimliği verilir; tarayıcıdaki sayfa eski sürümdeyse Next gezinmede tam sayfa yenilemeye döner (yeni dosyalar gelir).
# Kimlik .deployment-id dosyasına da yazılır (geçiş anında): pm2 süreçleri ortam değişkenini görmüyor, next.config.ts
# dosyadan okur. Build'e ortam değişkeniyle verilir — dosya build sürerken eski sürümün kimliğinde kalır.
export NEXT_DEPLOYMENT_ID="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
BUILD_DIR=.next-build
rm -rf "$BUILD_DIR"
if [ -d .next/cache ]; then
  mkdir -p "$BUILD_DIR"
  cp -al .next/cache "$BUILD_DIR/cache" 2>/dev/null || cp -a .next/cache "$BUILD_DIR/cache"
fi
echo "▸ npm run build (sürüm $NEXT_DEPLOYMENT_ID — site açık, ayrı klasörde, düşük öncelik)"
if ! NEXT_DIST_DIR="$BUILD_DIR" $LOW npm run build; then
  rm -rf "$BUILD_DIR"
  trap - ERR
  echo
  echo "✗ BUILD HATASI — yeni sürüm yayına ALINMADI; site eski sürümle çalışmaya devam ediyor (pm2 status)."
  echo "  Hatayı Claude'a ilet; düzelince tekrar: bash scripts/deploy.sh"
  exit 1
fi
[ -f "$BUILD_DIR/BUILD_ID" ] || { echo "✗ Build çıktısı eksik ($BUILD_DIR/BUILD_ID yok) — yeni sürüm yayına alınmadı."; rm -rf "$BUILD_DIR"; exit 1; }

echo "▸ yeni sürüme geçiş (klasör değişimi + pm2 sırayla yenileme)"
echo "$NEXT_DEPLOYMENT_ID" > .deployment-id
rm -rf .next-old
if [ -d .next ]; then mv .next .next-old; fi
mv "$BUILD_DIR" .next
# İlk geçişte tek-instance süreçten cluster'a geçmek için bir kez:
#   pm2 delete yerihisset && pm2 start ecosystem.config.js && pm2 save
# startOrReload cluster'ı sırayla yenileyerek (0-kesinti) yeniden başlatır; npm ci için durdurulduysa başlatır.
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
# Önceki sürüm (.next-old) elle geri dönüş için bir sonraki deploy'a kadar durur; önbelleği yer kaplamasın
rm -rf .next-old/cache

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
  # Regresyon TS dosyalarını (order-next-step, kargonomi) doğrudan yükler; Node'un "Module type not specified" uyarısı gürültü
  $LOW node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/regression.mjs || true
fi

# GÖRSEL ISITMA (kullanıcı 2026-11-23): ana sayfa / ürün görsellerinin telefona uygun küçük hâli önceden üretilir; ilk
# ziyaretçi (hikâye!) üretimi beklemez. Arka planda çalışır, sonucu /tmp/yh-warm-images.log içinde.
nohup $LOW node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/warm-images.mjs > /tmp/yh-warm-images.log 2>&1 &
