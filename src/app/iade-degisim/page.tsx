import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout from "@/components/LegalPageLayout";
import { COMPANY } from "@/config/company";
import { TRIAL_DAYS } from "@/lib/order-next-step";

export const metadata: Metadata = {
  alternates: { canonical: "/iade-degisim" },
  title: "İade, Değişim ve Teslimat",
  robots: { index: false, follow: true }, // taslak — onaylanınca kaldır
};

export default function IadeDegisimPage() {
  return (
    <LegalPageLayout
      title="İade, Değişim ve Teslimat"
      intro="Barefoot ayakkabıda doğru numara önemli; acele etmeden evde denemenizi istiyoruz. Olmazsa değişim ve iade ücretsiz."
      updated={COMPANY.legalUpdated}
    >
      <h2>Teslimat</h2>
      <ul>
        <li>Siparişiniz ödeme onayından sonra genellikle <b>1–3 iş günü</b> içinde kargoya verilir; kargo takip numarası e-postanıza ve Hesabım › Siparişlerim&apos;e gelir.</li>
        <li>Kargo ücreti ve ücretsiz kargo sınırı ödeme sayfasında gösterilir.</li>
        <li>Paket hasarlıysa kargo görevlisine tutanak tutturun, teslim almayın ve bize yazın; ürününüzü yeniden göndeririz.</li>
      </ul>

      <h2>{TRIAL_DAYS} gün evde deneyin</h2>
      <p>
        Ürün elinize ulaştığında size bir e-posta gönderiyoruz. Ayakkabıyı evde, temiz bir zeminde, günün farklı saatlerinde
        deneyin. Karar verince e-postadaki ya da Hesabım › Siparişlerim&apos;deki <b>Oldu / Değişim / İade</b> düğmesine basın.
        Bunun için teslimattan itibaren <b>{TRIAL_DAYS} gününüz</b> var.
      </p>

      <h2>Değişim</h2>
      <ul>
        <li>Numarası olmadıysa size uygun numarayı öneririz; aynı modelin stokta olan numaraları gösterilir.</li>
        <li>İstediğiniz numara stokta yoksa aynı numarada başka bir model seçebilir, stoğa girmesini bekleyebilir ya da iade edebilirsiniz.</li>
        <li>Yeni ürün aynı fiyatla gönderilir; değişimde sizden ek kargo ücreti alınmaz.</li>
      </ul>

      <h2>İade</h2>
      <ul>
        <li>İade gönderimi için yöntemi siz seçersiniz: <b>UPS adresinizden alır</b> ya da <b>Sürat Kargo / Aras Kargo şubesine</b> teslim edersiniz. Size bir iade kodu gönderiyoruz; <b>iade kargosu ücretsizdir.</b></li>
        <li>Ürünü kutusu, etiketi ve varsa birlikte gönderilen hediyeyle, sağlam bir pakette gönderin.</li>
        <li>Evde denemek hakkınızdır; dışarıda giyilmiş veya yıpranmış ürünlerde değer kaybı iadeden düşülebilir.</li>
      </ul>

      <h2>Paranız ne zaman iade edilir?</h2>
      <ul>
        <li>İade talebiniz bize ulaştıktan sonra <b>en geç 14 gün içinde</b> ödeme yaptığınız yöntemle iade edilir.</li>
        <li><b>Kartla ödemede</b> tutar kartınıza iade edilir; hesabınıza yansıması bankanıza göre birkaç gün sürebilir.</li>
        <li><b>Havale/EFT&apos;de</b> iade talebinde bildirdiğiniz IBAN&apos;a gönderilir.</li>
        <li>Siparişte <b>YeriHisset Kredisi</b> kullandıysanız o kısım kredinize geri yüklenir.</li>
        <li>İndirimli bir kampanyadan aldığınız ürünlerin bir kısmını iade ederseniz ve kalan sepet kampanya koşulunu karşılamıyorsa, indirim tutarı iadeden düşülebilir.</li>
      </ul>

      <h2>Kusurlu ürün</h2>
      <p>Üründe üretim hatası görürseniz fotoğrafıyla {COMPANY.email} adresine yazın; tüm masrafları biz karşılarız.</p>

      <p>
        Yasal haklarınız ve ayrıntılar: <Link href="/mesafeli-satis">Mesafeli Satış Sözleşmesi</Link>. Sorularınız için: {COMPANY.email}
      </p>
    </LegalPageLayout>
  );
}
