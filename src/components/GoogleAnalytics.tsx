import Script from "next/script";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

/** Settings tablosundan GA4 Measurement ID'sini oku (60 sn önbellekli) */
const getGaMeasurementId = unstable_cache(
  async (): Promise<string | null> => {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase
        .from("settings")
        .select("ga_measurement_id")
        .limit(1)
        .single();
      return data?.ga_measurement_id || null;
    } catch {
      return null;
    }
  },
  ["ga_measurement_id"],
  { revalidate: 60 }
);

/**
 * Server component — <head>'e gtag.js script'lerini enjekte eder.
 * GA4 Measurement ID admin Settings'ten girilmezse hiçbir şey render etmez.
 */
export default async function GoogleAnalytics() {
  const measurementId = await getGaMeasurementId();
  if (!measurementId) return null;

  // KVKK (docs/HUKUKI-METINLER-NOTLAR.md C2): Google'ın betiği istatistik İZNİ olmadan HİÇ indirilmez (onaysız istek
  // gitmesin). gtag burada yalnız bir kuyruk; window.__yhGA() izin anında betiği yükler — sayfa açılışında izin varsa
  // hemen, sonradan verilirse MarketingTags çağırır. Onaydan önce kuyruğa düşen olaylar gönderilmeden atılır.
  // Kategoriler: "accepted" = hepsi, "s1m0" = istatistik var / pazarlama yok (src/lib/consent.ts)
  const id = JSON.stringify(measurementId);
  return (
    <Script id="ga4-init" strategy="afterInteractive">
      {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        window.__yhGA = function () {
          if (window.__yhGAon) return;
          window.__yhGAon = true;
          var c = ''; try { c = localStorage.getItem('yh:cookie-consent') || ''; } catch (e) {}
          var m = (c === 'accepted' || /m1$/.test(c)) ? 'granted' : 'denied';
          window.dataLayer.length = 0;
          gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: m, ad_user_data: m, ad_personalization: m });
          gtag('js', new Date());
          gtag('config', ${id}, { send_page_view: true, cookie_flags: 'SameSite=None;Secure' });
          var s = document.createElement('script');
          s.async = true;
          s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(${id});
          document.head.appendChild(s);
        };
        var yhc = ''; try { yhc = localStorage.getItem('yh:cookie-consent') || ''; } catch (e) {}
        if (yhc === 'accepted' || /^s1/.test(yhc)) window.__yhGA();
      `}
    </Script>
  );
}
