import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";
import { MapPin, Phone, Mail, Clock, Building2, MessageCircle } from "lucide-react";
import { COMPANY } from "@/config/company";
import { getCompany, orTodo, waNumber } from "@/lib/static-pages";

// Künye: Ayarlar › Sayfalar › Şirket künyesi (settings) — e-ticaret mevzuatı: unvan, adres, iletişim, MERSİS, KEP sitede görünmeli.
// Telefon / MERSİS / KEP girilene kadar arama motoruna kapalı.
export const revalidate = 60;
export async function generateMetadata(): Promise<Metadata> {
  const c = await getCompany();
  const complete = !!(c.phone && c.mersis && c.kep);
  return { alternates: { canonical: "/iletisim" }, title: "İletişim", ...(complete ? {} : { robots: { index: false, follow: true } }) };
}

export default async function IletisimPage() {
  const COMPANY_ = await getCompany();
  const CONTACT = { address: COMPANY_.address, phone: orTodo(COMPANY_.phone), email: COMPANY_.email, hours: COMPANY.hours };
  // WhatsApp düğmesi: yalnız wa.me bağlantısı (Meta script'i yüklenmez → çerez onayı gerekmez)
  const wa = COMPANY_.whatsappButton ? waNumber(COMPANY_.whatsapp) : null;
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent("Merhaba, YeriHisset hakkında bir sorum var.")}` : null;
  return (
    <LegalPageLayout
      title="İletişim"
      intro="Sorularınız, siparişleriniz ve iş birlikleri için bize ulaşın."
      draft={false}
    >

      <div className="grid sm:grid-cols-2 gap-4 not-prose">
        <div className="flex items-start gap-3 rounded-2xl border border-olive-100 bg-white p-4">
          <MapPin className="text-olive-600 shrink-0" size={20} />
          <div><p className="font-black text-slate-900 text-sm">Adres</p><p className="text-sm text-slate-600">{CONTACT.address}</p></div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-olive-100 bg-white p-4">
          <Phone className="text-olive-600 shrink-0" size={20} />
          <div>
            <p className="font-black text-slate-900 text-sm">{COMPANY_.whatsappOnly ? "Telefon / WhatsApp" : "Telefon"}</p>
            <p className="text-sm text-slate-600">{CONTACT.phone}</p>
            {COMPANY_.whatsappOnly && <p className="text-xs text-slate-500 mt-0.5">Yalnız WhatsApp mesajı — telefonla arama alınmıyor.</p>}
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-olive-100 bg-white p-4">
          <Mail className="text-olive-600 shrink-0" size={20} />
          <div><p className="font-black text-slate-900 text-sm">E-posta</p><p className="text-sm text-slate-600">{CONTACT.email}</p></div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-olive-100 bg-white p-4">
          <Clock className="text-olive-600 shrink-0" size={20} />
          <div><p className="font-black text-slate-900 text-sm">Çalışma Saatleri</p><p className="text-sm text-slate-600">{CONTACT.hours}</p></div>
        </div>
      </div>

      {waHref && (
        <div className="not-prose flex flex-wrap items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
          <a href={waHref} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-black text-white hover:brightness-95">
            <MessageCircle size={18} /> WhatsApp&apos;tan yaz
          </a>
          <p className="text-sm text-slate-600">{COMPANY_.whatsappHours || "Mesajlarınızı en kısa sürede yanıtlıyoruz."}</p>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-olive-100 bg-white p-4">
        <Building2 className="text-olive-600 shrink-0" size={20} />
        <div className="text-sm text-slate-600">
          <p className="font-black text-slate-900">{COMPANY_.title}</p>
          <p>{COMPANY_.taxOffice} V.D. · {COMPANY_.taxNumber} · MERSİS: {orTodo(COMPANY_.mersis)} · KEP: {orTodo(COMPANY_.kep)}</p>
          <p className="mt-1">Showroom / mağazamız yoktur; satışlarımız yalnız internet üzerindendir.</p>
        </div>
      </div>
    </LegalPageLayout>
  );
}
