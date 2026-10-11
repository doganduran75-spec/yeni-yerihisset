import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout from "@/components/LegalPageLayout";
import { COMPANY, orTodo } from "@/config/company";

export const metadata: Metadata = {
  alternates: { canonical: "/kvkk" },
  title: "KVKK Aydınlatma Metni",
  robots: { index: false, follow: true }, // taslak — onaylanınca kaldır
};

export default function KvkkPage() {
  return (
    <LegalPageLayout
      title="KVKK Aydınlatma Metni"
      intro="Kişisel verilerinizi hangi amaçla işlediğimizi, kimlerle paylaştığımızı ve haklarınızı 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) uyarınca aşağıda açıklıyoruz."
      updated={COMPANY.legalUpdated}
    >
      <h2>1. Veri sorumlusu</h2>
      <p>
        {COMPANY.title} ({COMPANY.brand}) — {COMPANY.address}. E-posta: {COMPANY.email} · KEP: {orTodo(COMPANY.kep)}
      </p>

      <h2>2. Hangi verileri, neden işliyoruz?</h2>
      <table>
        <thead><tr><th>Veri</th><th>Amaç</th><th>Hukuki sebep (KVKK md. 5)</th></tr></thead>
        <tbody>
          <tr>
            <td>Ad soyad, e-posta, telefon, teslimat ve fatura adresi; kurumsal faturada vergi dairesi ve numarası</td>
            <td>Üyelik, siparişin alınması, teslimatı, faturalandırılması</td>
            <td>Sözleşmenin kurulması ve ifası; kanuni yükümlülük (fatura, tüketici mevzuatı)</td>
          </tr>
          <tr>
            <td>Sipariş, ödeme ve iade kayıtları; iade için IBAN</td>
            <td>Ödemenin alınması, iade ve değişim, muhasebe</td>
            <td>Sözleşmenin ifası; kanuni yükümlülük</td>
          </tr>
          <tr>
            <td>Mesajlarınız, değişim/iade talepleriniz, ürün yorumlarınız</td>
            <td>Sorularınızı yanıtlamak, satış sonrası hizmet</td>
            <td>Sözleşmenin ifası; meşru menfaat</td>
          </tr>
          <tr>
            <td>Stok bildirimi ve talep formlarında verdiğiniz e-posta, telefon, Instagram adı, numara bilgisi</td>
            <td>İstediğiniz ürün stoğa girince size haber vermek</td>
            <td>Talebinizle kurulan ilişkinin ifası</td>
          </tr>
          <tr>
            <td>E-posta adresiniz (kampanya izni verdiyseniz)</td>
            <td>Kampanya ve yeni ürün duyuruları</td>
            <td>Açık rızanız / ticari ileti izniniz — istediğiniz an geri alabilirsiniz</td>
          </tr>
          <tr>
            <td>IP adresi, tarayıcı bilgisi, ziyaret edilen sayfalar</td>
            <td>Site güvenliği, kötüye kullanımın önlenmesi, ziyaret istatistiği</td>
            <td>Meşru menfaat; istatistik ve reklam ölçümü için çerez tercihiniz (<Link href="/cerez-politikasi">Çerez Politikası</Link>)</td>
          </tr>
        </tbody>
      </table>
      <p>
        Kart bilgileriniz sitemize kaydedilmez; ödeme sırasında doğrudan lisanslı ödeme kuruluşu iyzico&apos;ya iletilir.
        Verileriniz site formları, e-posta ve çerezler aracılığıyla elektronik ortamda toplanır.
      </p>

      <h2>3. Verileriniz kimlere aktarılır?</h2>
      <ul>
        <li><b>Kargo firmaları</b> (UPS, Sürat Kargo, Aras Kargo; Kargonomi aracılığıyla) — teslimat ve iade gönderisi için.</li>
        <li><b>iyzico</b> — kartlı ödemenin alınması ve iadesi için.</li>
        <li><b>Muhasebe ve e-fatura hizmeti aldığımız kişi/kuruluşlar</b> — yasal kayıt ve fatura için.</li>
        <li><b>Barındırma hizmeti:</b> sitemiz ve veritabanımız {COMPANY.hosting} sunucularında tutulur. Bu aktarım KVKK md. 9 kapsamında, Kurul&apos;un ilan ettiği standart sözleşme ile yapılır.</li>
        <li><b>Google ve Meta</b> — yalnız çerezlere onay verdiyseniz, ziyaret istatistiği ve reklam ölçümü için (yurt dışında işlenir).</li>
        <li><b>Yetkili kamu kurumları</b> — yasal zorunluluk hâlinde.</li>
      </ul>

      <h2>4. Ne kadar süre saklıyoruz?</h2>
      <p>
        Sipariş ve fatura kayıtlarını yasal saklama süreleri boyunca (ticari defter ve belgelerde 10 yıl, mesafeli satış
        kayıtlarında 3 yıl) saklarız. Kampanya izni, geri alınana kadar; ziyaret kayıtları en fazla 1 yıl tutulur. Süresi
        dolan veriler silinir veya anonim hâle getirilir.
      </p>

      <h2>5. Haklarınız (KVKK md. 11)</h2>
      <p>Verilerinizin işlenip işlenmediğini öğrenme, bilgi isteme, düzeltilmesini veya silinmesini isteme, aktarıldığı kişileri öğrenme, otomatik analiz sonucuna itiraz etme ve zarar hâlinde tazminat isteme haklarına sahipsiniz.</p>
      <p>
        Başvurunuzu üyelikte kayıtlı e-posta adresinizden <b>{COMPANY.email}</b> adresine, yazılı olarak yukarıdaki adrese ya da
        KEP ile iletebilirsiniz. Başvurunuz en geç 30 gün içinde ücretsiz sonuçlandırılır.
      </p>
    </LegalPageLayout>
  );
}
