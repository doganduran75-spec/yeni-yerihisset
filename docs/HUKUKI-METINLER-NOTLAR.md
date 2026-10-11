# Hukuki metinler — kontrol notları (2026-10-11)

Taslaklar yazıldı: `/kvkk`, `/gizlilik`, `/cerez-politikasi`, `/mesafeli-satis` (+ `#on-bilgilendirme`), `/iade-degisim`, `/iletisim`.
**Düzenleme: Ayarlar › Sayfalar & Künye** — metinler ve şirket künyesi panelden; sayfayı onaylayınca "Taslak" işaretini kaldırman yeterli (arama motoruna ve site haritasına kendiliğinden girer).
Sayfalar hâlâ **taslak** (üstte uyarı + arama motoruna kapalı). Onaydan sonra: her sayfada `draft={false}` + `robots noindex` satırı kaldırılır (bana "onayladım" demen yeterli).

## A) Senin doldurman / doğrulaman gerekenler

| # | Konu | Not |
|---|------|-----|
| A1 | **Telefon numarası** | E-ticaret mevzuatı sitede iletişim bilgisini zorunlu tutuyor. Şu an "(eklenecek)" görünüyor. |
| A2 | **MERSİS numarası** | Şirketin MERSİS no'su (Ticaret Sicil Gazetesi / e-Devlet). Sitede görünmesi gerekiyor. |
| A3 | **KEP adresi** | Şirketin KEP adresi varsa (…@hs01.kep.tr). Ltd. şirketler için zorunlu; KVKK başvuruları için de yazılır. |
| A4 ✅ 5901108531 | **Vergi numarası çelişkisi** | Eski İletişim sayfası: Kozyatağı V.D. **590 110 85 31**. Eski mesafeli satış sayfası: "Kozyatağı – **3150037470**". Hangisi doğru? (Metinlerde ilki kullanıldı.) |
| A5 | **Adres** | Barbaros Mah. Begonya Sok. No:1/2 Nida Kule Batı, Ataşehir / İstanbul — güncel mi? İade gönderileri bu adrese mi, depoya mı gidiyor? |
| A6 ✅ 14 gün (yasal); geçerse "bize yazın" | **Deneme / iade süresi: 14 gün mü 30 gün mü?** | Eski site "30 gün, ücretsiz iade" diyordu. Yeni sistem 14 gün (yasal alt sınır). 30 istersen tek sayı değişir (`TRIAL_DAYS`); metinler otomatik güncellenir. Uzun süre güçlü bir satış argümanı. |
| A7 ✅ ücret yok | **Değişimde kargo** | Metin: "değişimde sizden ek kargo ücreti alınmaz" — doğru mu? |
| A8 | **Kampanyalı iade kuralı** | "Kalan sepet kampanya koşulunu karşılamıyorsa indirim iadeden düşülebilir" (eski sitende vardı) — kalsın mı? |
| A9 | **Muhasebe / e-fatura** | KVKK'da "muhasebe ve e-fatura hizmeti aldığımız kuruluşlar" yazıyor. Kullandığın program/mali müşavir varsa adı gerekmez; genel ifade yeterli. |
| A10 | **ETBİS** | Eski sitede ETBİS kaydı var. Yeni site aynı alan adında olduğundan kayıt geçerli; canlıya geçince ETBİS'teki bilgilerin (adres, faaliyet) güncel olduğunu kontrol et. |
| A11 | **Eski mesafeli satış metni yanlıştı** | Eski sitedeki metin bir **baskı firmasının** sözleşmesiydi ("alıcı tüketici sayılmaz, cayma hakkı yok", tasarım onayı vb.). Tüketiciye satışta geçersiz ve riskli. Yeni metin bunun yerine geçecek. |

## B) Avukata sorulacaklar (kısa liste)

