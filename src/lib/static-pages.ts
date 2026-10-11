/* eslint-disable @typescript-eslint/no-explicit-any */
// Düzenlenebilir sayfalar (sunucu): metin static_pages tablosundan (yoksa src/config/static-pages.ts varsayılanı),
// künye settings'ten (yoksa src/config/company.ts). Yer tutucular burada doldurulur.
import { createAdminClient } from "@/lib/supabase-admin";
import { COMPANY } from "@/config/company";
import { STATIC_PAGES, type StaticPageSlug } from "@/config/static-pages";
import { TRIAL_DAYS } from "@/lib/order-next-step";

export type Company = {
  brand: string; title: string; address: string; email: string; phone: string | null;
  taxOffice: string; taxNumber: string; mersis: string | null; kep: string | null; hosting: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const orTodo = (v: string | null | undefined) => (v && v.trim()) || "(eklenecek)";

async function settingsRow(): Promise<any> {
  try {
    const { data } = await (createAdminClient() as any).from("settings").select("*").limit(1).maybeSingle();
    return data || {};
  } catch { return {}; }
}

export async function getCompany(st?: any): Promise<Company> {
  const s = st ?? (await settingsRow());
  return {
    brand: COMPANY.brand,
    title: s.company_title || COMPANY.title,
    address: s.address || COMPANY.address,
    email: s.contact_email || COMPANY.email,
    phone: s.contact_phone || COMPANY.phone,
    taxOffice: s.company_tax_office || COMPANY.taxOffice,
    taxNumber: s.company_tax_number || COMPANY.taxNumber,
    mersis: s.company_mersis || COMPANY.mersis,
    kep: s.company_kep || COMPANY.kep,
    hosting: COMPANY.hosting,
  };
}

function sellerList(c: Company): string {
  return `<ul>
<li><b>Unvan:</b> ${esc(c.title)} (${esc(c.brand)})</li>
<li><b>Adres:</b> ${esc(c.address)}</li>
<li><b>Vergi dairesi / no:</b> ${esc(c.taxOffice)} / ${esc(c.taxNumber)} · <b>MERSİS:</b> ${esc(orTodo(c.mersis))}</li>
<li><b>E-posta:</b> ${esc(c.email)} · <b>Telefon:</b> ${esc(orTodo(c.phone))} · <b>KEP:</b> ${esc(orTodo(c.kep))}</li>
</ul>`;
}

export function fillPlaceholders(html: string, c: Company, strict: boolean): string {
  const map: Record<string, string> = {
    marka: esc(c.brand), unvan: esc(c.title), adres: esc(c.address), eposta: esc(c.email), telefon: esc(orTodo(c.phone)),
    vergi_dairesi: esc(c.taxOffice), vergi_no: esc(c.taxNumber), mersis: esc(orTodo(c.mersis)), kep: esc(orTodo(c.kep)),
    satici_bilgileri: sellerList(c), deneme_gunu: String(TRIAL_DAYS), barindirma: esc(c.hosting),
    istatistik_onay: strict
      ? "Yalnız onayınızla. Onay yoksa ziyaretiniz kimliğinizle ilişkilendirilmeden, IP adresi saklanmadan yalnız sayılır."
      : "Tercih yapana kadar kendi ziyaret istatistiğimiz çalışır. Reddederseniz o ziyaretin kaydı anonimleşir (IP adresi silinir), sonrası yalnız sayılır. Google Analytics çerezleri yalnız onayınızla.",
    // CookieBanner bu bağlantıya tıklanınca tercihler penceresini açar (data-cookie-prefs)
    cerez_tercihleri: `<a href="#cerez-tercihleri" data-cookie-prefs="1">Çerez tercihlerini değiştir</a>`,
  };
  return html
    // Düzenleyici liste yer tutucusunu paragrafa sarar (<p>{{satici_bilgileri}}</p>) → liste paragraf içinde kalmasın
    .replace(/<p>\s*\{\{\s*satici_bilgileri\s*\}\}\s*<\/p>/g, () => map.satici_bilgileri)
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (k in map ? map[k] : m))
    // Ödeme sayfasındaki "Ön Bilgilendirme Formu" bağlantısı bu başlığa gider (düzenleyici id'yi siler)
    .replace(/<h2>(\s*Ön Bilgilendirme Formu\s*)<\/h2>/, '<h2 id="on-bilgilendirme">$1</h2>');
}

export type StaticPage = { slug: StaticPageSlug; title: string; intro: string; body: string; draft: boolean; updatedAt: string | null; custom: boolean };

export async function getStaticPage(slug: StaticPageSlug): Promise<StaticPage> {
  const def = STATIC_PAGES[slug];
  const st = await settingsRow();
  let row: any = null;
  try {
    const { data } = await (createAdminClient() as any).from("static_pages").select("*").eq("slug", slug).maybeSingle();
    row = data;
  } catch { /* tablo yoksa varsayılan */ }
  const c = await getCompany(st);
  const strict = st.cookie_consent_strict === true;
  return {
    slug,
    title: row?.title || def.title,
    intro: fillPlaceholders(row?.intro ?? def.intro, c, strict),
    body: fillPlaceholders(row?.body || def.body, c, strict),
    draft: row ? row.draft === true : def.draftDefault,
    updatedAt: row?.updated_at ?? null,
    custom: !!row,
  };
}
