"use client";

import { orderLabel } from "@/lib/order-label";
import Link from "next/link";
import { useEffect, useState } from "react";
import { orderNextStep, type NextStep } from "@/lib/order-next-step";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import DashboardSummary from "@/components/admin/DashboardSummary";
import SystemStatusStrip from "@/components/admin/SystemStatusStrip";
import { fetchNoResultSearches } from "@/components/admin/NoResultSearches";
import { Loader2, ArrowRight, Clock, PackageOpen } from "lucide-react";
import { UNINVOICED_SINCE, INVOICE_DAYS } from "@/lib/order-next-step";

type OpenOrder = {
  id: string;
  order_number: number | null;
  total_amount: number;
  status: string;
  shipment_status: string | null;
  invoice_status: string | null;
  created_at: string;
  profiles: { first_name: string | null; last_name: string | null } | null;
  channel?: string | null;       // site | trendyol | hepsiburada
  customer_name?: string | null; // pazaryeri müşterisi (üye değil)
  step?: NextStep;               // sıradaki adım (src/lib/order-next-step.ts)
};

export default function AdminDashboard() {
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [manualAlerts, setManualAlerts] = useState<{ id: string; product: string; who: string; channel: string }[]>([]);
  const [msgCount, setMsgCount] = useState(0);         // cevapsız müşteri mesajı (sipariş konuşması)
  const [reviewCount, setReviewCount] = useState(0);   // onay bekleyen yorum
  const [feedbackCount, setFeedbackCount] = useState(0); // bekleyen talep (Talep & Geri Bildirim)
  const [returnsOpen, setReturnsOpen] = useState(0); // yoldaki iadeler (kod gönderildi / müşteri gönderiyor) — iş: gelince "İade geldi"
  const [uninvoiced, setUninvoiced] = useState({ n: 0, late: 0 }); // kargolanmış, faturası kesilmemiş (late: 7 günü geçen)
  const [searchCount, setSearchCount] = useState(0);   // bakılmamış sonuçsuz arama (30 gün)
  const [stockTasks, setStockTasks] = useState<any[]>([]); // pazaryeri stok görevleri (bekleyen)
  const [loading, setLoading] = useState(true);

  // Pazaryeri stok görevleri (servis-rol endpoint; browser client RLS ile göremez)
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch("/api/admin/stock-sync", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const d = await res.json();
        if (d.ok) setStockTasks(d.pending || []);
      } catch { /* kritik değil */ }
    })();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      // BEKLEYEN İŞLERİM — sıradaki adımı yöneticide olan siparişler. Sipariş listesindeki
      // "Bekleyen işlerim" ile AYNI kural (src/lib/order-next-step.ts): pazaryerinin yönettiği
      // (kargoda / teslim / faturalı) ve eski aktarılmış siparişler burada görünmez.
      const { data: openData } = await (supabase as any)
        .from('orders')
        .select('id, order_number, external_order_number, total_amount, refunded_amount, status, payment_status, shipment_status, invoice_status, created_at, channel, import_source, customer_name, kargonomi_tracking_code, kargonomi_shipment_id, kargonomi_confirmed_at, kargonomi_provider, kargonomi_error, parasut_status, parasut_error, mp_restocked_at, fit_status, delivered_at, profiles (first_name, last_name), order_cases (kind, status, return_method, label_sent_at, closed_at)')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1000);
      const todo = ((openData as any[]) || [])
        .map((o) => ({ ...o, step: orderNextStep({ ...o, open_case: (o.order_cases || []).find((c: any) => !c.closed_at) ?? null }) }))
        .filter((o) => o.step.needsAction);
      setOpenOrders(todo as OpenOrder[]);

      // Manuel stok uyarısı: e-postası olmayan (Instagram/telefon) bekleyen stok bildirimleri → ELDEN bilgilendirilmeli
      // (auto e-posta yok). Yalnız istenen numara / ürün STOĞA GİRDİYSE uyarı (stok yokken "haber ver" demesin)
      const { data: snData } = await (supabase as any)
        .from("stock_notifications")
        .select("id, email, phone, instagram, status, variant_id, products(title, stock), product_variants(stock), contacts(full_name, instagram_handle, phone, email)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(40);
      const alerts = ((snData as any[]) || [])
        .filter((n) => {
          const email = n.email || n.contacts?.email;
          const ig = n.instagram || n.contacts?.instagram_handle;
          const ph = n.phone || n.contacts?.phone;
          const inStock = n.variant_id ? Number(n.product_variants?.stock ?? 0) > 0 : Number(n.products?.stock ?? 0) > 0;
          return !email && (ig || ph) && inStock;
        })
        .map((n) => {
          const ig = n.instagram || n.contacts?.instagram_handle;
          const ph = n.phone || n.contacts?.phone;
          return {
            id: n.id,
            product: n.products?.title || "—",
            who: n.contacts?.full_name || "",
            channel: ig ? `@${ig}` : (ph || ""),
          };
        });
      setManualAlerts(alerts);

      // Cevaplanmayan mesajlar: SİPARİŞ bazlı — son mesajı 'user' olan konuşmalar
      const { data: allMessages } = await (supabase as any)
        .from('messages')
        .select('order_id, sender_role, created_at')
        .not('order_id', 'is', null)
        .order('created_at', { ascending: false });
      const lastPerOrder = new Map<string, any>();
      for (const msg of (allMessages as any[]) || []) if (!lastPerOrder.has(msg.order_id)) lastPerOrder.set(msg.order_id, msg);
      setMsgCount([...lastPerOrder.values()].filter((m) => m.sender_role === 'user').length);

      // Onay bekleyen yorumlar · bekleyen talepler · bakılmamış sonuçsuz aramalar (yalnız sayı; liste kendi sayfasında)
      const [rv, fb, nrs, rt] = await Promise.all([
        (supabase as any).from("order_reviews").select("id", { count: "exact", head: true }).eq("is_approved", false).is("admin_note", null),
        (supabase as any).from("feedback").select("id", { count: "exact", head: true }).eq("is_handled", false),
        fetchNoResultSearches(30),
        (supabase as any).from("order_cases").select("id", { count: "exact", head: true }).eq("kind", "return").eq("status", "label_sent").is("closed_at", null),
      ]);
      setReturnsOpen(rt.count || 0);
      setReviewCount(rv.count || 0);
      setFeedbackCount(fb.count || 0);
      // Kargolanmış, faturası kesilmemiş (site + Paraşüt sonrası pazaryeri) · 7 günü geçenler ayrıca
      const uninvQ = () => (supabase as any).from("orders").select("id", { count: "exact", head: true })
        .neq("status", "cancelled").in("payment_status", ["paid", "partial_refund"]).in("shipment_status", ["shipped", "delivered"])
        .is("import_source", null)
        // Fatura durumu boş (null) ya da 'pending' + (site ya da Paraşüt'e geçiş sonrası pazaryeri) — TEK "or" içinde
        // (liste boş durumu da "Bekleniyor" sayıyor; pano yalnız 'pending' sayınca 0 görünüyordu)
        .or([`and(invoice_status.is.null,channel.eq.site)`, `and(invoice_status.is.null,created_at.gte.${UNINVOICED_SINCE})`,
          `and(invoice_status.eq.pending,channel.eq.site)`, `and(invoice_status.eq.pending,created_at.gte.${UNINVOICED_SINCE})`].join(","));
      const [ui, uiLate] = await Promise.all([uninvQ(), uninvQ().lt("shipped_at", new Date(Date.now() - INVOICE_DAYS * 86400000).toISOString())]);
      if (ui.error) console.error("Faturası kesilmemiş sayısı okunamadı:", ui.error.message);
      setUninvoiced({ n: ui.count || 0, late: uiLate.count || 0 });
      setSearchCount(nrs.length);
    } catch (error) {
      console.error("Dashboard data fetch error:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // TEK EKRAN PANO (≈1600×830): üstte sistem şeridi, ortada satış + kişiler + bugünün işleri,
  // altta bekleyen işlerim (mesaj / yorum / talep / sonuçsuz arama sayıları "Bugünün işleri"nde). Liste uzunlukları ekrana sığacak kadar; "Tümü" ile devamı.
  const CH: Record<string, string> = { trendyol: "TY", hepsiburada: "HB", amazon: "AZ", attipas: "AT" };
  const head = (icon: React.ReactNode, title: string, n: number, href: string, tone: string) => (
    <div className="flex items-center justify-between px-4 pt-3 pb-1">
      <p className="flex items-center gap-2 font-semibold text-sm">
        {icon} {title}
        {n > 0 && <span className={`${tone} text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center`}>{n}</span>}
      </p>
      <Link href={href} className="text-xs text-muted-foreground hover:text-slate-800 flex items-center gap-1">Tümü <ArrowRight size={12} /></Link>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* 1) SİSTEM — göz ucuyla (sorun varsa üstte belirgin uyarı; ayrıntı: /admin/system) */}
      <SystemStatusStrip />

      {/* 2) SATIŞ — özet · kişiler · bugünün işleri */}
      <DashboardSummary>
        <Card className="shadow-sm border-l-4 border-l-amber-500 gap-1 py-3">
          <div className="px-4 pb-1 font-semibold text-sm flex items-center gap-2"><Clock size={16} className="text-amber-500" /> Bugünün işleri</div>
          <div className="px-2 text-sm">
            {[
              { n: openOrders.length, label: "Bekleyen sipariş işi", href: "/admin/orders?todo=1" },
              { n: msgCount, label: "Cevapsız müşteri mesajı", href: "/admin/messages" },
              { n: reviewCount, label: "Onay bekleyen yorum", href: "/admin/reviews" },
              { n: feedbackCount, label: "Talep", href: "/admin/feedback" },
              { n: searchCount, label: "Sonuçsuz arama", href: "/admin/feedback#aramalar" },
              { n: stockTasks.length, label: "Pazaryeri stok görevi", href: "/admin/stock-sync" },
              { n: manualAlerts.length, label: "Elle bilgilendirilecek stok talebi", href: "/admin/crm/stock-notifications" },
              // Yoldaki iadeler (kullanıcı 2026-10-28: iş olarak burada takip; ürün gelince siparişte "İade geldi")
              { n: returnsOpen, label: "Yolda olan iade", href: "/admin/orders?iade=return_in_transit" },
              // Kargolanmış, faturası kesilmemiş — 7 günü geçen varsa kırmızı not (VUK)
              { n: uninvoiced.n, label: "Faturası kesilmemiş", href: "/admin/orders?iade=uninvoiced_shipped", late: uninvoiced.late },
            ].map((x: { n: number; label: string; href: string; info?: boolean; late?: number }) => (
              <Link key={x.label} href={x.href} className={`flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-50 ${x.n ? "font-semibold text-slate-800" : "text-muted-foreground"}`}>
                <span>{x.label}{x.late ? <span className="ml-1.5 text-[11px] font-bold text-red-600">· {x.late} tanesi {INVOICE_DAYS} günü geçti</span> : null}</span>
                <span className={`min-w-[26px] text-center rounded-full px-2 py-0.5 text-xs font-black ${x.n ? (x.info ? "bg-sky-500 text-white" : "bg-amber-500 text-white") : "bg-slate-100 text-slate-400"}`}>{x.n}</span>
              </Link>
            ))}
          </div>
        </Card>
      </DashboardSummary>

      {/* 3) BEKLEYEN İŞLERİM — mesaj / yorum / talep sayıları yukarıda "Bugünün işleri"nde */}
      <Card className="shadow-sm border-l-4 border-l-amber-500 gap-0 py-0 pb-2">
        {head(<Clock size={16} className="text-amber-500" />, "Bekleyen İşlerim", openOrders.length, "/admin/orders?todo=1", "bg-amber-500")}
        {openOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-1"><PackageOpen size={24} className="text-slate-300" /> Bekleyen işin yok. 🎉</p>
        ) : (
          <div className="divide-y px-2">
            {openOrders.slice(0, 7).map((o) => (
              <Link key={o.id} href={`/admin/orders?id=${o.id}`} className="flex items-center gap-3 py-1.5 px-2 hover:bg-amber-50/50 rounded-lg transition-colors group">
                <span className="font-mono text-xs font-bold text-blue-600 w-24 shrink-0 truncate">{orderLabel(o)}</span>
                <span className="text-sm font-medium w-48 shrink-0 truncate">
                  {o.channel && o.channel !== "site" && <span className="mr-1 text-[9px] font-black uppercase px-1 py-0.5 rounded bg-orange-100 text-orange-700">{CH[o.channel] ?? o.channel.slice(0, 2).toUpperCase()}</span>}
                  {(o.profiles ? `${o.profiles.first_name ?? ""} ${o.profiles.last_name ?? ""}`.trim() : "") || o.customer_name || "—"}
                </span>
                <span className="flex-1 min-w-0 truncate text-xs font-bold text-amber-800" title={o.step?.hint}>
                  {o.step?.stage}{(() => { const a = o.step?.actions?.find((x: any) => x.key !== "invoice_parasut") ?? o.step?.actions?.[0]; return a ? ` → ${a.label}` : ""; })()}
                  {o.step?.hint && <span className="font-normal text-slate-500"> · {o.step.hint}</span>}
                </span>
                <span className="text-sm text-slate-500 w-16 text-right shrink-0">₺{Number(o.total_amount).toFixed(0)}</span>
                <span className="text-[10px] text-slate-400 w-16 text-right shrink-0 hidden md:block">{new Date(o.created_at).toLocaleDateString("tr-TR")}</span>
              </Link>
            ))}
            {openOrders.length > 7 && <Link href="/admin/orders?todo=1" className="block text-center text-xs text-muted-foreground hover:text-slate-800 py-1.5">+{openOrders.length - 7} iş daha</Link>}
          </div>
        )}
      </Card>
    </div>
  );
}
