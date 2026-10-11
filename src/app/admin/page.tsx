"use client";

import { orderLabel } from "@/lib/order-label";
import Link from "next/link";
import { useEffect, useState } from "react";
import { orderNextStep, type NextStep } from "@/lib/order-next-step";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import DashboardSummary from "@/components/admin/DashboardSummary";
import SystemStatusStrip from "@/components/admin/SystemStatusStrip";
import { Loader2, MessageCircle, ArrowRight, Star, Clock, PackageOpen } from "lucide-react";

type PendingMessage = {
  user_id: string;
  order_id: string;
  order_number: number | null;
  content: string;
  created_at: string;
  first_name: string;
  last_name: string;
};

type PendingReview = {
  id: string;
  order_id: string;
  comment: string | null;
  rating_shipping: number;
  rating_quality: number;
  rating_communication: number;
  created_at: string;
  profiles: { first_name: string | null; last_name: string | null } | null;
  orders: { order_number: number | null } | null;
};

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
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
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
        .select('id, order_number, external_order_number, total_amount, refunded_amount, status, payment_status, shipment_status, invoice_status, created_at, channel, import_source, customer_name, kargonomi_tracking_code, mp_restocked_at, fit_status, delivered_at, profiles (first_name, last_name), order_cases (kind, status, return_method, label_sent_at, closed_at)')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1000);
      const todo = ((openData as any[]) || [])
        .map((o) => ({ ...o, step: orderNextStep({ ...o, open_case: (o.order_cases || []).find((c: any) => !c.closed_at) ?? null }) }))
        .filter((o) => o.step.needsAction);
      setOpenOrders(todo as OpenOrder[]);

      // Manuel stok uyarısı: e-postası olmayan (Instagram/telefon) bekleyen
      // stok bildirimleri → stok gelince ELDEN bilgilendirilmeli (auto e-posta yok)
      const { data: snData } = await (supabase as any)
        .from("stock_notifications")
        .select("id, email, phone, instagram, status, products(title), contacts(full_name, instagram_handle, phone, email)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(40);
      const alerts = ((snData as any[]) || [])
        .filter((n) => {
          const email = n.email || n.contacts?.email;
          const ig = n.instagram || n.contacts?.instagram_handle;
          const ph = n.phone || n.contacts?.phone;
          return !email && (ig || ph);
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
        .select('order_id, user_id, content, sender_role, created_at')
        .not('order_id', 'is', null)
        .order('created_at', { ascending: false });

      if (allMessages) {
        const lastPerOrder = new Map<string, any>();
        for (const msg of allMessages) {
          if (!lastPerOrder.has(msg.order_id)) lastPerOrder.set(msg.order_id, msg);
        }
        const unanswered = [...lastPerOrder.values()].filter((m) => m.sender_role === 'user').slice(0, 5);

        if (unanswered.length > 0) {
          const [{ data: profiles }, { data: ords }] = await Promise.all([
            supabase.from('profiles').select('id, first_name, last_name').in('id', [...new Set(unanswered.map((m) => m.user_id))]),
            (supabase as any).from('orders').select('id, order_number').in('id', unanswered.map((m) => m.order_id)),
          ]);
          const profileMap = new Map((profiles || []).map(p => [p.id, p]));
          const ordMap = new Map((ords || []).map((o: any) => [o.id, o]));
          const pending: PendingMessage[] = unanswered.map((msg) => {
            const p: any = profileMap.get(msg.user_id);
            const o: any = ordMap.get(msg.order_id);
            return {
              user_id: msg.user_id,
              order_id: msg.order_id,
              order_number: o?.order_number ?? null,
              content: msg.content,
              created_at: msg.created_at,
              first_name: p?.first_name || "",
              last_name: p?.last_name || "",
            };
          });
          setPendingMessages(pending);
        }
      }

      // Onay bekleyen yorumlar
      const { data: reviewsData } = await (supabase as any)
        .from("order_reviews")
        .select(`
          id, order_id, comment,
          rating_shipping, rating_quality, rating_communication,
          created_at,
          profiles (first_name, last_name),
          orders (order_number)
        `)
        .eq("is_approved", false)
        .is("admin_note", null)
        .order("created_at", { ascending: false })
        .limit(5);
      setPendingReviews((reviewsData as PendingReview[]) || []);
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
  // altta bekleyen işlerim + mesajlar + yorumlar. Liste uzunlukları ekrana sığacak kadar; "Tümü" ile devamı.
  const tr = (iso: string) => new Date(iso).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
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
              { n: pendingMessages.length, label: "Cevapsız müşteri mesajı", href: "/admin/messages" },
              { n: pendingReviews.length, label: "Onay bekleyen yorum", href: "/admin/reviews" },
              { n: stockTasks.length, label: "Pazaryeri stok görevi", href: "/admin/stock-sync" },
              { n: manualAlerts.length, label: "Elle bilgilendirilecek stok talebi", href: "/admin/crm/stock-notifications" },
            ].map((x) => (
              <Link key={x.label} href={x.href} className={`flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 ${x.n ? "font-semibold text-slate-800" : "text-muted-foreground"}`}>
                <span>{x.label}</span>
                <span className={`min-w-[26px] text-center rounded-full px-2 py-0.5 text-xs font-black ${x.n ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-400"}`}>{x.n}</span>
              </Link>
            ))}
          </div>
        </Card>
      </DashboardSummary>

      {/* 3) YAPILACAKLAR — bekleyen işlerim (geniş) · mesajlar + yorumlar */}
      <div className="grid gap-3 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2 shadow-sm border-l-4 border-l-amber-500 gap-0 py-0 pb-2">
          {head(<Clock size={16} className="text-amber-500" />, "Bekleyen İşlerim", openOrders.length, "/admin/orders?todo=1", "bg-amber-500")}
          {openOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-1"><PackageOpen size={24} className="text-slate-300" /> Bekleyen işin yok. 🎉</p>
          ) : (
            <div className="divide-y px-2">
              {openOrders.slice(0, 7).map((o) => (
                <Link key={o.id} href={`/admin/orders?id=${o.id}`} className="flex items-center gap-3 py-1.5 px-2 hover:bg-amber-50/50 rounded-lg transition-colors group">
                  <span className="font-mono text-xs font-bold text-blue-600 w-24 shrink-0 truncate">{orderLabel(o)}</span>
                  <span className="text-sm font-medium w-40 shrink-0 truncate">
                    {o.channel && o.channel !== "site" && <span className="mr-1 text-[9px] font-black uppercase px-1 py-0.5 rounded bg-orange-100 text-orange-700">{CH[o.channel] ?? o.channel.slice(0, 2).toUpperCase()}</span>}
                    {(o.profiles ? `${o.profiles.first_name ?? ""} ${o.profiles.last_name ?? ""}`.trim() : "") || o.customer_name || "—"}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-xs font-bold text-amber-800" title={o.step?.hint}>
                    {o.step?.stage}{o.step?.actions?.[0] ? ` → ${o.step.actions[0].label}` : ""}
                  </span>
                  <span className="text-sm text-slate-500 w-16 text-right shrink-0">₺{Number(o.total_amount).toFixed(0)}</span>
                  <span className="text-[10px] text-slate-400 w-16 text-right shrink-0 hidden md:block">{new Date(o.created_at).toLocaleDateString("tr-TR")}</span>
                </Link>
              ))}
              {openOrders.length > 7 && <Link href="/admin/orders?todo=1" className="block text-center text-xs text-muted-foreground hover:text-slate-800 py-1.5">+{openOrders.length - 7} iş daha</Link>}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card className="shadow-sm border-l-4 border-l-rose-500 gap-0 py-0 pb-2">
            {head(<MessageCircle size={16} className="text-rose-500" />, "Müşteri mesajları", pendingMessages.length, "/admin/messages", "bg-rose-500")}
            {pendingMessages.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">Cevapsız mesaj yok.</p> : (
              <div className="px-2">
                {pendingMessages.slice(0, 3).map((msg) => (
                  <Link key={msg.order_id} href={`/admin/messages?order=${msg.order_id}`} className="block px-2 py-1.5 rounded-lg hover:bg-rose-50">
                    <p className="text-sm font-semibold text-slate-900 truncate"><span className="text-blue-600">{msg.order_number ? `YH${msg.order_number}` : "#" + msg.order_id.slice(0, 6)}</span> · {msg.first_name} {msg.last_name} <span className="text-[10px] font-normal text-slate-400">{tr(msg.created_at)}</span></p>
                    <p className="text-xs text-slate-500 truncate">{msg.content}</p>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="shadow-sm border-l-4 border-l-amber-400 gap-0 py-0 pb-2">
            {head(<Star size={16} className="text-amber-500" />, "Onay bekleyen yorumlar", pendingReviews.length, "/admin/reviews", "bg-amber-500")}
            {pendingReviews.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">Onay bekleyen yorum yok.</p> : (
              <div className="px-2">
                {pendingReviews.slice(0, 3).map((review) => {
                  const avg = ((review.rating_shipping + review.rating_quality + review.rating_communication) / 3).toFixed(1);
                  const name = [review.profiles?.first_name, review.profiles?.last_name].filter(Boolean).join(" ") || "Müşteri";
                  return (
                    <Link key={review.id} href="/admin/reviews" className="block px-2 py-1.5 rounded-lg hover:bg-amber-50">
                      <p className="text-sm font-semibold text-slate-900 truncate">{name} <span className="text-xs font-bold text-amber-600">★ {avg}</span></p>
                      <p className="text-xs text-slate-500 truncate">{review.comment || "Yorumsuz değerlendirme"}</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
