import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Çerez Politikası",
  robots: { index: false, follow: true }, // taslak
};

export default function CerezPolitikasiPage() {
  return (
    <LegalPageLayout
      title="Çerez (Cookie) Politikası"
      intro="Sitemizde deneyiminizi iyileştirmek ve ziyaret istatistiklerini analiz etmek için çerezler kullanıyoruz."
    >
      <h2>Çerez Nedir?</h2>
      <p>(Yer tutucu — çerez tanımı.)</p>
      <h2>Kullandığımız Çerez Türleri</h2>
      <ul>
        <li><b>Zorunlu çerezler:</b> sepet, oturum gibi sitenin çalışması için gerekli.</li>
        <li><b>Analitik çerezler:</b> Google Analytics + kendi ziyaret analizimiz (onaya bağlı).</li>
      </ul>
      <h2>Çerez Tercihleriniz</h2>
      <p>(Yer tutucu — çerezleri tarayıcıdan yönetme + site çerez banner'ından onay/ret.)</p>
    </LegalPageLayout>
  );
}
