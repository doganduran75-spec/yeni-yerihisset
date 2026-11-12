/* eslint-disable @typescript-eslint/no-explicit-any */
// BÜLTEN KAYDI (kullanıcı 2026-11-12): kayıt olana "hoş geldin" e-postası (çıkış bağlantısı + "her bültenin altında
// abonelikten çık var" bilgisi), zaten listedeyse "zaten listemizdesiniz". Şablon: email_templates 'newsletter_welcome'
// (MIG 20261179; panelden düzenlenir / kapatılır). Kullanım: src/app/api/newsletter/route.ts, E-posta denemesi
import { renderEmailTemplate, escapeHtml } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendRawSiteMail } from "@/lib/site-mail";
import { contactConsentUrl } from "@/lib/marketing-consent";

export type NewsletterResult = "subscribed" | "resubscribed" | "already" | "member_opted_out";

/** Formda gösterilecek metin (Footer + DesktopHome aynı) */
export function newsletterMessage(r: NewsletterResult): string {
  switch (r) {
    case "already": return "Bu e-posta zaten bülten listemizde. Teşekkürler!";
    case "member_opted_out": return "Bu e-posta bir üye hesabına ait ve kampanya e-postaları kapalı. Açmak için Hesabım'daki kampanya e-postası seçeneğini işaretleyin.";
    default: return "Bültenimize katıldınız! Hoş geldin e-postası gönderdik.";
  }
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
