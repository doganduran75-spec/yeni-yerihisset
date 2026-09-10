"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Building2, CalendarDays, ExternalLink, Lock, Loader2, Gift, Check, Ticket, ArrowRight } from "lucide-react";

type Opportunity = {
  id: string;
  partner_name: string;
  title: string;
  description: string | null;
  image_url: string | null;
  url: string | null;
  discount_code: string | null;
  valid_until: string | null;
  tier_level?: number | null;
  kind?: "external" | "coupon";
  coupon_id?: string | null;
  claim_limit?: number | null;
  coupon?: { id: string; code: string; name: string; type: string; amount: number } | null;
};

type Role = { id: string; name: string; slug: string; level: number };

interface Props {
  opps: Opportunity[];
  allRoles: Role[];
}

// Seviyeye göre yeşil rampa (Ziyaretçi açık → üst seviye koyu)
const TIER_BG = ["bg-emerald-50/70", "bg-emerald-100/70", "bg-emerald-200/60", "bg-emerald-300/50", "bg-emerald-400/40"];
const TIER_ACCENT = ["text-emerald-700", "text-emerald-800", "text-emerald-900", "text-emerald-900", "text-emerald-900"];

export default function FirsatlarClient({ opps, allRoles }: Props) {
  const [userLevel, setUserLevel] = useState(0);       // giriş yok = 0
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [claimGranted, setClaimGranted] = useState<Record<string, number>>({});
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data } = await (supabase as any).from("user_roles").select("roles(level)").eq("user_id", user.id);
        const levels = (data || []).map((r: any) => Number(r.roles?.level ?? 0));
        setUserLevel(levels.length ? Math.max(...levels) : 1); // üye en az 1

        const couponIds = [...new Set(opps.filter((o) => o.kind === "coupon" && o.coupon_id).map((o) => o.coupon_id!))];
        if (couponIds.length) {
          const { data: ucs } = await (supabase as any)
            .from("user_coupons").select("coupon_id, max_uses").eq("user_id", user.id).in("coupon_id", couponIds);
          const map: Record<string, number> = {};
          (ucs || []).forEach((u: any) => { map[u.coupon_id] = u.max_uses ?? 0; });
          setClaimGranted(map);
        }
      }
      setAuthLoading(false);
    }
    loadUser();
  }, [opps]);

  async function handleClaim(opp: Opportunity) {
    if (!opp.coupon_id) return;
    if (!userId) { window.location.href = "/account?tab=register"; return; }
    setClaiming(opp.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/opportunity/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ opportunityId: opp.id }),
      });
      const d = await res.json();
      if (res.ok) setClaimGranted((p) => ({ ...p, [opp.coupon_id!]: d.granted ?? p[opp.coupon_id!] ?? 0 }));
      else if (d.needAuth) window.location.href = "/account?tab=register";
      else alert(d.error || "İşlem başarısız");
    } catch { alert("İşlem başarısız"); } finally { setClaiming(null); }
  }

  const isExpired = (v: string | null) => !!v && new Date(v) < new Date();
  const couponLabel = (c?: Opportunity["coupon"]) => {
    if (!c) return "Kupon";
    if (c.type === "percentage") return `%${c.amount} indirim`;
    if (c.type === "fixed") return `₺${Number(c.amount).toFixed(0)} indirim`;
    if (c.type === "free_shipping") return "Ücretsiz kargo";
    return c.name || "Kupon";
  };

  // Seviye satırları: Ziyaretçi(0) + level>0 olan roller (artan). Yukarıdan aşağı.
  // roles sorgusu (level) boş dönerse (ör. PostgREST şema cache tazelenmemiş)
  // yine de standart merdiven iskeleti gösterilsin diye varsayılan seviyeler.
  const DEFAULT_TIERS = [
    { level: 1, name: "Üye", slug: "uye" },
    { level: 2, name: "Müşteri", slug: "musteri" },
    { level: 3, name: "Müdavim", slug: "mudavim" },
  ];
  const roleTiers = allRoles.filter((r) => (r.level ?? 0) > 0).sort((a, b) => a.level - b.level);
  const usedRoleTiers = roleTiers.length ? roleTiers : DEFAULT_TIERS;
  const tiers: { level: number; name: string; slug: string }[] = [
    { level: 0, name: "Ziyaretçi", slug: "ziyaretci" },
    ...usedRoleTiers.map((r) => ({ level: r.level, name: r.name, slug: r.slug })),
  ];

  // Bir seviyeyi açmak için CTA
  function unlockCta(slug: string): { label: string; href: string } {
    if (slug === "uye") return { label: "Üye Ol", href: "/account?tab=register" };
    if (slug === "musteri") return { label: "İlk Siparişini Ver", href: "/products" };
    return { label: "Nasıl açılır?", href: "/account" };
  }

  if (opps.length === 0) {
    return (
      <div className="py-24 text-center text-slate-400">
        <Building2 size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Şu an aktif fırsat bulunmuyor.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* İlerleme başlığı */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="font-black text-slate-700">Seviyen:</span>
        <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-black">
          {tiers.find((t) => t.level === userLevel)?.name ?? "Ziyaretçi"}
        </span>
        <span className="text-xs">— seviyeni yükselttikçe alttaki tüm fırsatlar da senin olur.</span>
      </div>

      {tiers.map((tier, idx) => {
        const rowOpps = opps.filter((o) => (o.tier_level ?? 0) === tier.level);
        const unlocked = userLevel >= tier.level;
        const isCurrent = userLevel === tier.level;
        const cta = unlockCta(tier.slug);
        return (
          <div key={tier.level} className={`rounded-3xl border border-slate-100 ${TIER_BG[Math.min(idx, TIER_BG.length - 1)]} p-4 md:p-5`}>
            {/* Satır başlığı */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <h3 className={`text-base font-black uppercase italic tracking-tight ${TIER_ACCENT[Math.min(idx, TIER_ACCENT.length - 1)]}`}>{tier.name}</h3>
                {isCurrent ? (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white px-2 py-0.5 rounded-full">Şu an buradasın</span>
                ) : unlocked ? (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-white text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">Açık</span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-white text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full"><Lock size={9} /> Kilitli</span>
                )}
              </div>
              {!unlocked && (
                <a href={cta.href} className="flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-900 whitespace-nowrap">
                  {cta.label} <ArrowRight size={13} />
                </a>
              )}
            </div>

            {/* Yatay kaydırmalı kart şeridi (sabit yükseklik) */}
            {rowOpps.length === 0 ? (
              <p className="text-xs text-slate-400 italic px-1 py-6">Bu seviyeye özel fırsat yakında.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                {rowOpps.map((opp) => {
                  const expired = isExpired(opp.valid_until);
                  const isCoupon = opp.kind === "coupon";
                  const limit = opp.claim_limit ?? 1;
                  const granted = claimGranted[opp.coupon_id ?? ""] ?? 0;
                  const maxed = granted >= limit;
                  const claimingThis = claiming === opp.id;
                  return (
                    <div key={opp.id} className={`shrink-0 w-64 bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden ${(!unlocked || expired) ? "opacity-60" : ""}`}>
                      <div className="h-24 bg-gradient-to-br from-olive-50 to-slate-100 flex items-center justify-center overflow-hidden">
                        {opp.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={opp.image_url} alt={opp.title} className="w-full h-full object-cover" />
                        ) : <Gift size={26} className="text-olive-300" />}
                      </div>
                      <div className="p-3 flex flex-col flex-1">
                        <p className="text-[9px] font-black uppercase tracking-widest text-olive-600 mb-1">{opp.partner_name}</p>
                        <h4 className="text-sm font-black text-slate-900 leading-tight line-clamp-2">{opp.title}</h4>
                        {isCoupon && (
                          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold bg-olive-50 text-olive-700 border border-olive-200 px-1.5 py-0.5 rounded-full self-start">
                            <Gift size={10} /> {couponLabel(opp.coupon)}{limit > 1 ? ` · ${limit}x` : ""}
                          </span>
                        )}
                        {opp.valid_until && (
                          <span className="mt-1 text-[10px] text-slate-400 flex items-center gap-1"><CalendarDays size={9} /> Son: {new Date(opp.valid_until).toLocaleDateString("tr-TR")}</span>
                        )}

                        <div className="mt-auto pt-2.5">
                          {!unlocked ? (
                            <a href={cta.href} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition-all">
                              <Lock size={12} /> {cta.label}
                            </a>
                          ) : expired ? (
                            <div className="w-full text-center px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-400">Süresi Doldu</div>
                          ) : isCoupon ? (
                            <button
                              onClick={() => handleClaim(opp)}
                              disabled={claimingThis || maxed}
                              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all ${maxed ? "bg-slate-100 text-slate-500" : "bg-olive-600 hover:bg-olive-700 text-white active:scale-95"}`}
                            >
                              {claimingThis ? <><Loader2 size={13} className="animate-spin" /> …</>
                                : maxed ? <><Check size={13} /> Yararlandın</>
                                : granted > 0 ? <><Ticket size={12} /> Tekrar ({limit - granted})</>
                                : <><Gift size={12} /> Yararlan</>}
                            </button>
                          ) : (
                            <a href={`/api/opportunity/${opp.id}`} target="_blank" rel="noopener noreferrer"
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-olive-600 hover:bg-olive-700 text-white active:scale-95 transition-all">
                              <ExternalLink size={12} /> Fırsatı Gör
                            </a>
                          )}
                        </div>
                        {isCoupon && unlocked && granted > 0 && (
                          <a href="/account?tab=coupons" className="mt-1.5 text-[10px] text-olive-700 underline text-center">Kuponlarım&apos;da hazır{granted > 1 ? ` (${granted})` : ""}</a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {authLoading && <p className="text-xs text-slate-400 text-center">Seviye kontrol ediliyor…</p>}
    </div>
  );
}
