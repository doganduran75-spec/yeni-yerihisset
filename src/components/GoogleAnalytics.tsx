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

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            send_page_view: true,
            cookie_flags: 'SameSite=None;Secure'
          });
        `}
      </Script>
    </>
  );
}
