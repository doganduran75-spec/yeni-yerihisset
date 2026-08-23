"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, Banknote, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Affiliate = {
  id: string;
  code: string;
  status: string;
  commission_rate: number;
  total_clicks: number;
  total_orders: number;
  total_earnings: number;
  total_paid: number;
  created_at: string;
  application_answers: any;
  profiles: { first_name: string | null; last_name: string | null; email: string | null } | null;
};

type Conversion = {
  id: string;
  affiliate_id: string;
  order_id: string;
  order_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
  created_at: string;
};

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"affiliates" | "conversions">("affiliates");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const [{ data: affs }, { data: convs }] = await Promise.all([
      supabase
        .from("affiliate_profiles")
        .select("*, profiles(first_name, last_name, email)")
        .order("created_at", { ascending: false }),
      supabase
        .from("affiliate_conversions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    setAffiliates((affs as Affiliate[]) || []);
    setConversions((convs as Conversion[]) || []);
    setLoading(false);
  }

  async function updateAffiliateStatus(id: string, status: string) {
    await supabase
      .from("affiliate_profiles")
      .update({ status })
      .eq("id", id);
    fetchData();
  }

  async function updateConversionStatus(id: string, status: string) {
    await supabase
      .from("affiliate_conversions")
      .update({ status })
      .eq("id", id);
    fetchData();
  }

  const totalPendingCommissions = conversions
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + Number(c.commission_amount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Satış Ortaklığı Yönetimi</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Satış ortakları ve komisyon ödemelerini yönetin.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Toplam Ortak", value: affiliates.length, icon: Users, color: "blue" },
          { label: "Aktif", value: affiliates.filter((a) => a.status === "active").length, icon: CheckCircle2, color: "green" },
          { label: "Bekleyen Komisyon", value: `₺${totalPendingCommissions.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`, icon: Clock, color: "amber" },
          { label: "Toplam Dönüşüm", value: conversions.filter((c) => c.status !== "cancelled").length, icon: TrendingUp, color: "purple" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-none shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                color === "blue" ? "bg-blue-50 text-blue-600" :
                color === "green" ? "bg-green-50 text-green-600" :
                color === "amber" ? "bg-amber-50 text-amber-600" :
                "bg-purple-50 text-purple-600"
              )}>
                <Icon size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-black">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["affiliates", "conversions"] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={cn(
              "px-4 py-2 text-sm font-bold border-b-2 transition-colors -mb-px",
              activeView === view
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {view === "affiliates" ? "Satış Ortakları" : "Komisyonlar"}
          </button>
        ))}
      </div>

      {activeView === "affiliates" && (
        <div className="space-y-3">
          {affiliates.length === 0 ? (
            <Card className="border-none shadow-sm">
              <CardContent className="p-12 text-center text-muted-foreground">
                Henüz affiliate başvurusu yok.
              </CardContent>
            </Card>
          ) : (
            affiliates.map((aff) => (
              <Card key={aff.id} className="border-none shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start gap-4 justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900">
                          {aff.profiles?.first_name} {aff.profiles?.last_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{aff.profiles?.email}</span>
                        <Badge
                          className={cn(
                            "text-[10px] font-bold border-none",
                            aff.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}
                        >
                          {aff.status === "active" ? "Aktif" : "Askıya Alındı"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <span className="font-mono font-bold text-blue-600">?ref={aff.code}</span>
                        <span>%{aff.commission_rate} komisyon</span>
                        <span>{aff.total_clicks ?? 0} tıklama</span>
                        <span>
                          {conversions.filter((c) => c.affiliate_id === aff.id && c.status !== "cancelled").length} satış
                        </span>
                        <span>
                          ₺{conversions
                            .filter((c) => c.affiliate_id === aff.id && c.status !== "cancelled")
                            .reduce((sum, c) => sum + Number(c.commission_amount), 0)
                            .toLocaleString("tr-TR", { minimumFractionDigits: 2 })} komisyon
                        </span>
                      </div>
                      {aff.application_answers && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Platform: {aff.application_answers.platform} ·
                          Takipçi: {aff.application_answers.audience_size} ·
                          İçerik: {aff.application_answers.content_type}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {aff.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50 font-bold"
                          onClick={() => updateAffiliateStatus(aff.id, "suspended")}
                        >
                          <XCircle size={14} className="mr-1" /> Askıya Al
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 font-bold"
                          onClick={() => updateAffiliateStatus(aff.id, "active")}
                        >
                          <CheckCircle2 size={14} className="mr-1" /> Aktifleştir
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeView === "conversions" && (
        <div className="space-y-3">
          {conversions.length === 0 ? (
            <Card className="border-none shadow-sm">
              <CardContent className="p-12 text-center text-muted-foreground">
                Henüz komisyon kaydı yok.
              </CardContent>
            </Card>
          ) : (
            conversions.map((conv) => {
              const aff = affiliates.find((a) => a.id === conv.affiliate_id);
              return (
                <Card key={conv.id} className="border-none shadow-sm">
                  <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {aff?.profiles?.first_name} {aff?.profiles?.last_name}
                        </span>
                        <span className="font-mono text-xs text-blue-600">?ref={aff?.code}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Sipariş #{conv.order_id.slice(0, 8)} · ₺{Number(conv.order_amount).toLocaleString("tr-TR")} ·
                        {new Date(conv.created_at).toLocaleDateString("tr-TR")}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-black text-green-600">
                          +₺{Number(conv.commission_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground">%{conv.commission_rate}</p>
                      </div>
                      <Badge
                        className={cn(
                          "font-bold border-none",
                          conv.status === "paid" ? "bg-green-100 text-green-700" :
                          conv.status === "approved" ? "bg-blue-100 text-blue-700" :
                          conv.status === "cancelled" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        )}
                      >
                        {conv.status === "paid" ? "Ödendi" :
                         conv.status === "approved" ? "Onaylandı" :
                         conv.status === "cancelled" ? "İptal" : "Bekliyor"}
                      </Badge>
                      <div className="flex gap-1">
                        {conv.status === "pending" && (
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 font-bold h-8 text-xs"
                            onClick={() => updateConversionStatus(conv.id, "approved")}
                          >
                            Onayla
                          </Button>
                        )}
                        {conv.status === "approved" && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 font-bold h-8 text-xs"
                            onClick={() => updateConversionStatus(conv.id, "paid")}
                          >
                            <Banknote size={12} className="mr-1" /> Ödendi
                          </Button>
                        )}
                        {(conv.status === "pending" || conv.status === "approved") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 h-8 text-xs"
                            onClick={() => updateConversionStatus(conv.id, "cancelled")}
                          >
                            İptal
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
