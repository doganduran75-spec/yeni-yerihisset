import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout from "@/components/LegalPageLayout";
import CookiePreferencesLink from "@/components/CookiePreferencesLink";
import { COMPANY } from "@/config/company";
import { createAdminClient } from "@/lib/supabase-admin";

// Metin, Ayarlar › Çerez onayı moduna göre değişir (deneme / KVKK) — 5 dakikada bir tazelenir
export const revalidate = 300;
async function strictMode(): Promise<boolean> {
  try {
    const { data } = await (createAdminClient() as any).from("settings").select("cookie_consent_strict").limit(1).maybeSingle();
    return data?.cookie_consent_strict === true;
  } catch { return true; }
}

export const metadata: Metadata = {
  alternates: { canonical: "/cerez-politikasi" },
  title: "Çerez Politikası",
  robots: { index: false, follow: true }, // taslak — onaylanınca kaldır
};

export default async function CerezPolitikasiPage() {
  const strict = await strictMode();
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
            <td>{strict
              ? "Yalnız onayınızla. Onay yoksa ziyaretiniz kimliğinizle ilişkilendirilmeden, IP adresi saklanmadan yalnız sayılır."
              : "Tercih yapana kadar kendi ziyaret istatistiğimiz çalışır. Reddederseniz o ziyaretin kaydı anonimleşir (IP adresi silinir), sonrası yalnız sayılır. Google Analytics çerezleri yalnız onayınızla."}</td>
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
        İlk ziyaretinizde çıkan pencereden <b>Tümünü Kabul Et</b>, <b>Reddet</b> ya da <b>Tercihler</b> ile kategori
        bazında seçim yapabilirsiniz; reddetmek alışverişinizi etkilemez. Kararınızı istediğiniz an değiştirmek için: <CookiePreferencesLink />.
        Tarayıcınızın ayarlarından da çerezleri silebilir veya engelleyebilirsiniz.
      </p>

      <h2>İletişim</h2>
      <p>Sorularınız için: {COMPANY.email}</p>
    </LegalPageLayout>
  );
}
