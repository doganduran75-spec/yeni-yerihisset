import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";
import { MapPin, Phone, Mail, Clock, Building2 } from "lucide-react";
import { COMPANY, orTodo } from "@/config/company";

export const metadata: Metadata = {
  alternates: { canonical: "/iletisim" },
  title: "İletişim",
  robots: { index: false, follow: true }, // telefon + MERSİS + KEP girilince kaldır (src/config/company.ts)
};

// Künye src/config/company.ts'ten (e-ticaret mevzuatı: unvan, adres, iletişim, MERSİS, KEP sitede görünmeli)
const CONTACT = {
  address: COMPANY.address,
  phone: orTodo(COMPANY.phone),
  email: COMPANY.email,
  hours: COMPANY.hours,
};

export default function IletisimPage() {
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
          <div><p className="font-black text-slate-900 text-sm">Telefon</p><p className="text-sm text-slate-600">{CONTACT.phone}</p></div>
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

      <div className="flex items-start gap-3 rounded-2xl border border-olive-100 bg-white p-4">
        <Building2 className="text-olive-600 shrink-0" size={20} />
        <div className="text-sm text-slate-600">
          <p className="font-black text-slate-900">{COMPANY.title}</p>
          <p>{COMPANY.taxOffice} V.D. · {COMPANY.taxNumber} · MERSİS: {orTodo(COMPANY.mersis)} · KEP: {orTodo(COMPANY.kep)}</p>
          <p className="mt-1">Showroom / mağazamız yoktur; satışlarımız yalnız internet üzerindendir.</p>
        </div>
      </div>
    </LegalPageLayout>
  );
}
