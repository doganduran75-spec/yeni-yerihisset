// DÜZENLENEBİLİR SAYFALAR — Ayarlar › Sayfalar'dan değiştirilir (tablo: static_pages, migration 20261110000001).
// Buradakiler VARSAYILAN metinlerdir: panelde hiç kaydedilmemiş sayfa bunu gösterir; panelde "Varsayılana dön"
// bu metni geri yükler. Metinlerde yer tutucular kullanılır → künye bir yerden değişince her sayfada güncellenir
// (src/lib/static-pages.ts › fillPlaceholders).

export type StaticPageSlug = "kvkk" | "gizlilik" | "cerez-politikasi" | "mesafeli-satis" | "iade-degisim" | "hakkimizda";

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "marka", label: "Marka adı (YeriHisset)" },
  { key: "unvan", label: "Şirket unvanı" },
  { key: "adres", label: "Adres" },
  { key: "eposta", label: "İletişim e-postası" },
  { key: "telefon", label: "Telefon" },
  { key: "vergi_dairesi", label: "Vergi dairesi" },
  { key: "vergi_no", label: "Vergi numarası" },
  { key: "mersis", label: "MERSİS no" },
  { key: "kep", label: "KEP adresi" },
  { key: "satici_bilgileri", label: "Satıcı bilgileri listesi (unvan, adres, vergi, iletişim)" },
  { key: "deneme_gunu", label: "Evde deneme / iade süresi (gün)" },
  { key: "barindirma", label: "Barındırma hizmeti (sunucu)" },
  { key: "istatistik_onay", label: "İstatistik çerezi onay cümlesi (Çerez Onayı ayarına göre)" },
  { key: "cerez_tercihleri", label: "\"Çerez tercihlerini değiştir\" bağlantısı" },
];

