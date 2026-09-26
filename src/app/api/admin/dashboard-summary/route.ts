import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Admin dashboard üst özeti: satış (bu yıl / bu ay / geçen ay) + rollere göre kişi.
// Ciro = ödemesi alınmış (payment_status=paid), iptal edilmemiş siparişlerin
// tahsil edilen tutarı (total_amount; kargo dahil, kupon/kredi sonrası) − iade.
// Adet = bu siparişlerdeki satılan ürün adedi (ücretsiz hediye hariç).
// Dönemler Türkiye saatine göre (UTC+3, yaz saati yok).

type Bucket = { revenue: number; orders: number; units: number };

function trNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  return { y, m };
}
const trStart = (y: number, m: number) => new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+03:00`);

async function fetchAll(make: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  // ── Dönem sınırları ──
  const { y, m } = trNow();
  const yearStart = trStart(y, 1);
  const monthStart = trStart(y, m);
  const lastMonthStart = m === 1 ? trStart(y - 1, 12) : trStart(y, m - 1);
  const since = lastMonthStart < yearStart ? lastMonthStart : yearStart;

  // ── Satış ──
  const orders = await fetchAll((from, to) => (supabase as any)
    .from("orders")
    .select("id, created_at, total_amount, refunded_amount, status, payment_status, order_items(quantity, unit_price)")
    .gte("created_at", since.toISOString())
    .eq("payment_status", "paid")
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .range(from, to));

  const empty = (): Bucket => ({ revenue: 0, orders: 0, units: 0 });
  const sales = { year: empty(), month: empty(), lastMonth: empty() };
  for (const o of orders) {
    const t = new Date(o.created_at);
    const revenue = Math.max(0, Number(o.total_amount || 0) - Number(o.refunded_amount || 0));
    const units = ((o.order_items as any[]) || [])
      .filter((i) => Number(i.unit_price) > 0)
      .reduce((a, i) => a + Number(i.quantity || 0), 0);
    const add = (b: Bucket) => { b.revenue += revenue; b.orders += 1; b.units += units; };
    if (t >= yearStart) add(sales.year);
    if (t >= monthStart) add(sales.month);
    else if (t >= lastMonthStart) add(sales.lastMonth);
  }
  for (const b of Object.values(sales)) b.revenue = Math.round(b.revenue * 100) / 100;

  // ── Kişiler (hesabını kapatanlar hariç) ──
  const since30 = new Date(Date.now() - 30 * 86400_000);
  const [profiles, userRoles, roles] = await Promise.all([
    fetchAll((from, to) => (supabase as any).from("profiles").select("id, created_at, deleted_at").range(from, to)),
    fetchAll((from, to) => (supabase as any).from("user_roles").select("user_id, role_id, assigned_at").range(from, to)),
    (supabase as any).from("roles").select("id, name, slug, level").order("level", { ascending: true }),
  ]);
  const active = new Set(profiles.filter((p) => !p.deleted_at).map((p) => p.id));
  const members = {
    total: active.size,
    new30: profiles.filter((p) => !p.deleted_at && new Date(p.created_at) >= since30).length,
  };
  const roleRows = ((roles.data as any[]) || []).map((r) => {
    const ur = userRoles.filter((x) => x.role_id === r.id && active.has(x.user_id));
    return {
      name: r.name, slug: r.slug,
      total: new Set(ur.map((x) => x.user_id)).size,
      new30: new Set(ur.filter((x) => x.assigned_at && new Date(x.assigned_at) >= since30).map((x) => x.user_id)).size,
    };
  });

  const monthName = (yy: number, mm: number) =>
    new Date(Date.UTC(yy, mm - 1, 15)).toLocaleDateString("tr-TR", { month: "long", timeZone: "UTC" });

  return NextResponse.json({
    ok: true,
    labels: {
      year: String(y),
      month: monthName(y, m),
      lastMonth: m === 1 ? monthName(y - 1, 12) : monthName(y, m - 1),
    },
    sales,
    members,
    roles: roleRows,
  });
}
