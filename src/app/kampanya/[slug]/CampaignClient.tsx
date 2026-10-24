"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Sparkles, ShoppingBag } from "lucide-react";
import { CampaignClaimBox, writeClaim, readClaim } from "@/components/CampaignClaim";
import { useCartStore } from "@/store/useCartStore";
import { track, setCampaign } from "@/lib/track";

type Coupon = {
  code: string;
  name: string;
  description: string | null;
  type: "percentage" | "fixed" | "free_shipping";
  amount: number;
  min_order_amount: number;
  expires_at: string | null;
};

function discountText(c: Coupon): string {
  if (c.type === "percentage") return `%${c.amount} indirim`;
  if (c.type === "fixed") return `${c.amount.toLocaleString("tr-TR")} ₺ indirim`;
  return "Ücretsiz kargo";
}

export default function CampaignClient({ slug, coupon }: { slug: string; coupon: Coupon | null }) {
  const router = useRouter();
  const { addCouponCode } = useCartStore();

  useEffect(() => {
    // Oturuma kampanya kaynağını ata + landing event'i
    setCampaign("kampanya", slug);
    track("campaign_landing", { slug, code: coupon?.code, found: !!coupon });
    // Kodu sepete tanımla (sepette otomatik uygulanır)
    if (coupon?.code) addCouponCode(coupon.code); // sepetteki diğer kuponlar silinmez (birleşir)
    // Bu oturumda site içinde turuncu "kuponu hesabına ekle" şeridi (src/components/CampaignClaim.tsx)
    if (coupon && readClaim()?.slug !== slug) writeClaim({ slug, label: discountText(coupon) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-[70vh] bg-gradient-to-br from-olive-700 to-olive-900 text-white flex items-center">
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
        {coupon ? (
          <>
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] mb-6">
              <Sparkles size={14} /> Sana Özel
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight italic mb-3">{discountText(coupon)}</h1>
            <p className="text-white/80 mb-8 leading-relaxed">
              {coupon.description || coupon.name}
              {coupon.min_order_amount > 0 && (
                <span className="block text-sm text-white/60 mt-1">{coupon.min_order_amount.toLocaleString("tr-TR")} ₺ ve üzeri sepetlerde geçerli.</span>
              )}
            </p>

            {/* Kod yok (kullanıcı kararı): kupon hesaba eklenir, sepette hazır olur */}
            <div className="mx-auto max-w-md mb-8 rounded-3xl bg-white/10 backdrop-blur p-4 text-left">
              <CampaignClaimBox slug={slug} label={discountText(coupon)} tone="dark" />
            </div>

            <button
              onClick={() => { track("hero_click", { side: "kampanya", to: "/magaza" }); router.push("/magaza"); }}
              className="inline-flex items-center gap-2 h-14 px-8 rounded-2xl bg-white text-olive-800 font-black text-sm uppercase tracking-widest hover:gap-3 transition-all active:scale-95"
            >
              <ShoppingBag size={18} /> Modelleri Gör <ArrowRight size={18} />
            </button>
          </>
        ) : (
          <>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight italic mb-3">Kampanya bulunamadı</h1>
            <p className="text-white/80 mb-8">Bu kampanya süresi dolmuş ya da kaldırılmış olabilir. Yine de mağazamıza göz atabilirsin.</p>
            <Link
              href="/magaza"
              className="inline-flex items-center gap-2 h-14 px-8 rounded-2xl bg-white text-olive-800 font-black text-sm uppercase tracking-widest hover:gap-3 transition-all active:scale-95"
            >
              <ShoppingBag size={18} /> Mağazaya Git <ArrowRight size={18} />
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
