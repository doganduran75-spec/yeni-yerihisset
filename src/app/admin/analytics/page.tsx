"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import {
  Activity, Users, ShoppingCart, Ticket, Database, ChevronDown, ChevronRight,
  Globe, Loader2, MousePointerClick, Search, Footprints, Layers, CreditCard, Bot,
} from "lucide-react";

// ── Yardımcılar ──────────────────────────────────────────────────────────────
function fmtBytes(b: number): string {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtTRY(n: number) {
  return "₺" + Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Event tipini insanca anlat
const EVENT_LABEL: Record<string, { txt: string; icon: any }> = {
  page_view: { txt: "sayfa", icon: Globe },
  hero_click: { txt: "karşılama kartı", icon: MousePointerClick },
  category_click: { txt: "kategori", icon: Layers },
  brand_click: { txt: "marka", icon: Layers },
  size_filter: { txt: "numara filtresi", icon: Footprints },
  view_item: { txt: "ürün gördü", icon: Search },
  add_to_cart: { txt: "sepete ekledi", icon: ShoppingCart },
  quick_buy: { txt: "hemen sipariş", icon: ShoppingCart },
  remove_from_cart: { txt: "sepetten çıkardı", icon: ShoppingCart },
  search: { txt: "arama", icon: Search },
  coupon_apply: { txt: "kupon denedi", icon: Ticket },
  begin_checkout: { txt: "ödemeye geçti", icon: CreditCard },
  purchase: { txt: "SATIN ALDI", icon: CreditCard },
  opportunity_click: { txt: "fırsat tıkladı", icon: MousePointerClick },
  campaign_landing: { txt: "kampanya linki", icon: MousePointerClick },
};

function eventDetail(e: any): string {
  const m = e.meta || {};
  switch (e.event_type) {
    case "page_view": return e.path || "";
    case "category_click": return m.category || "";
    case "size_filter": return `${m.size} numara`;
    case "search": return `"${m.term}"${m.results_count != null ? ` (${m.results_count} sonuç)` : ""}`;
    case "view_item": return m.name || m.product_id || "";
    case "add_to_cart": case "quick_buy": return `${m.name || m.product_id || ""}${m.size ? ` · ${m.size}` : ""} · ${fmtTRY(m.price)}`;
    case "coupon_apply": return `${m.code} → ${m.success ? "geçerli" : "RED: " + (m.reason || "?")}`;
    case "purchase": return `${fmtTRY(m.value)} · ${m.coupon ? "kupon: " + m.coupon : "kuponsuz"}`;
    case "hero_click": return m.side === "kesif" ? "Barefoot nedir?" : "Mağaza";
    default: return "";
  }
}

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [eventsBySession, setEventsBySession] = useState<Record<string, any[]>>({});
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showBots, setShowBots] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [stg, ses] = await Promise.all([
          (supabase as any).rpc("analytics_storage"),
          (supabase as any).from("analytics_sessions").select("*").order("started_at", { ascending: false }).limit(200),
        ]);
        setStorage(stg.data || null);
        const sess = ses.data || [];
        setSessions(sess);

        const ids = sess.map((s: any) => s.session_id);
        const uids = [...new Set(sess.map((s: any) => s.user_id).filter(Boolean))];
        if (ids.length) {
          const { data: ev } = await (supabase as any)
            .from("analytics_events").select("session_id,event_type,path,meta,created_at,user_id")
            .in("session_id", ids).order("created_at", { ascending: true }).limit(4000);
          const grp: Record<string, any[]> = {};
          for (const e of ev || []) (grp[e.session_id] ??= []).push(e);
          setEventsBySession(grp);
        }
        if (uids.length) {
          const { data: pr } = await (supabase as any).from("profiles").select("id,first_name,last_name,email").in("id", uids);
          const map: Record<string, any> = {};
          for (const p of pr || []) map[p.id] = p;
          setProfiles(map);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const humanSessions = useMemo(() => sessions.filter((s) => showBots || !s.is_bot), [sessions, showBots]);

  // Özet
  const summary = useMemo(() => {
    let purchases = 0, revenue = 0, addToCart = 0, couponApplies = 0, loggedIn = 0;
    for (const s of humanSessions) {
      if (s.user_id) loggedIn++;
      for (const e of eventsBySession[s.session_id] || []) {
        if (e.event_type === "purchase") { purchases++; revenue += Number(e.meta?.value || 0); }
        else if (e.event_type === "add_to_cart" || e.event_type === "quick_buy") addToCart++;
        else if (e.event_type === "coupon_apply") couponApplies++;
      }
    }
    return { total: humanSessions.length, loggedIn, purchases, revenue, addToCart, couponApplies };
  }, [humanSessions, eventsBySession]);

  // Kaynak / kampanya performansı (Instagram sorusunun cevabı)
  const campaigns = useMemo(() => {
    const map: Record<string, any> = {};
    for (const s of humanSessions) {
      const src = s.utm_source || "(doğrudan/organik)";
      const camp = s.utm_campaign || "—";
      const key = src + " · " + camp;
      const row = (map[key] ??= { src, camp, sessions: 0, addToCart: 0, coupon: 0, purchases: 0, revenue: 0 });
      row.sessions++;
      for (const e of eventsBySession[s.session_id] || []) {
        if (e.event_type === "add_to_cart" || e.event_type === "quick_buy") row.addToCart++;
        else if (e.event_type === "coupon_apply") row.coupon++;
        else if (e.event_type === "purchase") { row.purchases++; row.revenue += Number(e.meta?.value || 0); }
      }
    }
    return Object.values(map).sort((a: any, b: any) => b.sessions - a.sessions);
  }, [humanSessions, eventsBySession]);

  const totalBytes = storage?.total_bytes || 0;

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-black tracking-tight">İstatistikler — Ziyaretçi Yolculuğu</h1>
        <p className="text-sm text-slate-500">Kendi verimiz (first-party). Google Analytics'e paralel çalışır, onun yerine geçmez.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-10"><Loader2 className="animate-spin" size={18} /> Yükleniyor…</div>
      ) : (
        <>
          {/* Özet kartları */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Stat icon={Activity} label="Oturum" value={summary.total} />
            <Stat icon={Users} label="Üye girişli" value={summary.loggedIn} />
            <Stat icon={ShoppingCart} label="Sepete ekleme" value={summary.addToCart} />
            <Stat icon={Ticket} label="Kupon denemesi" value={summary.couponApplies} />
            <Stat icon={CreditCard} label="Satın alma" value={summary.purchases} />
            <Stat icon={CreditCard} label="Ciro" value={fmtTRY(summary.revenue)} />
          </div>

          {/* DB'de kapladığı yer */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Database size={18} /> Veritabanında kapladığı yer</CardTitle>
              <CardDescription>Ham event 180 gün, oturum 365 gün tutulur; sonrası otomatik temizlenir. Kalıcı günlük özet ayrıca saklanır.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <p className="text-3xl font-black text-olive-700">{fmtBytes(totalBytes)}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Toplam analitik</p>
                </div>
                <div className="text-sm text-slate-600 space-y-0.5">
                  <p>Oturumlar: <b>{fmtBytes(storage?.sessions_bytes || 0)}</b> (~{Number(storage?.sessions_rows || 0).toLocaleString("tr-TR")} satır)</p>
                  <p>Event'ler: <b>{fmtBytes(storage?.events_bytes || 0)}</b> (~{Number(storage?.events_rows || 0).toLocaleString("tr-TR")} satır)</p>
                  <p>Günlük özet: <b>{fmtBytes(storage?.daily_bytes || 0)}</b></p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Kaynak / kampanya performansı */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Globe size={18} /> Reklam kaynağı & kampanya performansı</CardTitle>
              <CardDescription>Instagram sorusu: kaç kişi geldi, kaçı kupon denedi, kaçı aldı. Link etiketi (utm) olan trafik burada ayrışır.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-slate-400 border-b">
                    <th className="py-2 pr-3">Kaynak · Kampanya</th>
                    <th className="py-2 px-2 text-right">Oturum</th>
                    <th className="py-2 px-2 text-right">Sepet</th>
                    <th className="py-2 px-2 text-right">Kupon</th>
                    <th className="py-2 px-2 text-right">Satış</th>
                    <th className="py-2 px-2 text-right">Ciro</th>
                    <th className="py-2 pl-2 text-right">Dönüşüm</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c: any) => (
                    <tr key={c.src + c.camp} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-3"><span className="font-bold text-slate-800">{c.src}</span> <span className="text-slate-400">· {c.camp}</span></td>
                      <td className="py-2 px-2 text-right">{c.sessions}</td>
                      <td className="py-2 px-2 text-right">{c.addToCart}</td>
                      <td className="py-2 px-2 text-right">{c.coupon}</td>
                      <td className="py-2 px-2 text-right font-bold">{c.purchases}</td>
                      <td className="py-2 px-2 text-right">{fmtTRY(c.revenue)}</td>
                      <td className="py-2 pl-2 text-right">
                        <Badge className={c.purchases ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}>
                          {c.sessions ? ((c.purchases / c.sessions) * 100).toFixed(0) : 0}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {campaigns.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">Henüz veri yok.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Ziyaretçi yolculuğu akışı */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><Activity size={18} /> Son ziyaretçiler ({humanSessions.length})</CardTitle>
                  <CardDescription>Bir satıra tıkla → o ziyaretçinin adım adım yolculuğu.</CardDescription>
                </div>
                <button onClick={() => setShowBots((v) => !v)} className="text-xs font-bold text-slate-400 hover:text-slate-700 flex items-center gap-1">
                  <Bot size={14} /> {showBots ? "Botları gizle" : "Botları göster"}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {humanSessions.map((s) => {
                const evs = eventsBySession[s.session_id] || [];
                const pr = s.user_id ? profiles[s.user_id] : null;
                const name = pr ? [pr.first_name, pr.last_name].filter(Boolean).join(" ") || pr.email : null;
                const bought = evs.some((e) => e.event_type === "purchase");
                const isOpen = expanded === s.session_id;
                return (
                  <div key={s.session_id} className="border border-slate-100 rounded-xl overflow-hidden">
                    <button onClick={() => setExpanded(isOpen ? null : s.session_id)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left">
                      {isOpen ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {name ? <Badge className="bg-olive-100 text-olive-700">{name}</Badge> : <span className="text-xs text-slate-400">anonim</span>}
                          {s.is_bot && <Badge className="bg-amber-100 text-amber-700">bot</Badge>}
                          <span className="text-xs text-slate-500">{s.utm_source || s.referrer || "doğrudan"}{s.utm_campaign ? ` · ${s.utm_campaign}` : ""}</span>
                          {bought && <Badge className="bg-green-100 text-green-700">satın aldı</Badge>}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">{fmtTime(s.started_at)} · {evs.length} adım · {s.device || "?"} · IP {s.ip || "—"}</p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 pt-1 bg-slate-50/60">
                        <ol className="relative border-l-2 border-olive-100 ml-2 space-y-2 py-1">
                          {evs.map((e, i) => {
                            const info = EVENT_LABEL[e.event_type] || { txt: e.event_type, icon: Activity };
                            const Icon = info.icon;
                            return (
                              <li key={i} className="ml-4 flex items-start gap-2">
                                <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-white border-2 border-olive-300 flex items-center justify-center">
                                  <Icon size={9} className="text-olive-600" />
                                </span>
                                <span className="text-[11px] text-slate-400 w-10 shrink-0">{new Date(e.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                                <span className="text-sm"><b className={e.event_type === "purchase" ? "text-green-700" : "text-slate-700"}>{info.txt}</b> <span className="text-slate-500">{eventDetail(e)}</span></span>
                              </li>
                            );
                          })}
                          {evs.length === 0 && <li className="ml-4 text-xs text-slate-400">event yok</li>}
                        </ol>
                      </div>
                    )}
                  </div>
                );
              })}
              {humanSessions.length === 0 && <p className="py-6 text-center text-slate-400">Henüz ziyaretçi verisi yok.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card>
      <CardContent className="p-4">
        <Icon size={18} className="text-olive-500 mb-1" />
        <p className="text-2xl font-black text-slate-900 leading-tight">{value}</p>
        <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">{label}</p>
      </CardContent>
    </Card>
  );
}
