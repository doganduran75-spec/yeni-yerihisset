// YeriHisset yük testi (k6). SADECE OKUMA yapan genel sayfaları gezer —
// checkout/ödeme/e-posta gibi yan etkili uçları KASITLI OLARAK test etmez
// (iyzico'ya yük binmesin, sahte sipariş/e-posta oluşmasın).
//
// Kurulum (sunucuda ya da yerelde):  https://k6.io/docs/get-started/installation/
// Çalıştırma:
//   k6 run scripts/loadtest.k6.js
//   BASE_URL=https://dev.yerihisset.com PRODUCT_SLUG=dodura-barefoot CATEGORY_SLUG=ayakkabi k6 run scripts/loadtest.k6.js
//
// Ortam değişkenleri:
//   BASE_URL       (varsayılan https://dev.yerihisset.com)
//   PRODUCT_SLUG   ürün detay sayfası testi için (opsiyonel)
//   CATEGORY_SLUG  kategori sayfası testi için (opsiyonel)
//   PEAK           zirve eşzamanlı sanal kullanıcı (varsayılan 50)

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate } from "k6/metrics";
import encoding from "k6/encoding";

const BASE = __ENV.BASE_URL || "https://dev.yerihisset.com";
const PRODUCT_SLUG = __ENV.PRODUCT_SLUG || "";
const CATEGORY_SLUG = __ENV.CATEGORY_SLUG || "";
const PEAK = Number(__ENV.PEAK || 50);

// Staging Basic Auth (Caddy realm "restricted"). Kimlik bilgileri ortam
// değişkeninden okunur; script'e/koda GÖMÜLMEZ. Canlıda gerekmez, boş bırak.
const BASIC_USER = __ENV.BASIC_USER || "";
const BASIC_PASS = __ENV.BASIC_PASS || "";
const AUTH_HEADERS = (BASIC_USER && BASIC_PASS)
  ? { Authorization: "Basic " + encoding.b64encode(`${BASIC_USER}:${BASIC_PASS}`) }
  : {};

const errorRate = new Rate("errors");

export const options = {
  // Kademeli tırman → zirvede tut → in. Kaç eşzamanlı kullanıcıda bozulduğunu gör.
  stages: [
    { duration: "1m", target: Math.ceil(PEAK * 0.2) },
    { duration: "2m", target: Math.ceil(PEAK * 0.5) },
    { duration: "2m", target: PEAK },
    { duration: "2m", target: PEAK },   // zirvede tut
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<1500"], // p95 < 800ms hedef
    errors: ["rate<0.01"],                            // hata < %1
    http_req_failed: ["rate<0.01"],
  },
};

function visit(path, name) {
  const res = http.get(`${BASE}${path}`, { tags: { name }, headers: AUTH_HEADERS });
  const ok = check(res, {
    [`${name} 200`]: (r) => r.status === 200,
  });
  errorRate.add(!ok);
  return res;
}

export default function () {
  // Gerçekçi bir gezinme yolculuğu; her adımda kullanıcı düşünme süresi (sleep)
  group("browse", () => {
    visit("/", "anasayfa");
    sleep(Math.random() * 2 + 1);

    visit("/products", "magaza");
    sleep(Math.random() * 2 + 1);

    if (CATEGORY_SLUG) {
      visit(`/kategori/${CATEGORY_SLUG}`, "kategori");
      sleep(Math.random() * 2 + 1);
    }

    if (PRODUCT_SLUG) {
      visit(`/products/${PRODUCT_SLUG}`, "urun-detay");
      sleep(Math.random() * 3 + 1);
    }

    visit("/firsatlar", "firsatlar");
    sleep(Math.random() * 2 + 1);
  });
}
