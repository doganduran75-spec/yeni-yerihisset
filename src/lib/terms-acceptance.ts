/* eslint-disable @typescript-eslint/no-explicit-any */
// SÖZLEŞME ONAYI (kullanıcı 2026-11-12): ödeme sayfasında zorunlu kutu — "Ön Bilgilendirme Formu'nu ve Mesafeli Satış
// Sözleşmesi'ni okudum, onaylıyorum". İşaretlenmeden sipariş oluşmaz (sunucu da kontrol eder). Mesafeli satışta
// bilgilendirmenin ispatı satıcıda → siparişe onay anı + IP + tarayıcı + metnin o anki sürümü yazılır; sürümün tam
// metni legal_text_versions'ta (özetle anahtarlı, değişmedikçe tek satır) saklanır. MIG 20261180.
// Ön Bilgilendirme Formu, Mesafeli Satış sayfasının içinde (#on-bilgilendirme) → tek metin.
// Kullanım: /api/orders/create (havale), /api/checkout/iyzico/initialize (kart). Yönetici siparişinde aranmaz.
import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { getStaticPage } from "@/lib/static-pages";
import type { StaticPageSlug } from "@/config/static-pages";
import { clientIp } from "@/lib/rate-limit";

export const TERMS_REQUIRED_ERROR = "Siparişi tamamlamak için Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onayını işaretleyin.";
export const TERMS_SLUG = "mesafeli-satis" as const;

/** İstekte onay var mı (ödeme sayfası termsAccepted: true gönderir) */
export const termsAccepted = (body: any) => body?.termsAccepted === true;

/** Metnin o anki sürümü: sha256 özeti; tam metin legal_text_versions'ta (değişmedikçe tek satır) */
async function legalVersion(sb: any, slug: StaticPageSlug): Promise<string> {
  const p = await getStaticPage(slug);
  const text = `${p.title}\n\n${p.intro || ""}\n\n${p.body}`;
  const hash = createHash("sha256").update(text).digest("hex");
  await sb.from("legal_text_versions").upsert({ hash, slug, title: p.title, body: text, page_updated_at: p.updatedAt }, { onConflict: "hash", ignoreDuplicates: true });
  return hash;
}
const evidence = (req: NextRequest) => ({
  terms_ip: clientIp(req),
  terms_user_agent: String(req.headers.get("user-agent") || "").slice(0, 300) || null,
});

/** Siparişe onay kaydı + metnin sürümü (hata siparişi engellemez, loglanır) */
export async function recordTermsAcceptance(sb: any, orderId: string, req: NextRequest) {
  try {
    const hash = await legalVersion(sb, TERMS_SLUG);
    const { error } = await sb.from("orders").update({ terms_accepted_at: new Date().toISOString(), terms_version: hash, ...evidence(req) }).eq("id", orderId);
    if (error) throw error;
  } catch (e: any) {
    console.error("[terms-acceptance]", orderId, e?.message || e);
  }
}

// ÜYELİK SÖZLEŞMESİ ONAYI (2026-11-12): üyelik formundaki zorunlu kutu (/api/auth/register) — profiles.terms_* (MIG 20261182)
export const SIGNUP_TERMS_SLUG = "uyelik-sozlesmesi" as const;
export const SIGNUP_TERMS_REQUIRED_ERROR = "Üye olmak için Üyelik Sözleşmesi'ni onaylayın.";

/** Üyeye onay kaydı + metnin sürümü (hata üyeliği engellemez, loglanır) */
export async function recordSignupTerms(sb: any, userId: string, req: NextRequest) {
  try {
    const hash = await legalVersion(sb, SIGNUP_TERMS_SLUG);
    const { error } = await sb.from("profiles").update({ terms_accepted_at: new Date().toISOString(), terms_version: hash, ...evidence(req) }).eq("id", userId);
    if (error) throw error;
  } catch (e: any) {
    console.error("[signup-terms]", userId, e?.message || e);
  }
}
