"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { ShoppingBag, Users, CreditCard, TrendingUp, Loader2, MessageCircle, ArrowRight, Star, Clock, PackageOpen } from "lucide-react";

type Stats = {
  totalSales: number;
  activeOrders: number;
  totalProducts: number;
  totalMembers: number;
};

type RecentOrder = {
  id: string;
  order_number: number | null;
  total_amount: number;
  status: string;
  created_at: string;
  profiles: { first_name: string; last_name: string } | null;
};

const orderStatusMap: Record<string, { label: string; color: string }> = {
  pending:          { label: "Beklemede",         color: "bg-amber-50 text-amber-700 ring-amber-500/20" },
  awaiting_payment: { label: "Ödeme Bekleniyor",  color: "bg-orange-50 text-orange-700 ring-orange-500/20" },
  processing:       { label: "Hazırlanıyor",       color: "bg-blue-50 text-blue-700 ring-blue-500/20" },
  shipped:          { label: "Kargoya Verildi",    color: "bg-purple-50 text-purple-700 ring-purple-500/20" },
  delivered:        { label: "Teslim Edildi",      color: "bg-green-50 text-green-700 ring-green-500/20" },
  cancelled:        { label: "İptal Edildi",       color: "bg-red-50 text-red-700 ring-red-500/20" },
  refunded:         { label: "İade Edildi",        color: "bg-slate-100 text-slate-600 ring-slate-400/20" },
  paid:             { label: "Ödendi",             color: "bg-green-50 text-green-700 ring-green-500/20" },
};

