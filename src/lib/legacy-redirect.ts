/* eslint-disable @typescript-eslint/no-explicit-any */
// ESKİ WORDPRESS ADRESLERİ → YENİ SİTE (kullanıcı 2026-11-15, canlıya geçiş).
// Google'da ve Instagram / mesaj geçmişindeki eski bağlantılar "sayfa bulunamadı"ya düşmesin, Google sıralaması taşınsın.
// Eski site haritası (2026-11-15): 47 ürün /urun/<ad>-<modelkodu>/, 5 kategori /urun-kategori/, 78 ürün etiketi
// /urun-etiketi/, 11 yazı (kökte /<slug>/), 28 sayfa, /category/ + /tag/ (blog). /marka/<x> ve /magaza aynı adreste.
// Akış: next.config.ts rewrites eski kalıbı içeriden /eski-adres/... ucuna verir → bu dosya hedefi bulur → 301.
// Ürün: önce aynı ad (slug), sonra adresin sonundaki model kodu (products.model_code); bulunamazsa marka / mağaza.
// Yazı: aynı adlı Bilgi Bankası makalesi, yoksa Bilgi Bankası. Hedef her zaman site içi bir yol ("/…").

/** Eski WordPress sayfaları (page-sitemap) → yeni karşılığı. Anahtar = adresin ilk parçası. */
export const LEGACY_PAGES: Record<string, string> = {
  "collection": "/magaza",
  "hesabim": "/account",
  "siparis-takibi": "/account",
  "odeme-sayfasi": "/sepet",
  "alisveris-sepeti": "/sepet",
  "wishlist": "/favoriler",
  "affiliate-home": "/affiliate",
  "privacy-policy": "/gizlilik",
  "gizlilik-politikasi": "/gizlilik",
  "mesafeli-satis-sozlesmesi": "/mesafeli-satis",
  "terms-and-conditions": "/mesafeli-satis",
  "teslimat-ve-iade-sartlari": "/iade-degisim",
  "isbirligi-yapmak-ister-misiniz": "/iletisim",
  "lets-keep-in-touch": "/iletisim",
  "barefoot-toplulugu": "/",
  "sikca-sorulan-sorular": "/bilgi-bankasi",
  "attipas-instagram": "/marka/attipas",
  "attipas-bakim-rehberi": "/marka/attipas",
  "attipas-markasi-hakkinda": "/marka/attipas",
  "attipas-olcu-rehberi-2": "/marka/attipas",
  "attipas-sikca-sorulan-sorular": "/marka/attipas",
  "category": "/bilgi-bankasi",
  "tag": "/bilgi-bankasi",
};

/** Eski blog yazıları (post-sitemap; kökte). barefoot-ayakkabi-nedir next.config redirects'te → /barefoot-nedir. */
export const LEGACY_POSTS = [
  "neden-barefoot-ayakkabi-giymeliyiz", "barefoot-ayakkabi-ozellikleri-zero-drop", "cocuklarimizin-ayaklari-nasil-gelisiyor",
  "dogru-is-icin-dogru-arac", "postur-bozukluklari-ve-cozumleri", "attipas-hakkinda-bilgi", "barefoot-bir-ciplak-ayaklinin-ozgecmisi",
  "blog-2-ciplak-ayakli-yurume-sebepleri", "barefoot-ayakkabi-tabanlari-neden-ince", "barefoot-ayakkabi-rehberi",
];

const CHILD = new Set(["cocuk", "ilkadim", "ilk-adim", "ilkadim-ayakkabisi", "cocuk-barefoot-ayakkabi"]);
const BRANDS = new Set(["attipas", "dodura", "yerihisset"]);
const clean = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 200);

/** Markaya / segmente göre kaba hedef (ürün bulunamazsa) */
function roughTarget(slug: string): string {
  const first = slug.split("-")[0];
  if (first === "attipas") return "/marka/attipas";
  if (BRANDS.has(first)) return `/marka/${first}`;
  return "/magaza";
}

/** Eski adres parçalarından yeni hedefi bul. kind: "urun" | "urun-kategori" | "urun-etiketi" | "yazi" | sayfa adı */
export async function resolveLegacy(sb: any, parts: string[]): Promise<string> {
  const kind = clean(parts[0]);
  const slug = clean(parts[1]);

  if (kind === "urun") {
    if (!slug) return "/magaza";
    const bySlug = (await sb.from("products").select("slug").eq("slug", slug).eq("is_active", true).limit(1).maybeSingle()).data;
    if (bySlug?.slug) return `/products/${bySlug.slug}`;
    const code = slug.split("-").pop() || "";
    if (/^[a-z]{2,}[a-z0-9]*\d$/.test(code)) {
      const byCode = (await sb.from("products").select("slug").ilike("model_code", code).eq("is_active", true).limit(1).maybeSingle()).data;
      if (byCode?.slug) return `/products/${byCode.slug}`;
    }
    return roughTarget(slug);
  }
  if (kind === "urun-kategori") {
    if (!slug) return "/magaza";
    if (CHILD.has(slug)) return "/magaza/ilkadim";
    const cat = (await sb.from("categories").select("slug").eq("slug", slug).limit(1).maybeSingle()).data;
    return cat?.slug ? `/kategori/${cat.slug}` : "/magaza";
  }
  if (kind === "urun-etiketi") {
    if (!slug) return "/magaza";
    if (CHILD.has(slug)) return "/magaza/ilkadim";
    if (BRANDS.has(slug)) return `/marka/${slug}`;
    return `/ara?q=${encodeURIComponent(slug.replace(/-/g, " "))}`;
  }
  if (kind === "yazi") {
    if (!slug) return "/bilgi-bankasi";
    const kb = (await sb.from("kb_articles").select("slug").eq("slug", slug).limit(1).maybeSingle()).data;
    return kb?.slug ? `/bilgi-bankasi/${kb.slug}` : "/bilgi-bankasi";
  }
  return LEGACY_PAGES[kind] ?? "/";
}
