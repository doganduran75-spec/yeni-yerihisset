import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout from "@/components/LegalPageLayout";
import CookiePreferencesLink from "@/components/CookiePreferencesLink";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = {
  alternates: { canonical: "/cerez-politikasi" },
  title: "Çerez Politikası",
  robots: { index: false, follow: true }, // taslak — onaylanınca kaldır
};

export default function CerezPolitikasiPage() {
  return (
    <LegalPageLayout
      title="Çerez Politikası"
      intro="Çerezler ve benzeri tarayıcı kayıtları, sitenin çalışmasını sağlayan ve ziyaretinizi hatırlayan küçük dosyalardır. Hangilerini neden kullandığımızı aşağıda açıklıyoruz."
      updated={COMPANY.legalUpdated}
    >
      <h2>Kullandığımız çerezler</h2>
      <table>
        <thead><tr><th>Tür</th><th>Ne işe yarar?</th><th>Onay</th></tr></thead>
        <tbody>
          <tr>
            <td><b>Zorunlu</b></td>
            <td>Sepetiniz, oturum açma, çerez tercihiniz, güvenlik. Bunlar olmadan site çalışmaz.</td>
            <td>Gerekmez</td>
          </tr>
          <tr>
            <td><b>İşlevsel</b></td>
            <td>Bir satış ortağımızın bağlantısıyla geldiyseniz, alışverişin ona yazılması için 30 gün saklanan kayıt; reklam bağlantısıyla geldiyseniz siparişin hangi kampanyadan geldiğinin kaydı.</td>
            <td>Gerekmez</td>
          </tr>
          <tr>
            <td><b>İstatistik</b></td>
            <td>Hangi sayfaların ziyaret edildiğini anlamak: kendi ziyaret istatistiğimiz ve Google Analytics.</td>
            <td>Reddederseniz kullanılmaz</td>
          </tr>
          <tr>
            <td><b>Reklam</b></td>
            <td>Instagram ve Facebook reklamlarımızın sonucunu ölçmek (Meta Pixel).</td>
            <td>Yalnız onayınızla</td>
          </tr>
        </tbody>
      </table>
      <p>
        Google ve Meta çerezleriyle toplanan bilgiler bu şirketlerin yurt dışındaki sunucularında işlenir. Ayrıntılar için{" "}
        <Link href="/kvkk">KVKK Aydınlatma Metni</Link>.
      </p>

      <h2>Tercihinizi nasıl değiştirirsiniz?</h2>
      <p>
        İlk ziyaretinizde çıkan pencereden <b>Kabul Et</b> ya da <b>Reddet</b> seçebilirsiniz; iki seçenek de eşittir,
        reddetmek alışverişinizi etkilemez. Kararınızı istediğiniz an değiştirmek için: <CookiePreferencesLink />.
        Tarayıcınızın ayarlarından da çerezleri silebilir veya engelleyebilirsiniz.
      </p>

      <h2>İletişim</h2>
      <p>Sorularınız için: {COMPANY.email}</p>
    </LegalPageLayout>
  );
}
