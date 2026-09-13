import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "İletişim",
  robots: { index: false, follow: true }, // gerçek bilgiler girilip taslak kalkınca index'e aç
};

// NOT: Aşağıdaki adres/telefon/e-posta YER TUTUCU'dur — gerçek bilgilerle değiştir.
const CONTACT = {
  company: "YeriHisset",
  address: "(Adres buraya — mah./cadde/no, ilçe/il)",
  phone: "(Telefon numarası)",
  email: "(iletisim@yerihisset.com)",
  hours: "Hafta içi 09:00 – 18:00",
};

export default function IletisimPage() {
  return (
    <LegalPageLayout
      title="İletişim"
      intro="Sorularınız, siparişleriniz ve iş birlikleri için bize ulaşın."
      draft={false}
    >
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        <b>Yer tutucu:</b> Aşağıdaki iletişim bilgileri örnektir; gerçek adres/telefon/e-posta ile güncellenmeli
        (yasal olarak da zorunlu).
      </div>

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
    </LegalPageLayout>
  );
}
