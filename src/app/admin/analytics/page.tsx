"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import {
  Activity, Users, ShoppingCart, Ticket, Database, ChevronDown, ChevronRight,
  Globe, Loader2, MousePointerClick, Search, Footprints, Layers, CreditCard, Bot,
  FileSpreadsheet, ChevronLeft,
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

// PostgREST tek istekte en fazla ~1000 satır döner → sayfa sayfa hepsini çek
async function fetchAllRows(make: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const PERIODS = [
  { key: "1", label: "Bugün", days: 1 },
  { key: "7", label: "7 gün", days: 7 },
  { key: "30", label: "30 gün", days: 30 },
  { key: "90", label: "90 gün", days: 90 },
] as const;
const PAGE_SIZE = 20;

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
  const [noResultSearches, setNoResultSearches] = useState<{ term: string; count: number }[]>([]);
  // Dönem + ziyaretçi listesi süzgeci / sayfalama
  const [period, setPeriod] = useState<string>("7");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "member" | "source" | "cart" | "purchase">("all");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setExpanded(null);
      setPage(0);
      try {
        const days = PERIODS.find((p) => p.key === period)?.days ?? 7;
        const since = new Date();
        since.setHours(0, 0, 0, 0);
        since.setDate(since.getDate() - (days - 1));
        const [stg, sess] = await Promise.all([
          (supabase as any).rpc("analytics_storage"),
          fetchAllRows((from, to) => (supabase as any).from("analytics_sessions").select("*")
            .gte("started_at", since.toISOString()).order("started_at", { ascending: false }).range(from, to)),
        ]);
        setStorage(stg.data || null);
        setSessions(sess);

        const ids = sess.map((s: any) => s.session_id);
        const uids = [...new Set(sess.map((s: any) => s.user_id).filter(Boolean))];
        const grp: Record<string, any[]> = {};
        // Oturum kimliklerini parçalara böl (URL uzunluğu), her parçanın tüm event'lerini çek
        for (let i = 0; i < ids.length; i += 60) {
          const chunk = ids.slice(i, i + 60);
          const ev = await fetchAllRows((from, to) => (supabase as any)
            .from("analytics_events").select("session_id,event_type,path,meta,created_at,user_id")
            .in("session_id", chunk).order("created_at", { ascending: true }).range(from, to));
          for (const e of ev) (grp[e.session_id] ??= []).push(e);
        }
        setEventsBySession(grp);
        if (uids.length) {
          const { data: pr } = await (supabase as any).from("profiles").select("id,first_name,last_name,email").in("id", uids);
          const map: Record<string, any> = {};
          for (const p of pr || []) map[p.id] = p;
          setProfiles(map);
        } else setProfiles({});

        // Sonuçsuz aramalar (talep sinyali) — son 500 arama event'i
        const { data: searches } = await (supabase as any)
          .from("analytics_events").select("meta")
          .eq("event_type", "search").gte("created_at", since.toISOString())
          .order("created_at", { ascending: false }).limit(1000);
        const noRes: Record<string, number> = {};
        for (const e of (searches as any[]) || []) {
          if (Number(e.meta?.results_count) === 0 && e.meta?.term) {
            const t = String(e.meta.term).trim().toLocaleLowerCase("tr-TR");
            noRes[t] = (noRes[t] || 0) + 1;
          }
        }
        setNoResultSearches(Object.entries(noRes).map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count).slice(0, 30));
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

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

  // Ziyaretçi listesi: arama + tür süzgeci (tamamı Excel'e, ekrana sayfa sayfa)
  const personName = (s: any) => {
    const pr = s.user_id ? profiles[s.user_id] : null;
    return pr ? [pr.first_name, pr.last_name].filter(Boolean).join(" ") || pr.email || "" : "";
  };
  const filteredSessions = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return humanSessions.filter((s) => {
      const evs = eventsBySession[s.session_id] || [];
      if (kind === "member" && !s.user_id) return false;
      if (kind === "source" && !s.utm_source) return false;
      if (kind === "cart" && !evs.some((e) => e.event_type === "add_to_cart" || e.event_type === "quick_buy")) return false;
      if (kind === "purchase" && !evs.some((e) => e.event_type === "purchase")) return false;
      if (!needle) return true;
      const pr = s.user_id ? profiles[s.user_id] : null;
      const hay = [personName(s), pr?.email, s.ip, s.utm_source, s.utm_campaign, s.referrer, s.landing_path]
        .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      return hay.includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanSessions, eventsBySession, profiles, q, kind]);
  const pageCount = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const pageSessions = filteredSessions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { setPage(0); }, [q, kind, showBots]);

  async function exportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? period;
      const wb = XLSX.utils.book_new();
      const sheet = (rows: any[], name: string) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Bilgi: "Veri yok" }]), name);
      sheet([
        { Metrik: "Dönem", Değer: periodLabel },
        { Metrik: "Oturum", Değer: summary.total },
        { Metrik: "Üye girişli", Değer: summary.loggedIn },
        { Metrik: "Sepete ekleme", Değer: summary.addToCart },
        { Metrik: "Kupon denemesi", Değer: summary.couponApplies },
        { Metrik: "Satın alma", Değer: summary.purchases },
        { Metrik: "Ciro (₺)", Değer: Math.round(summary.revenue * 100) / 100 },
      ], "Özet");
      sheet(campaigns.map((c: any) => ({
        Kaynak: c.src, Kampanya: c.camp, Oturum: c.sessions, Sepet: c.addToCart, Kupon: c.coupon,
        Satış: c.purchases, "Ciro (₺)": Math.round(c.revenue * 100) / 100,
        "Dönüşüm %": c.sessions ? Math.round((c.purchases / c.sessions) * 1000) / 10 : 0,
      })), "Kaynak-Kampanya");
      sheet(filteredSessions.map((s) => {
        const evs = eventsBySession[s.session_id] || [];
        const pr = s.user_id ? profiles[s.user_id] : null;
        return {
          Başlangıç: new Date(s.started_at).toLocaleString("tr-TR"),
          Kişi: personName(s) || "anonim", "E-posta": pr?.email || "",
          Kaynak: s.utm_source || "doğrudan", Kampanya: s.utm_campaign || "", "Gelinen site": s.referrer || "",
          "Giriş sayfası": s.landing_path || "", Adım: evs.length,
          "Sepete ekleme": evs.filter((e) => e.event_type === "add_to_cart" || e.event_type === "quick_buy").length,
          "Satın alma": evs.filter((e) => e.event_type === "purchase").length,
          "Ciro (₺)": evs.filter((e) => e.event_type === "purchase").reduce((a, e) => a + Number(e.meta?.value || 0), 0),
          Cihaz: s.device || "", IP: s.ip || "", Bot: s.is_bot ? "evet" : "",
        };
      }), "Ziyaretçiler");
      const steps: any[] = [];
      for (const s of filteredSessions) {
        for (const e of eventsBySession[s.session_id] || []) {
          steps.push({
            "Oturum başlangıcı": new Date(s.started_at).toLocaleString("tr-TR"),
            Kişi: personName(s) || "anonim", IP: s.ip || "",
            Zaman: new Date(e.created_at).toLocaleString("tr-TR"),
            Adım: EVENT_LABEL[e.event_type]?.txt || e.event_type, Detay: eventDetail(e), Sayfa: e.path || "",
          });
        }
      }
      sheet(steps, "Adımlar");
      sheet(noResultSearches.map((r) => ({ Arama: r.term, Adet: r.count })), "Sonuçsuz aramalar");
      XLSX.writeFile(wb, `istatistik_${new Date().toISOString().slice(0, 10)}_${periodLabel.replace(/\s+/g, "")}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  const totalBytes = storage?.total_bytes || 0;

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">İstatistikler — Ziyaretçi Yolculuğu</h1>
          <p className="text-sm text-slate-500">Kendi verimiz (first-party). Google Analytics'e paralel çalışır, onun yerine geçmez.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 h-8 rounded-lg text-xs font-bold transition-colors ${period === p.key ? "bg-olive-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={exportExcel} disabled={loading || exporting}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-olive-200 bg-olive-50 text-olive-700 text-xs font-black hover:bg-olive-100 disabled:opacity-50">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel&apos;e Aktar
          </button>
        </div>
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

          {/* Sonuçsuz aramalar — talep/stok açığı sinyali */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Search size={18} /> Sonuçsuz aramalar</CardTitle>
              <CardDescription>Ziyaretçiler aradı ama ürün çıkmadı — talep var, stok/ürün yok. En sık istenenleri değerlendir.</CardDescription>
            </CardHeader>
            <CardContent>
              {noResultSearches.length === 0 ? (
                <p className="text-sm text-slate-400">Sonuçsuz arama kaydı yok.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {noResultSearches.map((s) => (
                    <span key={s.term} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-sm">
                      <span className="text-slate-700 font-medium">{s.term}</span>
                      <span className="text-[11px] font-black text-amber-600 bg-amber-100 rounded-full px-1.5">{s.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ziyaretçi yolculuğu akışı */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><Activity size={18} /> Ziyaretçiler ({filteredSessions.length})</CardTitle>
                  <CardDescription>Bir satıra tıkla → o ziyaretçinin adım adım yolculuğu.</CardDescription>
                </div>
                <button onClick={() => setShowBots((v) => !v)} className="text-xs font-bold text-slate-400 hover:text-slate-700 flex items-center gap-1">
                  <Bot size={14} /> {showBots ? "Botları gizle" : "Botları göster"}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {/* Arama + tür süzgeci */}
              <div className="flex flex-wrap items-center gap-2 pb-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara: ad, e-posta, IP, kaynak, kampanya…"
                    className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-olive-200" />
                </div>
                {([["all", "Tümü"], ["member", "Üye"], ["source", "Kaynaklı"], ["cart", "Sepete ekleyen"], ["purchase", "Satın alan"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setKind(k)}
                    className={`px-3 h-8 rounded-lg text-xs font-bold border transition-colors ${kind === k ? "bg-olive-600 text-white border-olive-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {l}
                  </button>
                ))}
              </div>
              {pageSessions.map((s) => {
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
              {filteredSessions.length === 0 && <p className="py-6 text-center text-slate-400">Bu süzgece uyan ziyaretçi yok.</p>}
              {filteredSessions.length > PAGE_SIZE && (
                <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
                  <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredSessions.length)} / {filteredSessions.length}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                      className="h-8 px-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 flex items-center"><ChevronLeft size={14} /> Önceki</button>
                    <span className="px-2 font-bold">{page + 1} / {pageCount}</span>
                    <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
                      className="h-8 px-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 flex items-center">Sonraki <ChevronRight size={14} /></button>
                  </div>
                </div>
              )}
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
