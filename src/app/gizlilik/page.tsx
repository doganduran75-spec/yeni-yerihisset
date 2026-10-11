import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout from "@/components/LegalPageLayout";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  robots: { index: false, follow: true }, // taslak — onaylanınca kaldır
};

export default function GizlilikPage() {
  return (
    <LegalPageLayout
      title="Gizlilik Politikası"
      intro={`${COMPANY.brand} olarak bilgilerinizi yalnız alışverişinizi tamamlamak ve size daha iyi hizmet vermek için kullanırız. Kısaca nasıl koruduğumuzu aşağıda bulabilirsiniz.`}
      updated={COMPANY.legalUpdated}
    >
      <h2>Ne topluyoruz?</h2>
      <p>
        Sipariş ve üyelik için gerekli iletişim ve adres bilgilerinizi, sipariş geçmişinizi ve bize yazdığınız mesajları.
        Ayrıntılı liste, amaçlar ve haklarınız <Link href="/kvkk">KVKK Aydınlatma Metni</Link>&apos;nde yer alır.
      </p>

      <h2>Ödeme güvenliği</h2>
      <p>
        Kart bilgileriniz sitemizde saklanmaz. Kartlı ödemeler, BDDK lisanslı ödeme kuruluşu iyzico üzerinden ve 3D Secure
        doğrulamasıyla alınır. Sitemizle aranızdaki tüm iletişim SSL (HTTPS) ile şifrelenir.
      </p>

      <h2>Hesabınız</h2>
      <p>
        Şifreniz tek yönlü şifrelenerek saklanır; biz de göremeyiz. Bilgilerinizi Hesabım sayfasından güncelleyebilir,
        hesabınızın silinmesini {COMPANY.email} adresine yazarak isteyebilirsiniz.
      </p>

      <h2>Kampanya e-postaları</h2>
      <p>
        Kampanya e-postası yalnız izin verdiyseniz gönderilir. İzninizi Hesabım › Profil › İletişim tercihleri bölümünden
        ya da e-postalardaki bağlantıdan tek tıkla geri alabilirsiniz. Sipariş ve kargo bilgilendirmeleri bu izinden
        bağımsız olarak gönderilir.
      </p>

      <h2>Çerezler</h2>
      <p>
        Sitenin çalışması için gerekli olanlar dışındaki çerezler (istatistik ve reklam ölçümü) yalnız onayınızla
        kullanılır. Ayrıntılar ve tercih değiştirme: <Link href="/cerez-politikasi">Çerez Politikası</Link>.
      </p>

      <h2>Bilgilerinizi paylaşmıyoruz</h2>
      <p>
        Bilgilerinizi satmayız ve kiralamayız. Yalnız siparişinizi tamamlamak için gerekli olan hizmet sağlayıcılarla
        (kargo, ödeme, fatura) ve yasal zorunluluk hâlinde yetkili kurumlarla paylaşırız.
      </p>

      <h2>İletişim</h2>
      <p>Gizlilikle ilgili her sorunuz için: {COMPANY.email}</p>
    </LegalPageLayout>
  );
}
