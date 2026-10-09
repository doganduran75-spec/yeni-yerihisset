import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import MarketingTags from "./MarketingTags";

/** Meta ayarları (herkese açık kolonlar; 60 sn önbellekli) */
const getMetaPublic = unstable_cache(
  async (): Promise<{ pixelId: string | null; domainVerification: string | null }> => {
    try {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data } = await supabase.from("settings").select("meta_pixel_id, meta_domain_verification").limit(1).maybeSingle();
      const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return { pixelId: clean(data?.meta_pixel_id), domainVerification: clean(data?.meta_domain_verification) };
    } catch {
      return { pixelId: null, domainVerification: null };
    }
  },
  ["meta_public_settings"],
  { revalidate: 60 }
);

/**
 * Server component — Meta alan adı doğrulama etiketi + onaya bağlı pazarlama etiketleri.
 * Ayarlar › Meta'da Pixel ID girilmezse Pixel yüklenmez (reklam kaynağı yine yakalanır).
 */
export default async function MarketingSetup() {
  const { pixelId, domainVerification } = await getMetaPublic();
  return (
    <>
      {domainVerification && <meta name="facebook-domain-verification" content={domainVerification} />}
      <MarketingTags pixelId={pixelId && /^\d{5,20}$/.test(pixelId) ? pixelId : null} />
    </>
  );
}
