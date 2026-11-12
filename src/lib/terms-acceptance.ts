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
import { clientIp } from "@/lib/rate-limit";

export const TERMS_REQUIRED_ERROR = "Siparişi tamamlamak için Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onayını işaretleyin.";
export const TERMS_SLUG = "mesafeli-satis" as const;

/** İstekte onay var mı (ödeme sayfası termsAccepted: true gönderir) */
export const termsAccepted = (body: any) => body?.termsAccepted === true;

/** Siparişe onay kaydı + metnin sürümü (hata siparişi engellemez, loglanır) */
export async function recordTermsAcceptance(sb: any, orderId: string, req: NextRequest) {
  try {
    const p = await getStaticPage(TERMS_SLUG);
    const text = `${p.title}\n\n${p.intro || ""}\n\n${p.body}`;
    const hash = createHash("sha256").update(text).digest("hex");
    await sb.from("legal_text_versions").upsert({ hash, slug: TERMS_SLUG, title: p.title, body: text, page_updated_at: p.updatedAt }, { onConflict: "hash", ignoreDuplicates: true });
    const { error } = await sb.from("orders").update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: hash,
      terms_ip: clientIp(req),
      terms_user_agent: String(req.headers.get("user-agent") || "").slice(0, 300) || null,
    }).eq("id", orderId);
    if (error) throw error;
  } catch (e: any) {
    console.error("[terms-acceptance]", orderId, e?.message || e);
  }
}
