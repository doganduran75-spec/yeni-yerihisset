import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Mesafeli Satış Sözleşmesi",
  robots: { index: false, follow: true }, // taslak
};

export default function MesafeliSatisPage() {
  return (
    <LegalPageLayout
      title="Mesafeli Satış Sözleşmesi"
      intro="İşbu sözleşme, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca düzenlenmiştir."
    >
      <h2>Taraflar</h2>
      <p>(Yer tutucu — satıcı ve alıcı bilgileri.)</p>
      <h2>Sözleşme Konusu ve Ürün</h2>
      <p>(Yer tutucu — sipariş edilen ürün/hizmet, fiyat, ödeme ve teslimat bilgileri.)</p>
      <h2>Cayma Hakkı</h2>
      <p>(Yer tutucu — 14 günlük cayma hakkı koşulları ve istisnaları.)</p>
      <h2>Teslimat ve İfa</h2>
      <p>(Yer tutucu — teslim süresi, kargo, teslim yeri.)</p>
      <h2>Uyuşmazlık Çözümü</h2>
      <p>(Yer tutucu — Tüketici Hakem Heyeti / Tüketici Mahkemeleri.)</p>
    </LegalPageLayout>
  );
}
