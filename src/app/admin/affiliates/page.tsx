"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, Banknote, CheckCircle2, XCircle, Clock, Pencil } from "lucide-react";
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
  credit_balance: number;
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
  const [activeView, setActiveView] = useState<"affiliates" | "conversions" | "payout">("affiliates");

  // ── Hakediş (dönemsel YeriHisset Kredisi) ────────────────────────────────
  function lastMonthPeriod(): string {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const [period, setPeriod] = useState<string>(lastMonthPeriod());
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutPreview, setPayoutPreview] = useState<any | null>(null);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);

  async function runPayout(mode: "preview" | "commit") {
    setPayoutBusy(true);
    setPayoutMsg(null);
    if (mode === "preview") setPayoutPreview(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/affiliate/payout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ period, mode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPayoutMsg(data.error || "İşlem başarısız.");
        return;
      }
      if (mode === "preview") {
        setPayoutPreview(data);
        if (!data.summary?.length) setPayoutMsg("Bu dönemde işlenecek hakediş bulunamadı.");
      } else {
        setPayoutMsg(`✓ ${data.committed} sipariş işlendi, toplam ₺${Number(data.grandTotal).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} hesaplara aktarıldı.`);
        setPayoutPreview(null);
        fetchData();
      }
    } catch {
      setPayoutMsg("Bağlantı hatası.");
    } finally {
      setPayoutBusy(false);
    }
  }

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

  // ── Komisyon oranları: ortak bazlı + yeni başvurular için varsayılan ──
  const [rateEdit, setRateEdit] = useState<{ id: string; value: string } | null>(null);
  const [rateMsg, setRateMsg] = useState<string | null>(null);
  const [defaultRate, setDefaultRate] = useState<string>("10");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [defaultSaved, setDefaultSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("settings").select("id, affiliate_default_rate").limit(1).maybeSingle();
      if (data) { setSettingsId(data.id); setDefaultRate(String(Number(data.affiliate_default_rate ?? 10))); }
    })();
  }, []);

  function parseRate(v: string): number | null {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n * 100) / 100 : null;
  }

  async function saveRate() {
    if (!rateEdit) return;
    const n = parseRate(rateEdit.value);
    if (n === null) { setRateMsg("Oran 0 ile 50 arasında olmalı."); return; }
    const { error } = await (supabase as any).from("affiliate_profiles").update({ commission_rate: n }).eq("id", rateEdit.id);
    if (error) { setRateMsg("Kaydedilemedi: " + error.message); return; }
    setRateEdit(null);
    setRateMsg(null);
    fetchData();
  }

  async function saveDefaultRate() {
    const n = parseRate(defaultRate);
    if (n === null || !settingsId) { setRateMsg("Varsayılan oran 0 ile 50 arasında olmalı."); return; }
    const { error } = await (supabase as any).from("settings").update({ affiliate_default_rate: n }).eq("id", settingsId);
    if (error) { setRateMsg("Kaydedilemedi: " + error.message); return; }
    setRateMsg(null);
    setDefaultSaved(true);
    setTimeout(() => setDefaultSaved(false), 2000);
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
        {(["affiliates", "conversions", "payout"] as const).map((view) => (
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
            {view === "affiliates" ? "Satış Ortakları" : view === "conversions" ? "Komisyonlar" : "Hakediş (Dönem)"}
          </button>
        ))}
      </div>

      {activeView === "affiliates" && (
        <div className="space-y-3">
          {/* Oran ayarları */}
          <Card className="border-none shadow-sm">
            <CardContent className="p-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-bold text-slate-800">Yeni ortaklar için varsayılan oran:</span>
              <span className="inline-flex items-center gap-1">
                %<input
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                  className="w-16 h-8 rounded-md border px-2"
                  inputMode="decimal"
                />
              </span>
              <Button size="sm" onClick={saveDefaultRate}>{defaultSaved ? "✓ Kaydedildi" : "Kaydet"}</Button>
              <span className="text-xs text-muted-foreground basis-full">
                Her ortağın oranını satırındaki “%… komisyon” yazısına tıklayarak ayrıca değiştirebilirsin.
                Hakediş, “Hesaba İşle” anındaki orana göre hesaplanır — ay ortasında değiştirirsen o ayın tamamına yeni oran uygulanır.
              </span>
              {rateMsg && <span className="text-xs font-bold text-red-600 basis-full">{rateMsg}</span>}
            </CardContent>
          </Card>
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
                        {rateEdit?.id === aff.id ? (
                          <span className="inline-flex items-center gap-1">
                            %<input
                              autoFocus
                              value={rateEdit.value}
                              onChange={(e) => setRateEdit({ id: aff.id, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") saveRate(); if (e.key === "Escape") setRateEdit(null); }}
                              className="w-16 h-7 rounded-md border px-2 text-sm text-slate-900"
                              inputMode="decimal"
                            />
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={saveRate}>Kaydet</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setRateEdit(null)}>Vazgeç</Button>
                          </span>
                        ) : (
                          <button
                            onClick={() => { setRateEdit({ id: aff.id, value: String(aff.commission_rate) }); setRateMsg(null); }}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-slate-100 text-slate-700 font-bold"
                            title="Oranı değiştir"
                          >
                            %{aff.commission_rate} komisyon <Pencil size={12} />
                          </button>
                        )}
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
                        <span className="font-bold text-green-700">
                          ₺{Number(aff.credit_balance ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} YHK bakiye
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

      {activeView === "payout" && (
        <div className="space-y-5">
          <Card className="border-none shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div>
                <h3 className="font-black text-slate-900">Dönemsel Hakediş Hesaplama</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Seçilen ay içinde <b>ödeme + sevkiyat + fatura tamamlanan</b>, iade edilmemiş, atıflı
                  (link veya affiliate kuponu) siparişlerden komisyonu hesaplar. “Hesaba İşle” ile
                  affiliate’lerin YeriHisset Kredisi bakiyesine ekler. Aynı sipariş iki kez işlenmez.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Dönem (Ay)</label>
                  <input
                    type="month"
                    value={period}
                    onChange={(e) => { setPeriod(e.target.value); setPayoutPreview(null); setPayoutMsg(null); }}
                    className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-mono"
                  />
                </div>
                <Button onClick={() => runPayout("preview")} disabled={payoutBusy || !period} variant="outline" className="font-bold h-10">
                  {payoutBusy ? "Hesaplanıyor…" : "Hesapla (Önizleme)"}
                </Button>
                {payoutPreview?.summary?.length > 0 && (
                  <Button
                    onClick={() => {
                      if (confirm(`${payoutPreview.period} dönemi için toplam ₺${Number(payoutPreview.grandTotal).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} affiliate hesaplarına işlenecek. Onaylıyor musunuz?`)) runPayout("commit");
                    }}
                    disabled={payoutBusy}
                    className="bg-green-600 hover:bg-green-700 font-bold h-10 gap-1.5"
                  >
                    <Banknote size={15} /> Hesaba İşle
                  </Button>
                )}
              </div>
              {payoutMsg && (
                <div className={cn("text-sm font-medium rounded-lg px-3 py-2",
                  payoutMsg.startsWith("✓") ? "bg-green-50 text-green-700 border border-green-100" : "bg-amber-50 text-amber-700 border border-amber-100")}>
                  {payoutMsg}
                </div>
              )}
            </CardContent>
          </Card>

          {payoutPreview?.summary?.length > 0 && (
            <Card className="border-none shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-slate-800">{payoutPreview.period} — Önizleme</h4>
                  <span className="text-sm font-black text-green-600">
                    Toplam ₺{Number(payoutPreview.grandTotal).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                    <span className="text-xs font-medium text-muted-foreground"> · {payoutPreview.orderCount} sipariş</span>
                  </span>
                </div>
                <div className="divide-y">
                  {payoutPreview.summary.map((s: any) => (
                    <div key={s.affiliate_id} className="flex items-center justify-between py-2.5">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{s.name || s.email || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono text-blue-600">?ref={s.code}</span> · {s.order_count} sipariş
                        </p>
                      </div>
                      <p className="font-black text-green-600 shrink-0">
                        +₺{Number(s.total_commission).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Bu bir önizlemedir; hesaplara yansıması için “Hesaba İşle”ye basın.
                </p>
              </CardContent>
            </Card>
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