export const STATIC_PAGES: Record<StaticPageSlug, { title: string; intro: string; body: string; draftDefault: boolean }> = {
  kvkk: {
    title: "KVKK Aydınlatma Metni",
    intro: "Kişisel verilerinizi hangi amaçla işlediğimizi, kimlerle paylaştığımızı ve haklarınızı 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) uyarınca aşağıda açıklıyoruz.",
    draftDefault: true,
    body: `<h2>1. Veri sorumlusu</h2>
<p>{{unvan}} ({{marka}}) — {{adres}}. E-posta: {{eposta}} · KEP: {{kep}}</p>
<h2>2. Hangi verileri, neden işliyoruz?</h2>
<table><thead><tr><th>Veri</th><th>Amaç</th><th>Hukuki sebep (KVKK md. 5)</th></tr></thead><tbody>
<tr><td>Ad soyad, e-posta, telefon, teslimat ve fatura adresi; kurumsal faturada vergi dairesi ve numarası</td><td>Üyelik, siparişin alınması, teslimatı, faturalandırılması</td><td>Sözleşmenin kurulması ve ifası; kanuni yükümlülük (fatura, tüketici mevzuatı)</td></tr>
<tr><td>Sipariş, ödeme ve iade kayıtları; iade için IBAN</td><td>Ödemenin alınması, iade ve değişim, muhasebe</td><td>Sözleşmenin ifası; kanuni yükümlülük</td></tr>
<tr><td>Mesajlarınız, değişim/iade talepleriniz, ürün yorumlarınız</td><td>Sorularınızı yanıtlamak, satış sonrası hizmet</td><td>Sözleşmenin ifası; meşru menfaat</td></tr>
<tr><td>Stok bildirimi ve talep formlarında verdiğiniz e-posta, telefon, Instagram adı, numara bilgisi</td><td>İstediğiniz ürün stoğa girince size haber vermek</td><td>Talebinizle kurulan ilişkinin ifası</td></tr>
<tr><td>E-posta adresiniz (kampanya izni verdiyseniz)</td><td>Kampanya ve yeni ürün duyuruları</td><td>Açık rızanız / ticari ileti izniniz — istediğiniz an geri alabilirsiniz</td></tr>
<tr><td>IP adresi, tarayıcı bilgisi, ziyaret edilen sayfalar</td><td>Site güvenliği, kötüye kullanımın önlenmesi, ziyaret istatistiği</td><td>Meşru menfaat; istatistik ve reklam ölçümü için çerez tercihiniz (<a href="/cerez-politikasi">Çerez Politikası</a>)</td></tr>
</tbody></table>
<p>Kart bilgileriniz sitemize kaydedilmez; ödeme sırasında doğrudan lisanslı ödeme kuruluşu iyzico'ya iletilir. Verileriniz site formları, e-posta ve çerezler aracılığıyla elektronik ortamda toplanır.</p>
<h2>3. Verileriniz kimlere aktarılır?</h2>
<ul>
<li><b>Kargo firmaları</b> (UPS, Sürat Kargo, Aras Kargo; Kargonomi aracılığıyla) — teslimat ve iade gönderisi için.</li>
<li><b>iyzico</b> — kartlı ödemenin alınması ve iadesi için.</li>
<li><b>Muhasebe ve e-fatura hizmeti aldığımız kişi/kuruluşlar</b> — yasal kayıt ve fatura için.</li>
<li><b>Barındırma hizmeti:</b> sitemiz ve veritabanımız {{barindirma}} sunucularında tutulur. Bu aktarım KVKK md. 9 kapsamında, Kurul'un ilan ettiği standart sözleşme ile yapılır.</li>
<li><b>Google ve Meta</b> — yalnız çerezlere onay verdiyseniz, ziyaret istatistiği ve reklam ölçümü için (yurt dışında işlenir).</li>
<li><b>Yetkili kamu kurumları</b> — yasal zorunluluk hâlinde.</li>
</ul>
<h2>4. Ne kadar süre saklıyoruz?</h2>
<p>Sipariş ve fatura kayıtlarını yasal saklama süreleri boyunca (ticari defter ve belgelerde 10 yıl, mesafeli satış kayıtlarında 3 yıl) saklarız. Kampanya izni, geri alınana kadar; ziyaret kayıtları en fazla 1 yıl tutulur. Süresi dolan veriler silinir veya anonim hâle getirilir.</p>
<h2>5. Haklarınız (KVKK md. 11)</h2>
<p>Verilerinizin işlenip işlenmediğini öğrenme, bilgi isteme, düzeltilmesini veya silinmesini isteme, aktarıldığı kişileri öğrenme, otomatik analiz sonucuna itiraz etme ve zarar hâlinde tazminat isteme haklarına sahipsiniz.</p>
<p>Başvurunuzu üyelikte kayıtlı e-posta adresinizden <b>{{eposta}}</b> adresine, yazılı olarak yukarıdaki adrese ya da KEP ile iletebilirsiniz. Başvurunuz en geç 30 gün içinde ücretsiz sonuçlandırılır.</p>`,
  },

  gizlilik: {
    title: "Gizlilik Politikası",
    intro: "{{marka}} olarak bilgilerinizi yalnız alışverişinizi tamamlamak ve size daha iyi hizmet vermek için kullanırız. Kısaca nasıl koruduğumuzu aşağıda bulabilirsiniz.",
    draftDefault: true,
    body: `<h2>Ne topluyoruz?</h2>
<p>Sipariş ve üyelik için gerekli iletişim ve adres bilgilerinizi, sipariş geçmişinizi ve bize yazdığınız mesajları. Ayrıntılı liste, amaçlar ve haklarınız <a href="/kvkk">KVKK Aydınlatma Metni</a>'nde yer alır.</p>
<h2>Ödeme güvenliği</h2>
<p>Kart bilgileriniz sitemizde saklanmaz. Kartlı ödemeler, BDDK lisanslı ödeme kuruluşu iyzico üzerinden ve 3D Secure doğrulamasıyla alınır. Sitemizle aranızdaki tüm iletişim SSL (HTTPS) ile şifrelenir.</p>
<h2>Hesabınız</h2>
<p>Şifreniz tek yönlü şifrelenerek saklanır; biz de göremeyiz. Bilgilerinizi Hesabım sayfasından güncelleyebilir, hesabınızın silinmesini {{eposta}} adresine yazarak isteyebilirsiniz.</p>
<h2>Kampanya e-postaları</h2>
<p>Kampanya e-postası yalnız izin verdiyseniz gönderilir. İzninizi Hesabım › Profil › İletişim tercihleri bölümünden ya da e-postalardaki bağlantıdan tek tıkla geri alabilirsiniz. Sipariş ve kargo bilgilendirmeleri bu izinden bağımsız olarak gönderilir.</p>
<h2>Çerezler</h2>
<p>İstatistik ve reklam ölçümü çerezleri için tercihinizi çerez penceresinden yaparsınız; reklam çerezleri (Meta, Google) yalnız onayınızla çalışır. Ayrıntılar: <a href="/cerez-politikasi">Çerez Politikası</a> · {{cerez_tercihleri}}</p>
<h2>Bilgilerinizi paylaşmıyoruz</h2>
<p>Bilgilerinizi satmayız ve kiralamayız. Yalnız siparişinizi tamamlamak için gerekli olan hizmet sağlayıcılarla (kargo, ödeme, fatura) ve yasal zorunluluk hâlinde yetkili kurumlarla paylaşırız.</p>
<h2>İletişim</h2>
<p>Gizlilikle ilgili her sorunuz için: {{eposta}}</p>`,
  },

  "cerez-politikasi": {
    title: "Çerez Politikası",
    intro: "Çerezler ve benzeri tarayıcı kayıtları, sitenin çalışmasını sağlayan ve ziyaretinizi hatırlayan küçük dosyalardır. Hangilerini neden kullandığımızı aşağıda açıklıyoruz.",
    draftDefault: true,
    body: `<h2>Kullandığımız çerezler</h2>
<table><thead><tr><th>Tür</th><th>Ne işe yarar?</th><th>Onay</th></tr></thead><tbody>
<tr><td><b>Zorunlu</b></td><td>Sepetiniz, oturum açma, çerez tercihiniz, güvenlik. Bunlar olmadan site çalışmaz.</td><td>Gerekmez</td></tr>
<tr><td><b>İşlevsel</b></td><td>Bir satış ortağımızın bağlantısıyla geldiyseniz, alışverişin ona yazılması için 30 gün saklanan kayıt; reklam bağlantısıyla geldiyseniz siparişin hangi kampanyadan geldiğinin kaydı.</td><td>Gerekmez</td></tr>
<tr><td><b>İstatistik</b></td><td>Hangi sayfaların ziyaret edildiğini anlamak: kendi ziyaret istatistiğimiz ve Google Analytics.</td><td>{{istatistik_onay}}</td></tr>
<tr><td><b>Pazarlama</b></td><td>Instagram ve Facebook reklamlarımızın sonucunu ölçmek (Meta Pixel).</td><td>Yalnız onayınızla</td></tr>
</tbody></table>
<p>Google ve Meta çerezleriyle toplanan bilgiler bu şirketlerin yurt dışındaki sunucularında işlenir. Ayrıntılar için <a href="/kvkk">KVKK Aydınlatma Metni</a>.</p>
<h2>Tercihinizi nasıl değiştirirsiniz?</h2>
<p>İlk ziyaretinizde çıkan pencereden <b>Tümünü Kabul Et</b>, <b>Reddet</b> ya da <b>Tercihler</b> ile kategori bazında seçim yapabilirsiniz; reddetmek alışverişinizi etkilemez. Kararınızı istediğiniz an değiştirmek için: {{cerez_tercihleri}}. Tarayıcınızın ayarlarından da çerezleri silebilir veya engelleyebilirsiniz.</p>
<h2>İletişim</h2>
<p>Sorularınız için: {{eposta}}</p>`,
  },

  "mesafeli-satis": {
    title: "Mesafeli Satış Sözleşmesi",
    intro: "Bu sözleşme, sitemizden verdiğiniz siparişe ilişkin hak ve yükümlülükleri 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca düzenler. Siparişinizi onaylamadan önce aşağıdaki Ön Bilgilendirme Formu ile birlikte okumanızı rica ederiz.",
    draftDefault: true,
    body: `<h2>1. Taraflar</h2>
<p><b>Satıcı:</b></p>
{{satici_bilgileri}}
<p><b>Alıcı:</b> Siparişi veren kişi; ad, adres ve iletişim bilgileri sipariş formunda belirttiği gibidir.</p>
<h2>2. Konu, ürün ve fiyat</h2>
<p>Sözleşmenin konusu, Alıcı'nın sitede siparişini verdiği ürünlerin satışı ve teslimidir. Ürünlerin temel nitelikleri ürün sayfasında; adet, satış fiyatı (KDV dahil), kargo ücreti, ödeme yöntemi ve teslimat adresi sipariş özetinde ve sipariş onay e-postasında yer alır. Fiyatlar sipariş anında geçerli olanlardır.</p>
<h2>3. Ödeme</h2>
<p>Ödeme kredi/banka kartı (iyzico güvencesiyle, 3D Secure) veya havale/EFT ile yapılır. Havale/EFT siparişleri, ödeme 24 saat içinde hesabımıza geçmezse iptal edilir.</p>
<h2>4. Teslimat</h2>
<p>Ürünler ödemenin onaylanmasından sonra genellikle 1–3 iş günü içinde kargoya verilir; teslim süresi her hâlükârda yasal üst sınır olan 30 günü aşmaz. Teslimat, Alıcı'nın belirttiği adrese ve kişiye yapılır. Paket hasarlı gelirse lütfen kargo görevlisine tutanak tutturarak teslim almayın ve bize bildirin. Ürünü teslim süresi içinde gönderemezsek sizi bilgilendirir, isterseniz ödediğiniz tutarı 14 gün içinde iade ederiz.</p>
<h2>5. Cayma hakkı</h2>
<ul>
<li>Ürünü teslim aldığınız günden itibaren <b>14 gün</b> içinde, hiçbir gerekçe göstermeden ve cezai şart ödemeden sözleşmeden cayabilirsiniz. Teslimattan önce de cayabilirsiniz.</li>
<li>Cayma bildirimini Hesabım › Siparişlerim üzerinden, sipariş e-postalarındaki bağlantıdan ya da {{eposta}} adresine yazarak yapabilirsiniz.</li>
<li>Ürünü, bildiriminizden itibaren 14 gün içinde size ileteceğimiz iade kargo koduyla, bizim belirlediğimiz kargo firmasıyla geri gönderirsiniz. Bu durumda <b>iade kargo ücreti bize aittir.</b></li>
<li>Ödediğiniz tutar (varsa size gönderimdeki kargo ücreti dahil), cayma bildiriminizin bize ulaştığı tarihten itibaren <b>en geç 14 gün içinde</b> ödeme yaptığınız yöntemle iade edilir.</li>
<li>Ürün; kutusu, etiketi ve varsa birlikte gönderilen hediyeyle geri gönderilmelidir. Ürünü evde denemeniz hakkınızdır; ancak olağan denemenin ötesinde kullanım (ör. dışarıda giyilme) nedeniyle oluşan değer kaybından Alıcı sorumludur.</li>
<li>Kişiye özel üretilen veya kişiselleştirilen ürünlerde cayma hakkı yoktur.</li>
</ul>
<p>Değişim ve iade adımları için: <a href="/iade-degisim">İade, Değişim ve Teslimat</a>.</p>
<h2>6. Ayıplı ürün</h2>
<p>Ürün ayıplı çıkarsa 6502 sayılı Kanun'un 11. maddesindeki haklarınızı (sözleşmeden dönme, bedel indirimi, ücretsiz onarım veya ayıpsız misliyle değişim) kullanabilirsiniz. Ayıplı ürünün gönderim masrafları bize aittir.</p>
<h2>7. Uyuşmazlık</h2>
<p>Şikâyet ve itirazlarınızı öncelikle {{eposta}} adresine iletebilirsiniz. Uyuşmazlıklarda, Ticaret Bakanlığı'nca her yıl ilan edilen parasal sınırlar içinde yerleşim yerinizdeki veya işlemi yaptığınız yerdeki <b>Tüketici Hakem Heyeti</b>'ne, sınırın üzerinde <b>Tüketici Mahkemesi</b>'ne başvurabilirsiniz.</p>
<h2>8. Yürürlük</h2>
<p>Alıcı, sipariş öncesinde Ön Bilgilendirme Formu'nu ve bu sözleşmeyi okuduğunu, siparişi onaylamakla ödeme yükümlülüğü altına girdiğini kabul eder. Sözleşme sipariş onayıyla kurulur; bir örneği sipariş onay e-postasıyla Alıcı'ya iletilir ve Satıcı tarafından 3 yıl saklanır.</p>
<h2 id="on-bilgilendirme">Ön Bilgilendirme Formu</h2>
<p>Siparişinizi onaylamadan önce bilmeniz gerekenler:</p>
<h3>Satıcı</h3>
{{satici_bilgileri}}
<h3>Ürün ve fiyat</h3>
<p>Ürünün temel nitelikleri ürün sayfasında; adet, toplam fiyat (vergiler dahil), kargo ücreti ve ödeme yöntemi ödeme sayfasındaki sipariş özetinde yer alır.</p>
<h3>Teslimat</h3>
<p>Ödeme onayından sonra genellikle 1–3 iş günü içinde kargoya verilir; en geç 30 gün içinde teslim edilir.</p>
<h3>Cayma hakkı</h3>
<p>Teslimden itibaren 14 gün içinde gerekçesiz cayabilirsiniz. Bildirim: Hesabım › Siparişlerim, sipariş e-postasındaki bağlantı veya {{eposta}}. İade kargosu, bildirdiğimiz firmayla ücretsizdir; ödemeniz 14 gün içinde iade edilir.</p>
<h3>Şikâyet</h3>
<p>{{eposta}} · Tüketici Hakem Heyeti / Tüketici Mahkemesi.</p>`,
  },

  "iade-degisim": {
    title: "İade, Değişim ve Teslimat",
    intro: "Barefoot ayakkabıda doğru numara önemli; acele etmeden evde denemenizi istiyoruz. Olmazsa değişim ve iade ücretsiz.",
    draftDefault: true,
    body: `<h2>Teslimat</h2>
<ul>
<li>Siparişiniz ödeme onayından sonra genellikle <b>1–3 iş günü</b> içinde kargoya verilir; kargo takip numarası e-postanıza ve Hesabım › Siparişlerim'e gelir.</li>
<li>Kargo ücreti ve ücretsiz kargo sınırı ödeme sayfasında gösterilir.</li>
<li>Paket hasarlıysa kargo görevlisine tutanak tutturun, teslim almayın ve bize yazın; ürününüzü yeniden göndeririz.</li>
</ul>
<h2>{{deneme_gunu}} gün evde deneyin</h2>
<p>Ürün elinize ulaştığında size bir e-posta gönderiyoruz. Ayakkabıyı evde, temiz bir zeminde, günün farklı saatlerinde deneyin. Karar verince e-postadaki ya da Hesabım › Siparişlerim'deki <b>Oldu / Değişim / İade</b> düğmesine basın. Bunun için teslimattan itibaren <b>{{deneme_gunu}} gününüz</b> var. Bu süre geçtiyse de bize {{eposta}} adresinden yazın; birlikte çözelim.</p>
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
<li><b>Havale/EFT'de</b> iade talebinde bildirdiğiniz IBAN'a gönderilir.</li>
<li>Siparişte <b>YeriHisset Kredisi</b> kullandıysanız o kısım kredinize geri yüklenir.</li>
<li>İndirimli bir kampanyadan aldığınız ürünlerin bir kısmını iade ederseniz ve kalan sepet kampanya koşulunu karşılamıyorsa, indirim tutarı iadeden düşülebilir.</li>
</ul>
<h2>Kusurlu ürün</h2>
<p>Üründe üretim hatası görürseniz fotoğrafıyla {{eposta}} adresine yazın; tüm masrafları biz karşılarız.</p>
<p>Yasal haklarınız ve ayrıntılar: <a href="/mesafeli-satis">Mesafeli Satış Sözleşmesi</a>. Sorularınız için: {{eposta}}</p>`,
  },

  hakkimizda: {
    title: "Hakkımızda",
    intro: "{{marka}}, ayaklarımızın yeri hissetmesi gerektiğine inanan bir barefoot (yalınayak) ayakkabı mağazası ve topluluğudur.",
    draftDefault: true,
    body: `<p>{{marka}}, 2020 yılında İstanbul'da kuruldu. O günden bu yana tek bir fikrin peşindeyiz: <b>Yeri Hisset.</b> Ayaklarımız; geniş burunlu, sıfır topuk farklı, esnek ve ince tabanlı ayakkabılarla doğal hareketine kavuştuğunda bunu bütün bedenimizde hissederiz.</p>
<h2>Ne satıyoruz?</h2>
<ul>
<li><b>Yetişkinler için Dodura</b> — Türkiye'de üretilen, deri barefoot ayakkabı ve botlar.</li>
<li><b>İlk adımlar için Attipas</b> — bebeklerin ve küçük çocukların yürümeyi öğrenirken ayaklarını özgür bırakan ilk adım ayakkabıları.</li>
</ul>
<h2>Neden barefoot?</h2>
<p>Barefoot ayakkabı; parmakların sıkışmadığı geniş bir burun, topuk ile ön ayak arasında yükseklik farkı olmayan düz bir taban ve zemini hissettiren esnek ince bir taban demektir. Ayrıntılı bilgi için <a href="/barefoot-nedir">Barefoot nedir?</a> ve <a href="/bilgi-bankasi">Bilgi Bankası</a>.</p>
<h2>Topluluğumuz</h2>
<p>Kendimizi Türkiye'nin ilk barefoot (yalınayak) topluluğu olarak görüyoruz. Doğaya, müşterilerimize ve birlikte çalıştığımız herkese saygıyı temel değerimiz sayıyoruz.</p>
<h2>Güvenle alışveriş</h2>
<ul>
<li>{{deneme_gunu}} gün evde deneme, ücretsiz değişim ve iade — <a href="/iade-degisim">ayrıntılar</a>.</li>
<li>Kartlı ödemeler iyzico güvencesiyle, 3D Secure.</li>
<li>Satışlarımız yalnız internet üzerindendir; showroom / mağazamız yoktur.</li>
</ul>
<h2>Şirket bilgileri</h2>
{{satici_bilgileri}}`,
  },
};
