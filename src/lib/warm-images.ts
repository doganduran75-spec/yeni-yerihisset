// GÖRSEL ISITMA (kullanıcı 2026-11-23: telefonda ilk açılışta hikâye görseli gelmeden süre doldu). Next'in görsel servisi
// (/_next/image) bir görselin küçültülmüş hâlini İLK istekte üretir; 1536×2752 ham fotoğrafta bu saniyeler sürer ve ilk
// ziyaretçi bekler. Burada ana sayfa + ürünler sayfasındaki görseller, telefon / bilgisayarın gerçekten seçtiği
// genişliklerde önceden bir kez istenir → üretilip önbelleğe girer, ziyaretçi hazır dosyayı alır.
// Çağıranlar: deploy sonrası (scripts/warm-images.mjs) + saatte bir (cron/marketplace-sync, dakika 43 — yeni yüklenen görsel).
// Bağımlılıksız (Node betiği de doğrudan yükler). Önbellekteki görsel isteği çok hızlıdır; aynı anda en çok 2 istek.

/** Tarayıcıların seçtiği genişlikler: telefon (2x/3x ekran) 750–1200, bilgisayar kartları 384/640 */
const WIDTHS = new Set([384, 640, 750, 828, 1080, 1200]);

export async function warmImages(base = `http://127.0.0.1:${process.env.PORT || 3000}`, paths = ["/", "/products"], max = 300) {
  const urls = new Set<string>();
  for (const p of paths) {
    const html = await fetch(base + p).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    for (const m of html.matchAll(/\/_next\/image\?url=[^"'\s,\\]+/g)) {
      const u = m[0].replace(/&amp;/g, "&");
      const w = Number(new URL(u, base).searchParams.get("w"));
      if (WIDTHS.has(w)) urls.add(u);
    }
  }
  const list = [...urls].slice(0, max);
  let i = 0, ok = 0;
  const worker = async () => {
    while (i < list.length) {
      const u = list[i++];
      const r = await fetch(base + u, { headers: { accept: "image/webp,image/*,*/*;q=0.8" } }).catch(() => null);
      if (r?.ok) { await r.arrayBuffer().catch(() => null); ok++; }
    }
  };
  await Promise.all([worker(), worker()]);
  return { total: list.length, ok };
}
