# Bakım sayfası (deploy sırasında ve site çökerse)

Deploy, derleme süresince siteyi (pm2) durdurur — birkaç dakika. Bu sürede Caddy, siteye ulaşamayınca
(502 / 503 / 504) ziyaretçiye `maintenance/index.html` sayfasını gösterir. Sayfa 5 saniyede bir kendini
yeniler; site açılınca ziyaretçi kaldığı adrese döner. Sepet tarayıcıda tutulduğu için kaybolmaz.
Arama motorlarına `503` döner (geçici durum — sıralama etkilenmez).

## Kurulum (bir kez, sunucuda) — kolay yol

Betik ayarı kendisi ekler: önce yedek alır, Caddy ayarı doğrulanmazsa yedeği geri koyar.

```bash
cd /opt/yerihisset-app && bash scripts/setup-maintenance-caddy.sh
```

Canlıya geçince canlı alan adı için bir kez daha: `bash scripts/setup-maintenance-caddy.sh yerihisset.com`

## Kurulum — elle (betik çalışmazsa)

1. Caddy ayar dosyasını aç:

```bash
nano /etc/caddy/Caddyfile
```

2. Site bloğunun (`dev.yerihisset.com { ... }`, canlıda `yerihisset.com { ... }`) **içine**, en alta şunu ekle:

```
	handle_errors {
		@down expression `{err.status_code} in [502, 503, 504]`
		handle @down {
			root * /opt/yerihisset-app/maintenance
			rewrite * /index.html
			header Cache-Control "no-store"
			header Retry-After "10"
			file_server {
				status 503
			}
		}
	}
```

3. Ayarı denetle, sonra yeniden yükle:

```bash
caddy validate --config /etc/caddy/Caddyfile
```

```bash
systemctl reload caddy
```

4. Dene: siteyi kısa süre durdur, tarayıcıda siteyi aç (bakım sayfası görünmeli), sonra geri başlat:

```bash
pm2 stop yerihisset
```

```bash
pm2 start yerihisset
```

Regresyon paketi (Ayarlar ve ortam) bu ayarın Caddy'de olup olmadığını kontrol eder.
