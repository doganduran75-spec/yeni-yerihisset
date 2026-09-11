"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Activity, Globe, Layers, Footprints, Search, ShoppingCart, Ticket, CreditCard,
  MousePointerClick, ChevronDown, ChevronRight, Loader2,
} from "lucide-react";

// Üye 360° — bir üyenin ziyaret oturumları + adım adım yolculuğu (analytics'ten).
const EVENT_LABEL: Record<string, { txt: string; icon: any }> = {
  page_view: { txt: "sayfa", icon: Globe },
  hero_click: { txt: "karşılama kartı", icon: MousePointerClick },
  category_click: { txt: "kategori", icon: Layers },
  size_filter: { txt: "numara filtresi", icon: Footprints },
  view_item: { txt: "ürün gördü", icon: Search },
  add_to_cart: { txt: "sepete ekledi", icon: ShoppingCart },
  quick_buy: { txt: "hemen sipariş", icon: ShoppingCart },
  remove_from_cart: { txt: "sepetten çıkardı", icon: ShoppingCart },
  search: { txt: "arama", icon: Search },
  coupon_apply: { txt: "kupon denedi", icon: Ticket },
  begin_checkout: { txt: "ödemeye geçti", icon: CreditCard },
  purchase: { txt: "SATIN ALDI", icon: CreditCard },
  campaign_landing: { txt: "kampanya linki", icon: MousePointerClick },
  opportunity_click: { txt: "fırsat tıkladı", icon: MousePointerClick },
};

function fmtTRY(n: number) { return "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 }); }

function eventDetail(e: any): string {
  const m = e.meta || {};
  switch (e.event_type) {
    case "page_view": return e.path || "";
    case "category_click": return m.category || "";
    case "size_filter": return `${m.size} numara`;
    case "search": return `"${m.term}"${m.results_count != null ? ` (${m.results_count} sonuç)` : ""}`;
    case "view_item": return m.name || m.product_id || "";
    case "add_to_cart": case "quick_buy": return `${m.name || m.product_id || ""}${m.size ? ` · ${m.size}` : ""}`;
    case "coupon_apply": return `${m.code} → ${m.success ? "geçerli" : "RED"}`;
    case "purchase": return `${fmtTRY(m.value)}`;
    case "campaign_landing": return m.slug || "";
    default: return "";
  }
}

export default function MemberJourney({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [eventsBySession, setEventsBySession] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data: sess } = await (supabase as any)
          .from("analytics_sessions").select("*").eq("user_id", userId)
          .order("started_at", { ascending: false }).limit(20);
        if (!active) return;
        const s = sess || [];
        setSessions(s);
        const ids = s.map((x: any) => x.session_id);
        if (ids.length) {
          const { data: ev } = await (supabase as any)
            .from("analytics_events").select("session_id,event_type,path,meta,created_at")
            .in("session_id", ids).order("created_at", { ascending: true }).limit(2000);
          if (!active) return;
          const grp: Record<string, any[]> = {};
          for (const e of ev || []) (grp[e.session_id] ??= []).push(e);
          setEventsBySession(grp);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId]);

  if (loading) return <div className="flex items-center gap-2 text-xs text-slate-400 py-2"><Loader2 size={14} className="animate-spin" /> Ziyaret geçmişi yükleniyor…</div>;
  if (sessions.length === 0) return <p className="text-xs text-slate-400 italic">Bu üye için henüz ziyaret kaydı yok.</p>;

  return (
    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
      {sessions.map((s) => {
        const evs = eventsBySession[s.session_id] || [];
        const bought = evs.some((e) => e.event_type === "purchase");
        const cartNoBuy = !bought && evs.some((e) => e.event_type === "add_to_cart" || e.event_type === "quick_buy");
        const isOpen = open === s.session_id;
        return (
          <div key={s.session_id} className="border border-slate-100 rounded-lg overflow-hidden">
            <button onClick={() => setOpen(isOpen ? null : s.session_id)} className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-slate-50 text-left">
              {isOpen ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <span className="text-slate-600 font-medium">{new Date(s.started_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="text-slate-400">· {evs.length} adım</span>
                  <span className="text-slate-400">· {s.utm_source || s.referrer || "doğrudan"}{s.utm_campaign ? ` / ${s.utm_campaign}` : ""}</span>
                  {bought && <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-bold">satın aldı</span>}
                  {cartNoBuy && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">sepette bıraktı</span>}
                </div>
              </div>
            </button>
            {isOpen && (
              <ol className="relative border-l-2 border-olive-100 ml-4 mr-2 mb-2 space-y-1.5 py-1">
                {evs.map((e, i) => {
                  const info = EVENT_LABEL[e.event_type] || { txt: e.event_type, icon: Activity };
                  const Icon = info.icon;
                  return (
                    <li key={i} className="ml-3 flex items-start gap-1.5">
                      <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-white border-2 border-olive-300 flex items-center justify-center">
                        <Icon size={7} className="text-olive-600" />
                      </span>
                      <span className="text-[10px] text-slate-400 w-8 shrink-0">{new Date(e.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-[11px]"><b className={e.event_type === "purchase" ? "text-green-700" : "text-slate-700"}>{info.txt}</b> <span className="text-slate-500">{eventDetail(e)}</span></span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}
