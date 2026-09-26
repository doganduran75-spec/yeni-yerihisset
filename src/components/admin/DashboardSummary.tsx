"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Dashboard üst özeti: satış (bu yıl / bu ay / geçen ay) + rollere göre kişi
// sayıları (toplam + son 30 gün). Veri: /api/admin/dashboard-summary.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { BarChart3, Users, Loader2 } from "lucide-react";

const tl = (n: number) => "₺" + Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = (n: number) => Number(n || 0).toLocaleString("tr-TR");

export default function DashboardSummary() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch("/api/admin/dashboard-summary", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || "Özet alınamadı");
        setD(j);
      } catch (e: any) { setErr(e?.message || "Özet alınamadı"); }
    })();
  }, []);

  if (err) return <p className="text-sm text-red-600">Özet yüklenemedi: {err}</p>;
  if (!d) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 size={16} className="animate-spin" /> Özet yükleniyor…
      </div>
    );
  }

  const cols = [
    { key: "year", label: `Bu yıl (${d.labels.year})` },
    { key: "month", label: `Bu ay (${d.labels.month})` },
    { key: "lastMonth", label: `Geçen ay (${d.labels.lastMonth})` },
  ] as const;
  const rows = [
    { label: "Toplam ciro", fmt: (b: any) => tl(b.revenue), strong: true },
    { label: "Sipariş", fmt: (b: any) => num(b.orders) },
    { label: "Satılan adet", fmt: (b: any) => num(b.units) },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Satış özeti */}
      <Card className="md:col-span-2 shadow-sm border-l-4 border-l-olive-600">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 size={18} className="text-olive-600" /> Satış Özeti
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b">
                <th className="py-2 pr-3 font-bold" />
                {cols.map((c) => <th key={c.key} className="py-2 px-2 text-right font-bold whitespace-nowrap">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 font-bold text-slate-600 whitespace-nowrap">{r.label}</td>
                  {cols.map((c) => (
                    <td key={c.key} className={`py-2.5 px-2 text-right whitespace-nowrap ${r.strong ? "font-black text-slate-900 text-base" : "font-bold text-slate-700"}`}>
                      {r.fmt(d.sales[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-400 mt-2">
            Ödemesi alınmış, iptal edilmemiş siparişler · ciro kargo dahil, iadeler düşülmüş · adet ücretsiz hediyeler hariç
          </p>
        </CardContent>
      </Card>

      {/* Rollere göre kişi */}
      <Card className="shadow-sm border-l-4 border-l-teal-600">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users size={18} className="text-teal-600" /> Kişiler
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b">
                <th className="py-2 pr-2 font-bold">Rol</th>
                <th className="py-2 px-2 text-right font-bold">Toplam</th>
                <th className="py-2 pl-2 text-right font-bold whitespace-nowrap">Son 30 gün</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-2 font-black text-slate-900">Tüm üyeler</td>
                <td className="py-2 px-2 text-right font-black text-slate-900">{num(d.members.total)}</td>
                <td className="py-2 pl-2 text-right font-bold text-teal-700">+{num(d.members.new30)}</td>
              </tr>
              {d.roles.map((r: any) => (
                <tr key={r.slug} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-bold text-slate-600">{r.name}</td>
                  <td className="py-2 px-2 text-right font-bold text-slate-800">{num(r.total)}</td>
                  <td className="py-2 pl-2 text-right font-bold text-teal-700">+{num(r.new30)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