type PendingMessage = {
  user_id: string;
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
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ totalSales: 0, activeOrders: 0, totalProducts: 0, totalMembers: 0 });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      const [productsCount, ordersCount, membersCount] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
      ]);

      const { data: salesData } = await supabase.from('orders').select('total_amount');
      const totalSales = salesData?.reduce((acc, curr) => acc + (curr.total_amount || 0), 0) || 0;

      setStats({
        totalSales,
        activeOrders: ordersCount.count || 0,
        totalProducts: productsCount.count || 0,
        totalMembers: membersCount.count || 0,
      });

      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, status, created_at, profiles (first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentOrders((orders as any) || []);

      // Tamamlanmamış (kapanmamış) siparişler — süreç takibi
      const { data: openData } = await (supabase as any)
        .from('orders')
        .select('id, order_number, total_amount, status, shipment_status, invoice_status, created_at, profiles (first_name, last_name)')
        .eq('is_closed', false)
        .not('status', 'in', '(cancelled,refunded)')
        .order('created_at', { ascending: false })
        .limit(20);
      setOpenOrders((openData as OpenOrder[]) || []);

      // Cevaplanmayan mesajlar: son mesajı 'user' olan yazışmalar
      const { data: allMessages } = await (supabase as any)
        .from('messages')
        .select('user_id, content, sender_role, created_at')
        .order('created_at', { ascending: false });

      if (allMessages) {
        const lastPerUser = new Map<string, { content: string; sender_role: string; created_at: string }>();
        for (const msg of allMessages) {
          if (!lastPerUser.has(msg.user_id)) lastPerUser.set(msg.user_id, msg);
        }

        const unansweredIds = [...lastPerUser.entries()]
          .filter(([, msg]) => msg.sender_role === 'user')
          .slice(0, 5);

        if (unansweredIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', unansweredIds.map(([id]) => id));

          const profileMap = new Map((profiles || []).map(p => [p.id, p]));
          const pending: PendingMessage[] = unansweredIds.map(([userId, msg]) => {
            const p = profileMap.get(userId);
            return {
              user_id: userId,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">Mağazanızın anlık performans özeti.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Satış</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₺{stats.totalSales.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Toplam gerçekleşen ciro</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Sipariş</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeOrders}</div>
            <p className="text-xs text-muted-foreground">Üyeler tarafından verilen sipariş</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Ürün</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">Envanterdeki aktif ürünler</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Üye</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMembers}</div>
            <p className="text-xs text-muted-foreground">Sisteme kayıtlı kullanıcılar</p>
          </CardContent>
        </Card>
      </div>

      {/* Tamamlanmamış Siparişler (süreç kapanmamış) */}
      <Card className="shadow-sm border-l-4 border-l-amber-500">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            Tamamlanmamış Siparişler
            {openOrders.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {openOrders.length}
              </span>
            )}
          </CardTitle>
          <Link href="/admin/orders" className="text-xs text-muted-foreground hover:text-amber-600 flex items-center gap-1 transition-colors">
            Tümü <ArrowRight size={12} />
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {openOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-2">
              <PackageOpen size={28} className="text-slate-300" />
              Tüm siparişler tamamlandı. 🎉
            </p>
          ) : (
            <div className="divide-y">
              {openOrders.map((o) => {
                const st = orderStatusMap[o.status] ?? { label: o.status, color: "bg-slate-50 text-slate-600 ring-slate-400/20" };
                const invoiced = o.invoice_status === "invoiced";
                return (
                  <Link key={o.id} href={`/admin/orders?id=${o.id}`}
                    className="flex items-center gap-3 py-2.5 px-2 hover:bg-amber-50/50 rounded-lg transition-colors group">
                    <span className="font-mono text-xs font-bold text-blue-600 w-16 shrink-0">YH{o.order_number ?? "—"}</span>
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">
                      {o.profiles?.first_name} {o.profiles?.last_name}
                    </span>
                    <span className={`hidden sm:inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${st.color}`}>{st.label}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${invoiced ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {invoiced ? "Faturalı" : "Fatura yok"}
                    </span>
                    <span className="text-sm text-slate-500 w-20 text-right shrink-0">₺{o.total_amount.toFixed(0)}</span>
                    <span className="text-[10px] text-slate-400 w-16 text-right shrink-0 hidden md:block">
                      {new Date(o.created_at).toLocaleDateString("tr-TR")}
                    </span>
                    <ArrowRight size={12} className="text-slate-300 group-hover:text-amber-500 transition-colors shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Son Siparişler */}
        <Card className="shadow-sm border-muted lg:col-span-2">
          <CardHeader>
            <CardTitle>Son Siparişler</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Henüz sipariş bulunmuyor.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Sipariş No</TableHead>
                    <TableHead>Müşteri</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Tutar</TableHead>
                    <TableHead className="text-right">Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order) => {
                    const st = orderStatusMap[order.status] ?? { label: order.status, color: "bg-slate-50 text-slate-600 ring-slate-400/20" };
                    return (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Link
                            href={`/admin/orders?id=${order.id}`}
                            className="font-mono text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            YH{order.order_number ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {order.profiles?.first_name} {order.profiles?.last_name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString('tr-TR')}
                        </TableCell>
                        <TableCell className="text-sm">₺{order.total_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${st.color}`}>
                            {st.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Yeni Mesajlar */}
        <Card className="shadow-sm border-l-4 border-l-rose-500">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle size={18} className="text-rose-500" />
              Yeni Mesajlar
              {pendingMessages.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {pendingMessages.length}
                </span>
              )}
            </CardTitle>
            <Link
              href="/admin/messages"
              className="text-xs text-muted-foreground hover:text-rose-600 flex items-center gap-1 transition-colors"
            >
              Tümü <ArrowRight size={12} />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {pendingMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Bekleyen mesaj yok.
              </p>
            ) : (
              <div className="space-y-1">
                {pendingMessages.map((msg) => (
                  <Link
                    key={msg.user_id}
                    href={`/admin/messages?user=${msg.user_id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-rose-50 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-xs font-black text-rose-600 uppercase">
                      {msg.first_name[0] || "?"}{msg.last_name[0] || ""}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 leading-none">
                        {msg.first_name} {msg.last_name}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{msg.content}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-slate-400">
                        {new Date(msg.created_at).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                      </span>
                      <ArrowRight size={12} className="text-slate-300 group-hover:text-rose-500 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Onay Bekleyen Yorumlar */}
        <Card className="shadow-sm border-l-4 border-l-amber-400">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2">
              <Star size={18} className="text-amber-500" />
              Yorumlar
              {pendingReviews.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {pendingReviews.length}
                </span>
              )}
            </CardTitle>
            <Link
              href="/admin/reviews"
              className="text-xs text-muted-foreground hover:text-amber-600 flex items-center gap-1 transition-colors"
            >
              Tümü <ArrowRight size={12} />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {pendingReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Onay bekleyen yorum yok.
              </p>
            ) : (
              <div className="space-y-1">
                {pendingReviews.map((review) => {
                  const avg = ((review.rating_shipping + review.rating_quality + review.rating_communication) / 3).toFixed(1);
                  const name = [review.profiles?.first_name, review.profiles?.last_name].filter(Boolean).join(" ") || "Müşteri";
                  return (
                    <Link
                      key={review.id}
                      href="/admin/reviews"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-amber-50 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Star size={14} className="text-amber-500 fill-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-slate-900 leading-none truncate">{name}</p>
                          {review.orders?.order_number && (
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-400 px-1 rounded">
                              YH{review.orders.order_number}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {review.comment || "Yorumsuz değerlendirme"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="flex items-center gap-0.5 text-xs font-bold text-amber-600">
                          <Star size={10} className="fill-amber-400 text-amber-400" />
                          {avg}
                        </span>
                        <ArrowRight size={12} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