1. **Yurt dışı aktarım:** Sunucumuz Fransa'da (Contabo GmbH). KVKK md. 9 (2024 değişikliği) gereği Contabo ile **Kurul'un standart sözleşmesi** imzalanıp imzalandıktan sonra **5 iş günü içinde Kurum'a bildirilmesi** gerekiyor. Metin buna göre yazıldı; sözleşme yapılmadıysa bu işin yapılması lazım. (Alternatif: sunucuyu Türkiye'ye taşımak.)
2. **Google Analytics / Meta Pixel:** Yalnız çerez onayıyla çalışıyor (yurt dışı aktarım açık rızaya dayanıyor). Uygun mu?
3. **VERBİS:** Yıllık çalışan < 50 ve mali bilanço < 100 milyon TL ise kayıt yükümlülüğü yok — durumumuz?
4. **İYS:** Kampanya e-postası göndermeden önce İleti Yönetim Sistemi kaydı (marka + izinlerin İYS'ye yüklenmesi).
5. Metinlerin genel kontrolü (özellikle mesafeli satış).

## C) Benim yapacağım kod işleri (metinlerin doğru olması için — canlı öncesi)

| # | İş | Neden |
|---|----|------|
| C1 | **Kampanya e-postalarına "abonelikten çık" bağlantısı** + yalnız izin verenlere gönderim | Gizlilik metni "e-postadaki bağlantıdan tek tıkla geri alabilirsiniz" diyor; şu an bağlantı yok. Yasal zorunluluk (6563). |
| C2 | **Google Analytics'i onaydan önce hiç yüklememek** | Şu an onay yokken GA çerezsiz ama yine de Google'a istek gönderiyor (yurt dışı aktarım). Onaysız hiç yüklenmemesi daha güvenli. |
| C3 ✅ (2026-10-11) | **Kendi ziyaret istatistiğimiz** — Ayarlar › Çerez Onayı: şimdilik KAPALI (deneme modu: seçim yapılana kadar tam kayıt, Reddet → anonimleşir); canlıda bir süre deneyip AÇIK (KVKK modu) yapılacak. Kategorili pencere + onay defteri kuruldu. | Şu an ziyaretçi seçim yapmadan çalışıyor (IP dahil), yalnız "Reddet" deyince duruyor. Öneri: seçim yapılmadan ve reddedilince **IP'siz, kimliksiz sayım**; "Kabul"de bugünkü gibi. Metin "Reddederseniz kullanılmaz" diyor → C3 yapılınca tam doğru olur. **Senin onayın gerekiyor** (veri kaybı: kabul etmeyenlerin yolculuğu görünmez). |
| C4 | **Sipariş onay e-postasına sözleşme** | Yönetmelik: sözleşme ve ön bilgilendirme "kalıcı veri saklayıcısı" ile (e-posta) tüketiciye iletilmeli. Sipariş e-postasına sözleşme bağlantısı + sipariş özeti eklenecek. |
| C5 | **E-posta kayıtlarının saklama süresi** | Bildirim / e-posta kuyruğu kayıtları süresiz tutuluyor; 1 yıl sonra silinsin (KVKK "ne kadar saklıyoruz" bölümüyle uyum). |
| C6 | **Eski TCKN alanı** | Profildeki eski TC kimlik no'ları gereksiz; silinmeli (iyzico'ya artık sabit değer gidiyor). |

## D) Yapılanlar (bu turda)

- Altı sayfanın metni yazıldı; şirket künyesi tek dosyada.
- Ödeme sayfası onay cümlesi: Ön Bilgilendirme Formu'na ayrı bağlantı + "ödeme yükümlülüğü" ifadesi + Aydınlatma Metni bağlantısı.
- Alt bilgiye **"Çerez Tercihleri"** bağlantısı: onay penceresini yeniden açar (rıza, verildiği kadar kolay geri alınabilmeli). Onay geri alınınca sayfa yenilenir, reklam etiketleri kalkar.
- İletişim sayfası gerçek unvan / adres / vergi bilgileriyle; "showroom yok" notu eski siteden.
