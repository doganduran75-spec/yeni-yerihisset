"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// "KUPONU HESABINA EKLE" (Instagram / story bağlantısı; kullanıcı kararları 2026-10-24).
// /kampanya/<slug> açılınca kampanya bu OTURUMA yazılır (sessionStorage) → site içinde gezerken turuncu şerit
// görünür; tarayıcı kapanıp sonra gelinirse yoktur. Üye tek tıkla ekler; misafir e-postasını yazar (şifresiz hesap +
// şifre belirleme bağlantısı). Sunucu: /api/coupons/campaign-claim
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Gift, X, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBotTrap } from "@/components/BotTrap";
import { track } from "@/lib/track";

const KEY = "yh_claim";
type Claim = { slug: string; label: string; done?: boolean; hidden?: boolean };

export function readClaim(): Claim | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function writeClaim(c: Claim | null) {
  try { if (c) sessionStorage.setItem(KEY, JSON.stringify(c)); else sessionStorage.removeItem(KEY); } catch { /* gizli pencere */ }
  try { window.dispatchEvent(new Event("yh-claim")); } catch { /* yut */ }
}

/** Ekleme kutusu (kampanya sayfasında ve şeritte açılınca) */
export function CampaignClaimBox({ slug, label, tone = "light" }: { slug: string; label: string; tone?: "light" | "dark" }) {
  const [logged, setLogged] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { trap, fields } = useBotTrap();
  useEffect(() => { supabase.auth.getSession().then(({ data: { session } }) => setLogged(!!session)); }, []);

  async function claim(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/coupons/campaign-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ slug, ...(session ? {} : { email, ...fields() }) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Eklenemedi");
      track("campaign_claim", { slug, status: d.status });
      setMsg({ ok: true, text: d.status === "email"
        ? "E-postana gönderdik: şifreni belirle, kupon sepetinde hazır olsun."
        : d.status === "already" ? "Bu kupon zaten hesabında — sepetinde hazır." : "Hesabına eklendi — sepetinde hazır." });
      const cur = readClaim();
      writeClaim({ ...(cur || { slug, label }), done: true });
    } catch (err: any) {
      setMsg({ ok: false, text: err.message });
    } finally { setBusy(false); }
  }

  const dark = tone === "dark";
  if (msg?.ok) return <p className={`flex items-center gap-2 text-sm font-bold ${dark ? "text-white" : "text-green-800"}`}><Check size={16} /> {msg.text}</p>;
  if (logged === null) return null;
  return (
    <form onSubmit={claim} className="space-y-2">
      {trap}
      {logged ? (
        <button type="submit" disabled={busy} className="w-full h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />} Kuponu hesabıma ekle
        </button>
      ) : (
        <div className="flex gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta adresin"
            className="min-w-0 flex-1 h-12 rounded-2xl px-4 text-sm text-slate-900 bg-white border border-orange-200 outline-none focus:border-orange-400" />
          <button type="submit" disabled={busy} className="shrink-0 h-12 px-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm flex items-center gap-1.5 disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />} Ekle
          </button>
        </div>
      )}
      {!logged && <p className={`text-[11px] ${dark ? "text-white/70" : "text-slate-500"}`}>Hesabın yoksa açılır; şifreni e-postadaki bağlantıyla belirlersin. {label} sepetinde hazır olur — kod yazmazsın.</p>}
      {msg && !msg.ok && <p className="text-xs font-bold text-red-600">{msg.text}</p>}
    </form>
  );
}

/** Site geneli turuncu şerit (yalnız bağlantıdan gelinen oturumda; kampanya sayfasında ve ödemede gizli) */
export default function CampaignClaimBar() {
  const pathname = usePathname() || "";
  const [c, setC] = useState<Claim | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const read = () => setC(readClaim());
    read();
    window.addEventListener("yh-claim", read);
    return () => window.removeEventListener("yh-claim", read);
  }, []);
  if (!c || c.done || c.hidden || pathname.startsWith("/kampanya") || pathname.startsWith("/checkout") || pathname.startsWith("/admin") || pathname.startsWith("/sifre-belirle")) return null;
  return (
    <div className="fixed inset-x-0 bottom-16 md:bottom-4 z-40 px-3 md:px-0 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-orange-500 text-white shadow-xl shadow-orange-900/20">
        <div className="flex items-center gap-2 px-4 py-3">
          <Gift size={18} className="shrink-0" />
          <button type="button" onClick={() => setOpen(!open)} className="flex-1 text-left text-sm font-black leading-tight">
            {c.label} seni bekliyor · <span className="underline">Kuponu hesabına ekle</span>
          </button>
          <button type="button" aria-label="Kapat" onClick={() => writeClaim({ ...c, hidden: true })} className="shrink-0 p-1 text-white/80 hover:text-white"><X size={16} /></button>
        </div>
        {open && <div className="px-4 pb-4"><CampaignClaimBox slug={c.slug} label={c.label} tone="dark" /></div>}
      </div>
    </div>
  );
}
