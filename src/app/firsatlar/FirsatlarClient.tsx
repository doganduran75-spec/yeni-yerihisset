"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Building2, Tag, CalendarDays, Users, ExternalLink, Lock, Loader2 } from "lucide-react";

type Opportunity = {
  id: string;
  partner_name: string;
  title: string;
  description: string | null;
  image_url: string | null;
  url: string;
  discount_code: string | null;
  valid_until: string | null;
  allowed_role_slugs: string[] | null;
};

type Role = {
  id: string;
  name: string;
  slug: string;
};

interface Props {
  opps: Opportunity[];
  allRoles: Role[];
}

type AccessState = "loading" | "open" | "allowed" | "denied" | "login_required";

export default function FirsatlarClient({ opps, allRoles }: Props) {
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessChecking, setAccessChecking] = useState<string | null>(null);
  const [accessResult, setAccessResult] = useState<Record<string, AccessState>>({});

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data } = await (supabase as any)
          .from("user_roles")
          .select("roles(slug)")
          .eq("user_id", user.id);
        const slugs = (data || []).map((r: any) => r.roles?.slug).filter(Boolean);
        setUserRoles(slugs);
      }
      setAuthLoading(false);
    }
    loadUser();
  }, []);

  function getRoleName(slug: string) {
    return allRoles.find((r) => r.slug === slug)?.name || slug;
  }

  // Türkçe çoğul eki: Üye→Üyeler, Müşteri→Müşteriler, Admin→Adminler
  function pluralize(name: string): string {
    const frontVowels = ["e", "i", "ö", "ü"];
    const allVowels = ["a", "e", "ı", "i", "o", "ö", "u", "ü"];
    const lastVowel = [...name.toLowerCase()].filter((c) => allVowels.includes(c)).pop() ?? "e";
    return name + (frontVowels.includes(lastVowel) ? "ler" : "lar");
  }

  function deniedMessage(slugs: string[]): string {
    const names = slugs.map((s) => pluralize(getRoleName(s)));
    const joined = names.length === 1
      ? names[0]
      : names.slice(0, -1).join(", ") + " veya " + names[names.length - 1];
    return `Bu fırsat ${joined} için geçerlidir.`;
  }

  function isExpired(validUntil: string | null) {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  }

  function canAccess(opp: Opportunity): boolean {
    if (!opp.allowed_role_slugs || opp.allowed_role_slugs.length === 0) return true;
    return opp.allowed_role_slugs.some((slug) => userRoles.includes(slug));
  }

  async function handleViewOpportunity(opp: Opportunity) {
    if (authLoading) return;

    setAccessChecking(opp.id);

    // Kısa bir bekleme — uygunluk kontrolü hissi verir
    await new Promise((r) => setTimeout(r, 500));

    const restricted = opp.allowed_role_slugs && opp.allowed_role_slugs.length > 0;

    if (restricted && !userId) {
      setAccessResult((prev) => ({ ...prev, [opp.id]: "login_required" }));
      setAccessChecking(null);
      return;
    }

    if (restricted && !canAccess(opp)) {
      setAccessResult((prev) => ({ ...prev, [opp.id]: "denied" }));
      setAccessChecking(null);
      return;
    }

    setAccessResult((prev) => ({ ...prev, [opp.id]: "allowed" }));
    setAccessChecking(null);
    window.open(`/api/opportunity/${opp.id}`, "_blank");
  }

  if (opps.length === 0) {
    return (
      <div className="py-24 text-center text-slate-400">
        <Building2 size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Şu an aktif fırsat bulunmuyor.</p>
        <p className="text-sm mt-1">Yakında yeni fırsatlar eklenecek!</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {opps.map((opp) => {
        const expired = isExpired(opp.valid_until);
        const restricted = opp.allowed_role_slugs && opp.allowed_role_slugs.length > 0;
        const userCanAccess = !authLoading && canAccess(opp);
        const checking = accessChecking === opp.id;
        const result = accessResult[opp.id];

        return (
          <div
            key={opp.id}
            className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col transition-all ${expired ? "opacity-60" : "hover:shadow-md"}`}
          >
            {/* Görsel */}
            {opp.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={opp.image_url}
                alt={opp.partner_name}
                className="w-full h-36 object-cover"
              />
            ) : (
              <div className="w-full h-36 bg-gradient-to-br from-olive-50 to-slate-100 flex items-center justify-center">
                <Building2 size={36} className="text-olive-300" />
              </div>
            )}

            <div className="p-5 flex flex-col flex-1">
              {/* Partner adı */}
              <span className="text-[10px] font-black uppercase tracking-widest text-olive-600 bg-olive-50 px-2 py-0.5 rounded self-start mb-2">
                {opp.partner_name}
              </span>

              <h2 className="font-bold text-slate-900 text-base leading-snug mb-1">{opp.title}</h2>
              {opp.description && (
                <p className="text-sm text-slate-500 line-clamp-2 mb-3">{opp.description}</p>
              )}

              {/* Meta bilgiler */}
              <div className="flex flex-wrap gap-2 mb-4 mt-auto">
                {opp.discount_code && (
                  <span className="flex items-center gap-1 text-xs font-mono bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                    <Tag size={10} /> {opp.discount_code}
                  </span>
                )}
                {opp.valid_until && (
                  <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${expired ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                    <CalendarDays size={10} />
                    {expired ? "Süresi doldu — " : "Son: "}
                    {new Date(opp.valid_until).toLocaleDateString("tr-TR")}
                  </span>
                )}
              </div>

              {/* Rol rozetleri */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {restricted ? (
                  opp.allowed_role_slugs!.map((slug) => (
                    <span key={slug} className="flex items-center gap-1 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                      <Users size={9} /> {getRoleName(slug)}
                    </span>
                  ))
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 border border-slate-100 px-2 py-0.5 rounded-full">
                    <Users size={9} /> Herkese açık
                  </span>
                )}
              </div>

              {/* Uygunluk mesajı */}
              {result === "login_required" && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 space-y-2">
                  <p>Bu fırsata erişmek için giriş yapmanız gerekiyor.</p>
                  <div className="flex gap-2">
                    <a href="/account?tab=register" className="flex-1 text-center font-bold bg-olive-600 text-white rounded-lg px-3 py-1.5 hover:bg-olive-700 transition-colors">
                      Üye Ol
                    </a>
                    <a href="/account" className="flex-1 text-center font-bold bg-white border border-amber-300 text-amber-700 rounded-lg px-3 py-1.5 hover:bg-amber-50 transition-colors">
                      Giriş Yap
                    </a>
                  </div>
                </div>
              )}
              {result === "denied" && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 space-y-2">
                  <p className="flex items-center gap-1.5">
                    <Lock size={12} />
                    {deniedMessage(opp.allowed_role_slugs!)}
                  </p>
                  <div className="flex gap-2">
                    <a href="/account?tab=register" className="flex-1 text-center font-bold bg-olive-600 text-white rounded-lg px-3 py-1.5 hover:bg-olive-700 transition-colors">
                      Üye Ol
                    </a>
                    <a href="/account" className="flex-1 text-center font-bold bg-white border border-red-200 text-red-700 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
                      Giriş Yap
                    </a>
                  </div>
                </div>
              )}

              {/* Buton */}
              <button
                disabled={expired || checking || authLoading}
                onClick={() => handleViewOpportunity(opp)}
                className={`w-full mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  expired
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : userCanAccess || !restricted
                    ? "bg-olive-600 hover:bg-olive-700 text-white shadow-sm shadow-olive-100 active:scale-95"
                    : "bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700"
                }`}
              >
                {checking ? (
                  <><Loader2 size={15} className="animate-spin" /> Kontrol ediliyor…</>
                ) : expired ? (
                  "Süresi Doldu"
                ) : (
                  <><ExternalLink size={14} /> Fırsatı Gör</>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
