import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "İade, Değişim ve Teslimat",
  robots: { index: false, follow: true }, // taslak
};

export default function IadeDegisimPage() {
  return (
    <LegalPageLayout
      title="İade, Değişim ve Teslimat"
      intro="Siparişlerinizin teslimatı, iade ve değişim koşullarına dair bilgiler."
    >
      <h2>Teslimat</h2>
      <p>(Yer tutucu — kargo süreleri, ücretsiz kargo eşiği, kapsam.)</p>
      <h2>İade Koşulları</h2>
      <p>(Yer tutucu — 14 gün içinde iade, ürünün kullanılmamış/kutusunda olması, iade süreci.)</p>
      <h2>Değişim</h2>
      <p>(Yer tutucu — numara/model değişimi nasıl yapılır.)</p>
      <h2>İade Bedelinin İadesi</h2>
      <p>(Yer tutucu — ödeme yöntemine göre iade süresi ve şekli.)</p>
    </LegalPageLayout>
  );
}
