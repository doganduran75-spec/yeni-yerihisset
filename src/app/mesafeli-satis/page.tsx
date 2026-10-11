import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout from "@/components/LegalPageLayout";
import { COMPANY, orTodo } from "@/config/company";

export const metadata: Metadata = {
  title: "Mesafeli Satış Sözleşmesi ve Ön Bilgilendirme Formu",
  robots: { index: false, follow: true }, // taslak — onaylanınca kaldır
};

// 6502 sayılı Tüketicinin Korunması Hakkında Kanun + Mesafeli Sözleşmeler Yönetmeliği. Siparişe özel bilgiler
// (ürün, adet, fiyat, kargo, ödeme yöntemi, teslimat adresi) ödeme sayfasındaki sipariş özetinde ve sipariş onay
// e-postasında yer alır; bu metin onlarla birlikte sözleşmeyi oluşturur.
export default function MesafeliSatisPage() {
  const seller = (
    <ul>
      <li><b>Unvan:</b> {COMPANY.title} ({COMPANY.brand})</li>
      <li><b>Adres:</b> {COMPANY.address}</li>
      <li><b>Vergi dairesi / no:</b> {COMPANY.taxOffice} / {COMPANY.taxNumber} · <b>MERSİS:</b> {orTodo(COMPANY.mersis)}</li>
      <li><b>E-posta:</b> {COMPANY.email} · <b>Telefon:</b> {orTodo(COMPANY.phone)} · <b>KEP:</b> {orTodo(COMPANY.kep)}</li>
    </ul>
  );

  return (
    <LegalPageLayout
      title="Mesafeli Satış Sözleşmesi"
      intro="Bu sözleşme, sitemizden verdiğiniz siparişe ilişkin hak ve yükümlülükleri 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca düzenler. Siparişinizi onaylamadan önce aşağıdaki Ön Bilgilendirme Formu ile birlikte okumanızı rica ederiz."
      updated={COMPANY.legalUpdated}
    >
      <h2>1. Taraflar</h2>
      <p><b>Satıcı:</b></p>
      {seller}
      <p><b>Alıcı:</b> Siparişi veren kişi; ad, adres ve iletişim bilgileri sipariş formunda belirttiği gibidir.</p>

      <h2>2. Konu, ürün ve fiyat</h2>
      <p>
        Sözleşmenin konusu, Alıcı&apos;nın sitede siparişini verdiği ürünlerin satışı ve teslimidir. Ürünlerin temel
        nitelikleri ürün sayfasında; adet, satış fiyatı (KDV dahil), kargo ücreti, ödeme yöntemi ve teslimat adresi
        sipariş özetinde ve sipariş onay e-postasında yer alır. Fiyatlar sipariş anında geçerli olanlardır.
      </p>

      <h2>3. Ödeme</h2>
      <p>
        Ödeme kredi/banka kartı (iyzico güvencesiyle, 3D Secure) veya havale/EFT ile yapılır. Havale/EFT siparişleri,
        ödeme 24 saat içinde hesabımıza geçmezse iptal edilir.
      </p>

      <h2>4. Teslimat</h2>
      <p>
        Ürünler ödemenin onaylanmasından sonra genellikle 1–3 iş günü içinde kargoya verilir; teslim süresi her hâlükârda
        yasal üst sınır olan 30 günü aşmaz. Teslimat, Alıcı&apos;nın belirttiği adrese ve kişiye yapılır. Paket hasarlı
        gelirse lütfen kargo görevlisine tutanak tutturarak teslim almayın ve bize bildirin. Ürünü teslim süresi içinde
        gönderemezsek sizi bilgilendirir, isterseniz ödediğiniz tutarı 14 gün içinde iade ederiz.
      </p>

      <h2>5. Cayma hakkı</h2>
      <ul>
        <li>Ürünü teslim aldığınız günden itibaren <b>14 gün</b> içinde, hiçbir gerekçe göstermeden ve cezai şart ödemeden sözleşmeden cayabilirsiniz. Teslimattan önce de cayabilirsiniz.</li>
        <li>Cayma bildirimini Hesabım › Siparişlerim üzerinden, sipariş e-postalarındaki bağlantıdan ya da {COMPANY.email} adresine yazarak yapabilirsiniz.</li>
        <li>Ürünü, bildiriminizden itibaren 14 gün içinde size ileteceğimiz iade kargo koduyla, bizim belirlediğimiz kargo firmasıyla geri gönderirsiniz. Bu durumda <b>iade kargo ücreti bize aittir.</b></li>
        <li>Ödediğiniz tutar (varsa size gönderimdeki kargo ücreti dahil), cayma bildiriminizin bize ulaştığı tarihten itibaren <b>en geç 14 gün içinde</b> ödeme yaptığınız yöntemle iade edilir.</li>
        <li>Ürün; kutusu, etiketi ve varsa birlikte gönderilen hediyeyle geri gönderilmelidir. Ürünü evde denemeniz hakkınızdır; ancak olağan denemenin ötesinde kullanım (ör. dışarıda giyilme) nedeniyle oluşan değer kaybından Alıcı sorumludur.</li>
        <li>Kişiye özel üretilen veya kişiselleştirilen ürünlerde cayma hakkı yoktur.</li>
      </ul>
      <p>Değişim ve iade adımları için: <Link href="/iade-degisim">İade, Değişim ve Teslimat</Link>.</p>

      <h2>6. Ayıplı ürün</h2>
      <p>
        Ürün ayıplı çıkarsa 6502 sayılı Kanun&apos;un 11. maddesindeki haklarınızı (sözleşmeden dönme, bedel indirimi,
        ücretsiz onarım veya ayıpsız misliyle değişim) kullanabilirsiniz. Ayıplı ürünün gönderim masrafları bize aittir.
      </p>

      <h2>7. Uyuşmazlık</h2>
      <p>
        Şikâyet ve itirazlarınızı öncelikle {COMPANY.email} adresine iletebilirsiniz. Uyuşmazlıklarda, Ticaret Bakanlığı&apos;nca
        her yıl ilan edilen parasal sınırlar içinde yerleşim yerinizdeki veya işlemi yaptığınız yerdeki <b>Tüketici Hakem
        Heyeti</b>&apos;ne, sınırın üzerinde <b>Tüketici Mahkemesi</b>&apos;ne başvurabilirsiniz.
      </p>

      <h2>8. Yürürlük</h2>
      <p>
        Alıcı, sipariş öncesinde Ön Bilgilendirme Formu&apos;nu ve bu sözleşmeyi okuduğunu, siparişi onaylamakla ödeme
        yükümlülüğü altına girdiğini kabul eder. Sözleşme sipariş onayıyla kurulur; bir örneği sipariş onay e-postasıyla
        Alıcı&apos;ya iletilir ve Satıcı tarafından 3 yıl saklanır.
      </p>

      <h2 id="on-bilgilendirme" className="scroll-mt-24 !mt-14">Ön Bilgilendirme Formu</h2>
      <p>Siparişinizi onaylamadan önce bilmeniz gerekenler:</p>
      <h3>Satıcı</h3>
      {seller}
      <h3>Ürün ve fiyat</h3>
      <p>Ürünün temel nitelikleri ürün sayfasında; adet, toplam fiyat (vergiler dahil), kargo ücreti ve ödeme yöntemi ödeme sayfasındaki sipariş özetinde yer alır.</p>
      <h3>Teslimat</h3>
      <p>Ödeme onayından sonra genellikle 1–3 iş günü içinde kargoya verilir; en geç 30 gün içinde teslim edilir.</p>
      <h3>Cayma hakkı</h3>
      <p>
        Teslimden itibaren 14 gün içinde gerekçesiz cayabilirsiniz. Bildirim: Hesabım › Siparişlerim, sipariş
        e-postasındaki bağlantı veya {COMPANY.email}. İade kargosu, bildirdiğimiz firmayla ücretsizdir; ödemeniz 14 gün
        içinde iade edilir.
      </p>
      <h3>Şikâyet</h3>
      <p>{COMPANY.email} · Tüketici Hakem Heyeti / Tüketici Mahkemesi.</p>
    </LegalPageLayout>
  );
}
