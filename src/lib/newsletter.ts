/* eslint-disable @typescript-eslint/no-explicit-any */
// BÜLTEN KAYDI (kullanıcı 2026-11-12): kayıt olana "hoş geldin" e-postası (çıkış bağlantısı + "her bültenin altında
// abonelikten çık var" bilgisi), zaten listedeyse "zaten listemizdesiniz". Şablon: email_templates 'newsletter_welcome'
// (MIG 20261179; panelden düzenlenir / kapatılır). Kullanım: src/app/api/newsletter/route.ts, E-posta denemesi
// ÇİFT ONAY (güvenlik 2026-11-16): form artık izni YAZMAZ. Kişi kaydı (contacts) izinsiz açılır ve adrese "aboneliğini
// onayla" e-postası gider; izin, kişi e-postadaki bağlantıda (/kampanya-izni, imzalı) "Evet"e basınca yazılır, hoş geldin
// e-postası da o an gider (src/app/api/marketing-consent/route.ts). Eskiden başkasının adresi yazılınca o kişi "izin verdi"
// sayılıyor, çıkmış biri yeniden abone edilebiliyordu.
import { renderEmailTemplate, escapeHtml, buildEmailDocument } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendRawSiteMail } from "@/lib/site-mail";
import { contactConsentUrl } from "@/lib/marketing-consent";

export type NewsletterResult = "confirm_sent" | "already" | "member_opted_out";

/** Formda gösterilecek metin (Footer + DesktopHome aynı) */
export function newsletterMessage(r: NewsletterResult): string {
  switch (r) {
    case "already": return "Bu e-posta zaten bülten listemizde. Teşekkürler!";
    case "member_opted_out": return "Bu e-posta bir üye hesabına ait ve kampanya e-postaları kapalı. Açmak için Hesabım'daki kampanya e-postası seçeneğini işaretleyin.";
    default: return "Neredeyse tamam! E-postana bir onay bağlantısı gönderdik — bültene katılmak için bağlantıdaki “Evet”e bas.";
  }
}

/** "Aboneliğini onayla" e-postası — bağlantı imzalı, kişiye özel (/kampanya-izni; izin düğmeye basınca yazılır). */
export async function sendNewsletterConfirm(contactId: string, email: string, to = email) {
  const { data: st } = await (createAdminClient() as any).from("settings").select("store_name").order("id").limit(1).maybeSingle();
  const storeName = st?.store_name || "YeriHisset";
  const url = contactConsentUrl(contactId);
  const body = `<!--yh-tpl:newsletter_confirm-->
    <h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">Bülten aboneliğini onayla</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px"><b>${escapeHtml(email)}</b> adresi ${escapeHtml(storeName)} bültenine eklenmek istendi. Sen istediysen aşağıdaki düğmeye basıp onayla; kampanya ve yeni ürün haberlerini göndermeye başlayalım.</p>
    <div style="text-align:center;margin:18px 0">
      <a href="${url}" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:14px">Aboneliğimi onayla</a>
    </div>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;margin:0">Bunu sen istemediysen bu e-postayı yok sayabilirsin — onaylamadıkça sana kampanya e-postası göndermeyiz.</p>`;
  return sendRawSiteMail(to, `${storeName} — bülten aboneliğini onayla`, buildEmailDocument(body, storeName));
}

/** Hoş geldin e-postası (gönderim hatası kaydı engellemez) */
export async function sendNewsletterWelcome(contactId: string, email: string, to = email) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");
  const { data: st } = await (createAdminClient() as any).from("settings").select("store_name").order("id").limit(1).maybeSingle();
  const tpl = await renderEmailTemplate("newsletter_welcome", {
    store_url: site, store_name: st?.store_name || "YeriHisset", unsubscribe_url: contactConsentUrl(contactId, true), email: escapeHtml(email),
  });
  if (!tpl) return { status: "skipped" as const, error: "“newsletter_welcome” şablonu kapalı ya da yok" };
  return sendRawSiteMail(to, tpl.subject, tpl.html);
}
