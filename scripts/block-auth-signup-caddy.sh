#!/usr/bin/env bash
# SUPABASE KAYIT KAPISINI KAPAT (güvenlik 2026-11-16): Supabase'in kendi kayıt adresleri (/auth/v1/signup, /otp,
# /magiclink) dışarıya açıktı (GOTRUE_DISABLE_SIGNUP=false). Biri sitenin formunu atlayıp doğrudan hesap açtırabiliyor
# (bot tuzağı, sözleşme onayı, IP sınırı devre dışı) ve rastgele adreslere onay e-postası yollatabiliyordu.
# Site bu adresleri KULLANMIYOR: üyelik / misafir / kupon hesapları sunucudan admin.createUser ile açılıyor.
# GOTRUE_DISABLE_SIGNUP=true YAPILMAZ: o, Google ile girişte yeni üyeliği de kapatır. Bunun yerine Caddy'de yalnız bu
# üç adres 403 döner; giriş (token), Google (authorize / callback), şifre, yönetici uçları aynen çalışır.
# Supabase bloğunun başına iki satır ekler. Güvenli: yedek alır, "caddy validate" geçmezse geri koyar. Tekrar
# çalıştırmak güvenli (zaten varsa bir şey yapmaz).
# Kullanım:  bash scripts/block-auth-signup-caddy.sh
set -euo pipefail
CF=/etc/caddy/Caddyfile
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

[ -f "$CF" ] || { echo "✗ $CF bulunamadı"; exit 1; }
SB_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
HOST=$(printf '%s' "$SB_URL" | sed -E 's#^https?://##; s#/.*$##; s#:.*$##')
[ -n "$HOST" ] || { echo "✗ .env.local içinde NEXT_PUBLIC_SUPABASE_URL okunamadı"; exit 1; }

if grep -q 'gotrue_signup' "$CF"; then echo "✓ Kayıt kapısı zaten kapalı ($HOST) — bir şey yapılmadı."; else
  # Bloğun ilk satırı: "<host> {" ya da "<host>, başka {" ya da "https://<host> {"
  HOST_RE=$(printf '%s' "$HOST" | sed 's/\./\\./g')
  LINE=$(grep -nE "^(https?://)?${HOST_RE}([[:space:]]*,[^{]*)?[[:space:]]*\{" "$CF" | head -1 | cut -d: -f1 || true)
  [ -n "$LINE" ] || { echo "✗ Caddyfile'da $HOST bloğu bulunamadı. Bloğun ilk satırını bana gönder:"; grep -n "{" "$CF" | head -20; exit 1; }

  BACKUP="$CF.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$CF" "$BACKUP"
  echo "▸ Yedek: $BACKUP"
  awk -v n="$LINE" '{ print } NR == n {
    print "\t# Supabase kendi kayıt adresleri kapalı (scripts/block-auth-signup-caddy.sh) — üyelik site üzerinden"
    print "\t@gotrue_signup path /auth/v1/signup /auth/v1/otp /auth/v1/magiclink"
    print "\trespond @gotrue_signup 403"
  }' "$BACKUP" > "$CF"

  if caddy validate --config "$CF" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
    systemctl reload caddy
    echo "✓ Caddy güncellendi ($HOST)."
  else
    cp "$BACKUP" "$CF"
    echo "✗ Caddy ayarı doğrulanamadı, eski ayar geri yüklendi. Hata:"
    tail -5 /tmp/caddy-validate.log
    exit 1
  fi
fi

# Kontrol: kayıt 403, giriş adresi açık (yanlış şifre → 400)
sleep 1
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$HOST/auth/v1/signup" -H 'Content-Type: application/json' -d '{}')
T=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$HOST/auth/v1/token?grant_type=password" -H 'Content-Type: application/json' -d '{}')
echo "  kayıt adresi: HTTP $S (403 olmalı) · giriş adresi: HTTP $T (403 OLMAMALI)"
