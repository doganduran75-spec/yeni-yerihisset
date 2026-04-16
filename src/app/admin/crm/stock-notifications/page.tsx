"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Loader2, RefreshCw } from "lucide-react";

type Notification = {
  id: string;
  product_id: string;
  variant_id: string | null;
  user_id: string | null;
  email: string | null;
  phone: string | null;
  status: "pending" | "notified";
  created_at: string;
  notified_at: string | null;
  product_title?: string;
  variant_value?: string;
};

export default function StockNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, [filter]);

  async function fetchNotifications() {
    setLoading(true);
    try {
      let query = supabase
        .from("stock_notifications")
        .select(`
          id, product_id, variant_id, user_id, email, phone,
          status, created_at, notified_at,
          products(title),
          product_variants(variant_options(value))
        `)
        .order("created_at", { ascending: false });

      if (filter === "pending") query = query.eq("status", "pending");

      const { data, error } = await query;
      if (error) throw error;

      const formatted = (data || []).map((n: any) => ({
        ...n,
        product_title: n.products?.title ?? "—",
        variant_value: n.product_variants?.variant_options?.value ?? null,
      }));

      setNotifications(formatted);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function markAsNotified(id: string) {
    setMarking(id);
    try {
      const { error } = await supabase
        .from("stock_notifications")
        .update({ status: "notified", notified_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setNotifications((prev) => prev.filter((n) => (filter === "pending" ? n.id !== id : true)).map((n) =>
        n.id === id ? { ...n, status: "notified", notified_at: new Date().toISOString() } : n
      ));
    } finally {
      setMarking(null);
    }
  }

  async function markAllAsNotified() {
    if (!confirm("Bekleyen tüm bildirimler 'Bildirildi' olarak işaretlensin mi?")) return;
    const pendingIds = notifications.filter((n) => n.status === "pending").map((n) => n.id);
    if (!pendingIds.length) return;

    const { error } = await supabase
      .from("stock_notifications")
      .update({ status: "notified", notified_at: new Date().toISOString() })
      .in("id", pendingIds);

    if (!error) fetchNotifications();
  }

  const pendingCount = notifications.filter((n) => n.status === "pending").length;

  function contactDisplay(n: Notification) {
    if (n.email) return n.email;
    if (n.phone) return n.phone;
    if (n.user_id) return <span className="text-slate-400 text-xs italic">Kayıtlı üye</span>;
    return "—";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell size={24} className="text-amber-500" />
            Stok Bildirimleri
          </h2>
          <p className="text-muted-foreground">
            Stok girişinde haberdar edilmek isteyen kişiler.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotifications}
            className="gap-2"
          >
            <RefreshCw size={14} /> Yenile
          </Button>
          {pendingCount > 0 && (
            <Button
              size="sm"
              className="gap-2 bg-green-600 hover:bg-green-700"
              onClick={markAllAsNotified}
            >
              <Check size={14} /> Tümünü Bildirildi İşaretle ({pendingCount})
            </Button>
          )}
        </div>
      </div>

      {/* İstatistik */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Bell size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">{pendingCount}</p>
              <p className="text-xs text-slate-500 font-medium">Bekleyen</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <Check size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">
                {notifications.filter((n) => n.status === "notified").length}
              </p>
              <p className="text-xs text-slate-500 font-medium">Bildirildi</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtre */}
      <div className="flex gap-2">
        {(["pending", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f === "pending" ? "Bekleyenler" : "Tümü"}
          </button>
        ))}
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle>Bildirim Talepleri</CardTitle>
          <CardDescription>
            {filter === "pending" ? "Henüz bildirilmemiş talepler" : "Tüm bildirim talepleri"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground border border-dashed rounded-xl">
              <Bell size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Bekleyen bildirim talebi yok.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Varyasyon</TableHead>
                  <TableHead>İletişim</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {n.product_title}
                    </TableCell>
                    <TableCell>
                      {n.variant_value ? (
                        <Badge variant="outline" className="text-blue-600 border-blue-100 bg-blue-50">
                          {n.variant_value}
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{contactDisplay(n)}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(n.created_at).toLocaleDateString("tr-TR", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      {n.status === "pending" ? (
                        <Badge className="bg-amber-100 text-amber-700 border-none hover:bg-amber-100">
                          Bekliyor
                        </Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-700 border-none hover:bg-green-100">
                          Bildirildi
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {n.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 text-green-600 border-green-100 hover:bg-green-50"
                          disabled={marking === n.id}
                          onClick={() => markAsNotified(n.id)}
                        >
                          {marking === n.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} className="mr-1" />
                          )}
                          Bildirildi
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
