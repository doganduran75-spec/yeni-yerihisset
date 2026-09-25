// YeriHisset STRES testi (k6). Yük testinden (loadtest.k6.js) farkı: beklenen
// trafiğin ÇOK üstüne çıkıp sistemin KIRILMA NOKTASINI ve TOPARLANMASINI ölçer.
// Yalnız okuma yapan uçlar — sipariş/ödeme/e-posta/analitik yazımı TETİKLEMEZ.
//
// Modlar (MODE):
//   stress (varsayılan): kademeli 50 → 100 → 200 → 300 → 400 eşzamanlı kullanıcı,
//                        her basamakta 2 dk bekler; sonra 0'a iner (toparlanma).
//   spike:               10 kullanıcıdan 10 sn içinde SPIKE (vars. 400) kullanıcıya fırlar,
//                        1 dk tutar, aniden düşer (kampanya/influencer paylaşımı senaryosu).
//
// Çalıştırma (sunucu DIŞINDAN önerilir — sunucuda çalışırsa k6 da CPU yer):
//   BASIC_USER=... BASIC_PASS=... PRODUCT_SLUG=... k6 run scripts/stresstest.k6.js
//   MODE=spike SPIKE=400 BASIC_USER=... BASIC_PASS=... k6 run scripts/stresstest.k6.js
//   Sonuçları kaydet:  k6 run --summary-export=stress-sonuc.json scripts/stresstest.k6.js
//
// Güvenlik ağı: hata oranı %20'yi geçerse test KENDİLİĞİNDEN DURUR (sunucuyu
// gereksiz yere çökertmeyelim). Kırılma noktası = durduğu andaki kullanıcı sayısı.
//
// Test sırasında sunucuda ayrı terminalde izle:
//   pm2 monit            (Next.js instance CPU/bellek)
//   docker stats         (supabase-db / rest / auth konteynerleri)
//   htop                 (genel CPU, RAM, swap)

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";
import encoding from "k6/encoding";

const BASE = __ENV.BASE_URL || "https://dev.yerihisset.com";
const PRODUCT_SLUG = __ENV.PRODUCT_SLUG || "";
const CATEGORY_SLUG = __ENV.CATEGORY_SLUG || "";
const MODE = __ENV.MODE || "stress";
const SPIKE = Number(__ENV.SPIKE || 400);

const BASIC_USER = __ENV.BASIC_USER || "";
const BASIC_PASS = __ENV.BASIC_PASS || "";
// Gerçek tarayıcı gibi sıkıştırılmış yanıt iste (yoksa k6 sayfaları ~7 kat büyük,
// ham indirir ve test makinesinin bant genişliği darboğaz olur).
const AUTH_HEADERS = Object.assign(
  { "Accept-Encoding": "gzip, br" },
  (BASIC_USER && BASIC_PASS)
    ? { Authorization: "Basic " + encoding.b64encode(`${BASIC_USER}:${BASIC_PASS}`) }
    : {}
);

const errorRate = new Rate("errors");
const dynamicDuration = new Trend("dinamik_sayfa_suresi", true); // DB'ye giden sayfalar

const STAGES = MODE === "spike"
  ? [
      { duration: "30s", target: 10 },
      { duration: "10s", target: SPIKE },   // ani sıçrama
      { duration: "1m", target: SPIKE },    // tut
      { duration: "10s", target: 10 },     // ani düşüş
      { duration: "1m", target: 10 },       // toparlanıyor mu?
      { duration: "10s", target: 0 },
    ]
  : [
      { duration: "1m", target: 50 },
      { duration: "2m", target: 50 },
      { duration: "1m", target: 100 },
      { duration: "2m", target: 100 },
      { duration: "1m", target: 200 },
      { duration: "2m", target: 200 },
      { duration: "1m", target: 300 },
      { duration: "2m", target: 300 },
      { duration: "1m", target: 400 },
      { duration: "2m", target: 400 },
      { duration: "2m", target: 0 },        // toparlanma
    ];

export const options = {
  stages: STAGES,
  thresholds: {
    // Bilgi amaçlı hedefler (stres testinde aşılması beklenir)
    http_req_duration: ["p(95)<2000"],
    // Güvenlik ağı: hata %20'yi geçerse testi durdur
    errors: [{ threshold: "rate<0.20", abortOnFail: true, delayAbortEval: "30s" }],
  },
};

function visit(path, name, dynamic = false) {
  const res = http.get(`${BASE}${path}`, { tags: { name }, headers: AUTH_HEADERS, timeout: "30s" });
  const ok = check(res, { [`${name} 200`]: (r) => r.status === 200 });
  errorRate.add(!ok);
  if (dynamic) dynamicDuration.add(res.timings.duration);
  return res;
}

export default function () {
  group("gezinme", () => {
    visit("/", "anasayfa");
    sleep(Math.random() * 1.5 + 0.5);
    visit("/products", "magaza");
    sleep(Math.random() * 1.5 + 0.5);
    if (CATEGORY_SLUG) {
      visit(`/kategori/${CATEGORY_SLUG}`, "kategori");
      sleep(Math.random() * 1.5 + 0.5);
    }
    // Ürün detayı dinamik (her istekte DB) → en çok zorlanacak sayfa
    if (PRODUCT_SLUG) {
      visit(`/products/${PRODUCT_SLUG}`, "urun-detay", true);
      visit(`/products/${PRODUCT_SLUG}?beden=40`, "urun-detay-beden", true);
      sleep(Math.random() * 2 + 0.5);
    }
    visit("/sepet", "sepet");
    visit("/firsatlar", "firsatlar");
    sleep(Math.random() * 1.5 + 0.5);
  });
}

// Özet: kırılma noktasını yorumlamaya yardım eden kısa rapor
export function handleSummary(data) {
  const m = data.metrics;
  const p = (k, q) => (m[k]?.values?.[q] != null ? Math.round(m[k].values[q]) : "-");
  const txt = [
    "",
    "=== YeriHisset STRES TESTİ ÖZETİ (" + MODE + ") ===",
    `İstek sayısı        : ${m.http_reqs?.values?.count ?? "-"}  (${(m.http_reqs?.values?.rate ?? 0).toFixed(1)} istek/sn)`,
    `Hata oranı          : ${((m.errors?.values?.rate ?? 0) * 100).toFixed(2)}%`,
    `Süre p50 / p95 / p99: ${p("http_req_duration", "med")} / ${p("http_req_duration", "p(95)")} / ${p("http_req_duration", "p(99)")} ms`,
    `Dinamik sayfa p95   : ${p("dinamik_sayfa_suresi", "p(95)")} ms`,
    `En yüksek VU        : ${m.vus_max?.values?.max ?? "-"}`,
    "Test erken durduysa, durduğu andaki kullanıcı sayısı = kırılma noktası.",
    "",
  ].join("\n");
  return { stdout: txt, "stress-sonuc.json": JSON.stringify(data, null, 2) };
}
