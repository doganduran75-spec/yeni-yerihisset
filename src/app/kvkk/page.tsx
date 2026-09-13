import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni",
  robots: { index: false, follow: true }, // taslak
};

export default function KvkkPage() {
  return (
    <LegalPageLayout
      title="KVKK Aydınlatma Metni"
      intro="6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında veri sorumlusu sıfatıyla aydınlatma yükümlülüğümüz gereği hazırlanmıştır."
    >
      <h2>Veri Sorumlusu</h2>
      <p>(Yer tutucu — şirket unvanı, adres, iletişim.)</p>
      <h2>İşlenen Kişisel Veriler ve Amaçları</h2>
      <p>(Yer tutucu — kimlik, iletişim, müşteri işlem, işlem güvenliği, pazarlama verileri ve işleme amaçları.)</p>
      <h2>Hukuki Sebep ve Aktarım</h2>
      <p>(Yer tutucu — işleme şartları ve kimlere/hangi amaçla aktarıldığı.)</p>
      <h2>KVKK 11. Madde Hakları</h2>
      <p>(Yer tutucu — bilgi talep etme, düzeltme, silme, itiraz hakları ve başvuru yöntemi.)</p>
    </LegalPageLayout>
  );
}
