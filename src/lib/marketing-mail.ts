/* eslint-disable @typescript-eslint/no-explicit-any */
// KAMPANYA E-POSTASI KURALI (6563 sayılı Kanun / İYS; docs/HUKUKI-METINLER-NOTLAR.md C1):
//   - Kampanya (toplu e-posta) ve sepet hatırlatması YALNIZ izinli alıcıya gider:
//       üye → profiles.marketing_consent = true
//       üye olmayan kişi (bülten) → contacts.marketing_consent = true ve çıkış yapmamış
//     Üye izni açıkça geri aldıysa (marketing_consent=false + tarih dolu) bülten kaydı da sayılmaz.
//   - Her kampanya e-postasının altında kişiye özel "abonelikten çık" bağlantısı + List-Unsubscribe başlığı.
// Kural GÖNDERİM ANINDA uygulanır (kuyruk işleyicileri) → kuyruğa girdikten sonra izni geri alan da almaz.
// İşlemsel e-postalar (sipariş, kargo, şifre, ödenmemiş siparişin hatırlatması) bu kurala tabi değildir.
import { consentUrl, contactConsentUrl } from "@/lib/marketing-consent";

export const MARKETING_KINDS = new Set(["campaign", "cart_abandonment"]);

export type Recipient = { email: string; userId?: string; contactId?: string };

const chunks = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Verilen adreslerden kampanya iznine sahip olanlar (küçük harf e-posta → alıcı) */
export async function marketingEligible(sb: any, emails: string[]): Promise<Map<string, Recipient>> {
  const list = [...new Set(emails.map((e) => String(e || "").trim().toLowerCase()).filter((e) => e.includes("@")))];
  const out = new Map<string, Recipient>();
  const optedOut = new Set<string>();
  for (const part of chunks(list)) {
    const { data: profs } = await sb.from("profiles").select("id, email, marketing_consent, marketing_consent_at").in("email", part);
    for (const p of (profs as any[]) || []) {
      const e = String(p.email || "").toLowerCase();
      if (p.marketing_consent) out.set(e, { email: e, userId: p.id });
      else if (p.marketing_consent_at) optedOut.add(e); // açıkça geri aldı
    }
    const { data: cons } = await sb.from("contacts").select("id, email, marketing_consent, marketing_opt_out_at").in("email", part);
    for (const c of (cons as any[]) || []) {
      const e = String(c.email || "").toLowerCase();
      if (!out.has(e) && !optedOut.has(e) && c.marketing_consent && !c.marketing_opt_out_at) out.set(e, { email: e, contactId: c.id });
    }
  }
  return out;
}

/** "Tüm izinliler" listesi (toplu e-posta → Herkes) */
export async function allMarketingRecipients(sb: any): Promise<Recipient[]> {
  const emails: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("profiles").select("email").eq("marketing_consent", true).not("email", "is", null).order("id").range(from, from + 999);
    emails.push(...((data as any[]) || []).map((p) => p.email));
    if (!data || data.length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("contacts").select("email").eq("marketing_consent", true).is("marketing_opt_out_at", null).not("email", "is", null).order("id").range(from, from + 999);
    emails.push(...((data as any[]) || []).map((c) => c.email));
    if (!data || data.length < 1000) break;
  }
  return [...(await marketingEligible(sb, emails)).values()];
}

export function unsubscribeUrl(r: Recipient): string | null {
  if (r.userId) return consentUrl(r.userId, true);
  if (r.contactId) return contactConsentUrl(r.contactId, true);
  return null;
}

/** Kampanya e-postasının altına kişiye özel çıkış bağlantısı */
export function withUnsubscribeFooter(html: string, url: string | null, storeName: string): string {
  if (!url) return html;
  const footer = `<div style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;line-height:1.6">
Bu e-postayı ${storeName} kampanya duyurularına izin verdiğin için aldın.<br>
Almak istemiyorsan <a href="${url}" style="color:#6b7280;text-decoration:underline">abonelikten çık</a>.</div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : html + footer;
}
