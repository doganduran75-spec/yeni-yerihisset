"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { orderNextStep, isReturnInvoiceDue, isRefundDue, isGeneralOrderTodo, isUninvoicedShipped, type NextStep } from "@/lib/order-next-step";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import DashboardSummary from "@/components/admin/DashboardSummary";
import SystemStatusStrip from "@/components/admin/SystemStatusStrip";
import { fetchNoResultSearches } from "@/components/admin/NoResultSearches";
import { Loader2, Clock } from "lucide-react";
import { UNINVOICED_SINCE, INVOICE_DAYS } from "@/lib/order-next-step";
import { commissionOwner, commissionPeriod, currentPeriodStart, periodLabel, type CommissionAffiliate } from "@/lib/affiliate-commission";

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
  const [manualStockCount, setManualStockCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);         // cevapsız müşteri mesajı (sipariş konuşması)
  const [qnaCount, setQnaCount] = useState(0);         // cevap bekleyen Trendyol müşteri sorusu (MIG 20261184)
  const [reviewCount, setReviewCount] = useState(0);   // onay bekleyen yorum
  const [feedbackCount, setFeedbackCount] = useState(0); // bekleyen talep (Talep & Geri Bildirim)
  const [returnsOpen, setReturnsOpen] = useState(0); // yoldaki iadeler (kod gönderildi / müşteri gönderiyor) — iş: gelince "İade geldi"
  const [exchangeOpen, setExchangeOpen] = useState(0); // süren değişim (açık değişim talebi) — sonuçlanınca fatura
  const [uninvoiced, setUninvoiced] = useState({ n: 0, late: 0 }); // kargolanmış, faturası kesilmemiş (late: 7 günü geçen)
  const [searchCount, setSearchCount] = useState(0);   // bakılmamış sonuçsuz arama (30 gün)
  const [payoutDue, setPayoutDue] = useState<{ n: number; period: string | null }>({ n: 0, period: null }); // hakedişi işlenmemiş geçmiş ay
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
        // Sipariş listesiyle AYNI alanlar (*): sıradaki adım kuralı packed_at, mp_picking_at vb. okur — eksik alan panoda
        // farklı sayı veriyordu (2026-11-04: paket hazır sipariş panoda "Paket hazır" bekliyor görünüyordu)
        // ret_items: kısmi iade (kargo "Teslim edildi"de kalır) yalnız ürün satırlarından görünür — 2026-11-14
        .select('*, profiles (first_name, last_name), order_cases (kind, status, return_method, label_sent_at, closed_at), ret_items:order_items(id, quantity, returned_qty, exchange_of)')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1000);
      const todo = ((openData as any[]) || [])
        .map((o) => ({ ...o, step: orderNextStep({ ...o, order_items: o.ret_items ?? null, open_case: (o.order_cases || []).find((c: any) => !c.closed_at) ?? null }) }))
        .filter((o) => o.step.needsAction);
      setOpenOrders(todo as OpenOrder[]);

      // Stok geldi ama otomatik e-posta gitmedi (e-postasız / gönderilemedi) → elden haber verilecek.
      // Kural Stok Bildirimleri › Manuel bildirim ile aynı: stock_notify_ready() ("her renk" talebinde modelin başka rengi dahil)
      const { data: readyIds } = await (supabase as any).rpc("stock_notify_ready");
      setManualStockCount(((readyIds as any[]) || []).length);

      // Cevaplanmayan mesajlar: SİPARİŞ bazlı — son mesajı 'user' olan konuşmalar
      const { data: allMessages } = await (supabase as any)
        .from('messages')
        .select('order_id, sender_role, created_at')
        .not('order_id', 'is', null)
        .order('created_at', { ascending: false });
      const lastPerOrder = new Map<string, any>();
      for (const msg of (allMessages as any[]) || []) if (!lastPerOrder.has(msg.order_id)) lastPerOrder.set(msg.order_id, msg);
      setMsgCount([...lastPerOrder.values()].filter((m) => m.sender_role === 'user').length);
      const { count: qn } = await (supabase as any).from("marketplace_questions").select("id", { count: "exact", head: true }).eq("status", "WAITING_FOR_ANSWER");
      setQnaCount(qn ?? 0);

      // Onay bekleyen yorumlar · bekleyen talepler · bakılmamış sonuçsuz aramalar (yalnız sayı; liste kendi sayfasında)
      const [rv, fb, nrs, rt] = await Promise.all([
        (supabase as any).from("order_reviews").select("id", { count: "exact", head: true }).eq("is_approved", false).is("admin_note", null),
        (supabase as any).from("feedback").select("id", { count: "exact", head: true }).eq("is_handled", false),
        fetchNoResultSearches(30),
        (supabase as any).from("order_cases").select("id", { count: "exact", head: true }).eq("kind", "return").eq("status", "label_sent").is("closed_at", null),
      ]);
      // Süren değişim: açık değişim talebi (talep → alternatif → müşteri seçer → tutulmayan geri gelir)
      const { count: exOpen } = await (supabase as any).from("order_cases").select("id", { count: "exact", head: true }).eq("kind", "exchange").is("closed_at", null);
      setExchangeOpen(exOpen || 0);
      // + Trendyol'da iade talebi açılmış, ürün yolda (src/lib/marketplace/trendyol-claims.ts)
      const { count: tyRet } = await (supabase as any).from("orders").select("id", { count: "exact", head: true }).eq("mp_claim_state", "in_transit");
      setReturnsOpen((rt.count || 0) + (tyRet || 0));
      setReviewCount(rv.count || 0);
      setFeedbackCount(fb.count || 0);
      // Kargolanmış, faturası kesilmemiş (site + Paraşüt sonrası pazaryeri) · 7 günü geçenler ayrıca
      const uninvQ = () => (supabase as any).from("orders").select("id", { count: "exact", head: true })
        .neq("status", "cancelled").in("payment_status", ["paid", "partial_refund"]).in("shipment_status", ["shipped", "delivered"])
        .eq("invoice_status", "pending")
        // Yeni sitenin siparişi (aktarılmamış) ya da Paraşüt'e geçiş sonrası gelen her sipariş — eski siteden (WooCommerce)
        // aktarılanlar dahil: site canlıya geçene kadar siparişler eski sitede alınıp aktarılıyor (2026-10-31: pano 0 sayıyordu)
        .or(`and(channel.eq.site,import_source.is.null),created_at.gte.${UNINVOICED_SINCE}`);
      const [ui, uiLate] = await Promise.all([uninvQ(), uninvQ().lt("shipped_at", new Date(Date.now() - INVOICE_DAYS * 86400000).toISOString())]);
      if (ui.error) console.error("Faturası kesilmemiş sayısı okunamadı:", ui.error.message);
      setUninvoiced({ n: ui.count || 0, late: uiLate.count || 0 });
      setSearchCount(nrs.length);
      // Hakediş işlenecek (kullanıcı 2026-11-11): geçmiş aylarda tamamlanmış, komisyonu henüz ortağın hesabına
      // işlenmemiş siparişler — kural hakediş hesabıyla aynı (src/lib/affiliate-commission.ts)
      try {
        const { data: cand } = await (supabase as any).from("orders")
          .select("id, user_id, affiliate_id, coupon_id, refund_status, completed_at")
          .not("completed_at", "is", null).lt("completed_at", currentPeriodStart()).is("commission_run_id", null)
          .or("affiliate_id.not.is.null,coupon_id.not.is.null").limit(2000);
        const rows = (cand as any[]) || [];
        const cIds = [...new Set(rows.map((o) => o.coupon_id).filter(Boolean))];
        const couponAff: Record<string, string | null> = {};
        if (cIds.length) {
          const { data: cs } = await (supabase as any).from("coupons").select("id, affiliate_id").in("id", cIds).not("affiliate_id", "is", null);
          for (const c of (cs as any[]) || []) couponAff[c.id] = c.affiliate_id;
        }
        const aIds = [...new Set(rows.map((o) => o.affiliate_id || couponAff[o.coupon_id]).filter(Boolean))];
        const affs: Record<string, CommissionAffiliate> = {};
        if (aIds.length) {
          const { data: afs } = await (supabase as any).from("affiliate_profiles").select("id, user_id, status, commission_rate").in("id", aIds);
          for (const a of (afs as any[]) || []) affs[a.id] = { user_id: a.user_id, status: a.status, commission_rate: Number(a.commission_rate) };
        }
        const due = rows.filter((o) => commissionOwner(o, couponAff, affs));
        const oldest = due.map((o) => commissionPeriod(o.completed_at)).filter(Boolean).sort()[0] ?? null;
        setPayoutDue({ n: due.length, period: oldest });
      } catch { /* kritik değil */ }
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
  const returnInvoiceDue = openOrders.filter((o) => o.step && isReturnInvoiceDue(o.step)).length;
  // Ücret iadesi yapılacak (iade geldi / müşteri iptali / iptal — para henüz iade edilmedi): ayrı satır (kullanıcı 2026-11-14)
  const refundDue = openOrders.filter((o) => o.step && isRefundDue(o.step)).length;
  // Süren değişimdeki siparişin işi "Süren değişim" satırında (iki yerde sayılmasın)
  const hasOpenExchange = (o: any) => (o.order_cases || []).some((c: any) => !c.closed_at && c.kind === "exchange");
  // Kalan genel işler — listede ?todo=diger aynı kuralla süzer (tıklayınca yalnız bunlar açılır; bir sipariş iki satırda sayılmaz)
  const generalTodo = openOrders.filter((o) => o.step && isGeneralOrderTodo(o.step, hasOpenExchange(o), isUninvoicedShipped(o))).length;

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
              // İade faturası bekleyenler ayrı satırda (aşağıda), burada sayılmaz (kullanıcı 2026-11-03)
              { n: generalTodo, label: "Bekleyen sipariş işi", href: "/admin/orders?todo=diger" },
              { n: msgCount, label: "Cevapsız müşteri mesajı", href: "/admin/messages" },
              { n: qnaCount, label: "Cevapsız Trendyol sorusu", href: "/admin/messages?kanal=trendyol" },
              { n: reviewCount, label: "Onay bekleyen yorum", href: "/admin/reviews" },
              { n: feedbackCount, label: "Talep", href: "/admin/feedback" },
              { n: searchCount, label: "Sonuçsuz arama", href: "/admin/feedback#aramalar" },
              { n: stockTasks.length, label: "Pazaryeri stok görevi", href: "/admin/stock-sync" },
              { n: manualStockCount, label: "Stok geldi — elden haber verilecek", href: "/admin/crm/stock-notifications?tab=manual" },
              // Yoldaki iadeler (kullanıcı 2026-10-28: iş olarak burada takip; ürün gelince siparişte "İade geldi")
              { n: returnsOpen, label: "Yolda olan iade", href: "/admin/orders?iade=return_in_transit" },
              { n: refundDue, label: "Ücret iadesi yapılacak", href: "/admin/orders?iade=refund_due" },
              { n: returnInvoiceDue, label: "İade faturası kesilecek", href: "/admin/orders?iade=return_invoice_due" },
              // Değişim talebinden sonuçlanana kadar (kullanıcı 2026-11-07: süreç bitince fatura kesilecek; işi burada izlenir)
              { n: exchangeOpen, label: "Süren değişim", href: "/admin/orders?iade=exchange_open" },
              // Kargolanmış, faturası kesilmemiş — 7 günü geçen varsa kırmızı not (VUK)
              { n: uninvoiced.n, label: "Faturası kesilmemiş", href: "/admin/orders?iade=uninvoiced_shipped", late: uninvoiced.late },
              // Ay bitti, ortakların hakedişi işlenmedi (Satış Ortaklığı › Hakediş; en eski dönem açılır)
              { n: payoutDue.n, label: payoutDue.period ? `Hakediş işlenecek (${periodLabel(payoutDue.period)})` : "Hakediş işlenecek",
                href: `/admin/affiliates?view=payout${payoutDue.period ? `&period=${payoutDue.period}` : ""}` },
            ].map((x: { n: number; label: string; href: string; info?: boolean; late?: number }) => (
              <Link key={x.label} href={x.href} className={`flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-50 ${x.n ? "font-semibold text-slate-800" : "text-muted-foreground"}`}>
                <span>{x.label}{x.late ? <span className="ml-1.5 text-[11px] font-bold text-red-600">· {x.late} tanesi {INVOICE_DAYS} günü geçti</span> : null}</span>
                <span className={`min-w-[26px] text-center rounded-full px-2 py-0.5 text-xs font-black ${x.n ? (x.info ? "bg-sky-500 text-white" : "bg-amber-500 text-white") : "bg-slate-100 text-slate-400"}`}>{x.n}</span>
              </Link>
            ))}
          </div>
        </Card>
      </DashboardSummary>

    </div>
  );
}
