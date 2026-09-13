import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  robots: { index: false, follow: true }, // taslak — nihai metin gelince kaldır
};

export default function GizlilikPage() {
  return (
    <LegalPageLayout
      title="Gizlilik Politikası"
      intro="YeriHisset olarak kişisel verilerinizin gizliliğine önem veriyoruz. Bu politika, hangi verileri neden topladığımızı ve nasıl koruduğumuzu açıklar."
    >
      <h2>Toplanan Veriler</h2>
      <p>(Yer tutucu — hangi verilerin toplandığı: ad, e-posta, adres, sipariş bilgileri, site kullanım/analitik verileri vb. buraya yazılacak.)</p>
      <h2>Verilerin Kullanım Amacı</h2>
      <p>(Yer tutucu — sipariş işleme, teslimat, iletişim, yasal yükümlülükler, analiz.)</p>
      <h2>Üçüncü Taraflar</h2>
      <p>(Yer tutucu — ödeme sağlayıcı, kargo, e-posta ve analitik hizmetleri.)</p>
      <h2>Haklarınız</h2>
      <p>(Yer tutucu — KVKK kapsamındaki haklar; ayrıntı için KVKK Aydınlatma Metni.)</p>
      <h2>İletişim</h2>
      <p>(Yer tutucu — veri sorumlusu iletişim bilgileri.)</p>
    </LegalPageLayout>
  );
}
