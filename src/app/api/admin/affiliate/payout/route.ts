import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Aylık hakediş (YeriHisset Kredisi) hesaplama + hesaba işleme.
// Kural: verilen dönemde (YYYY-MM) completed_at düşen, henüz ödenmemiş
// (commission_run_id NULL), tam iade edilmemiş, atıflı (link=affiliate_id VEYA
// affiliate'e ait kupon) siparişler. Matrah = ürün tutarı − kupon indirimi −
// iade (kargo hariç). Komisyon = matrah × affiliate oranı.
//
// mode:"preview" → sadece hesaplar, yazmaz.
// mode:"commit"  → affiliate_conversions + ledger yazar, cüzdan bakiyesini artırır,
//                  siparişleri run'a bağlar (idempotent: run_id NULL filtresi +
//                  affiliate_conversions.order_id UNIQUE guard).

function round2(n: number) { return Math.round(n * 100) / 100; }

function periodBounds(period: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

type Row = {
  affiliateId: string;
  orderId: string;
  matrah: number;
  rate: number;
  commission: number;
};

async function computeRows(supabase: any, period: string) {
  const bounds = periodBounds(period);
  if (!bounds) return { error: "Geçersiz dönem (YYYY-MM)" as string };

  // Aday siparişler: dönemde tamamlanmış, ödenmemiş, tam iade değil
  const { data: orders } = await supabase
    .from("orders")
    .select("id, total_amount, coupon_discount, coupon_id, affiliate_id, refund_status, refunded_amount, completed_at")
    .gte("completed_at", bounds.start)
    .lt("completed_at", bounds.end)
    .is("commission_run_id", null);

  const list = ((orders as any[]) || []).filter(
    (o) => o.refund_status !== "full"
  );
  if (!list.length) return { rows: [] as Row[] };

  // Kupon → affiliate eşlemesi (kod ile atıf)
  const couponIds = [...new Set(list.map((o) => o.coupon_id).filter(Boolean))];
  const couponAff: Record<string, string | null> = {};
  if (couponIds.length) {
    const { data: coupons } = await supabase
      .from("coupons").select("id, affiliate_id").in("id", couponIds);
    for (const c of (coupons as any[]) || []) couponAff[c.id] = c.affiliate_id ?? null;
  }

  // Ürün tutarları (order_items) — kargo hariç matrah için
  const orderIds = list.map((o) => o.id);
  const itemsByOrder: Record<string, number> = {};
  const { data: items } = await supabase
    .from("order_items").select("order_id, unit_price, quantity").in("order_id", orderIds);
  for (const it of (items as any[]) || []) {
    itemsByOrder[it.order_id] = (itemsByOrder[it.order_id] || 0) + Number(it.unit_price) * Number(it.quantity);
  }

  // Affiliate oranları
  const affIds = [...new Set(
    list.map((o) => o.affiliate_id || (o.coupon_id ? couponAff[o.coupon_id] : null)).filter(Boolean)
  )] as string[];
  const rateById: Record<string, number> = {};
  if (affIds.length) {
    const { data: affs } = await supabase
      .from("affiliate_profiles").select("id, commission_rate, status").in("id", affIds);
    for (const a of (affs as any[]) || []) {
      // Sadece aktif affiliate'ler komisyon kazanır
      if (a.status === "active") rateById[a.id] = Number(a.commission_rate);
    }
  }

  const rows: Row[] = [];
  for (const o of list) {
    const affiliateId = o.affiliate_id || (o.coupon_id ? couponAff[o.coupon_id] : null);
    if (!affiliateId) continue;                 // atıfsız → komisyon yok
    const rate = rateById[affiliateId];
    if (rate == null) continue;                 // pasif/eksik affiliate → atla
    const itemsTotal = itemsByOrder[o.id] || 0;
    const discount = Number(o.coupon_discount || 0);
    const refunded = Number(o.refunded_amount || 0);
    const matrah = Math.max(0, round2(itemsTotal - discount - refunded));
    if (matrah <= 0) continue;
    const commission = round2((matrah * rate) / 100);
    if (commission <= 0) continue;
    rows.push({ affiliateId, orderId: o.id, matrah, rate, commission });
  }
  return { rows };
}

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = await req.json() as { period?: string; mode?: "preview" | "commit" };
  const period = body.period || "";
  const mode = body.mode || "preview";

  const res = await computeRows(supabase, period);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  const rows = res.rows;

  // Affiliate başına grupla (özet)
  const byAff: Record<string, { affiliate_id: string; order_count: number; total_commission: number; orders: Row[] }> = {};
  for (const r of rows) {
    const g = (byAff[r.affiliateId] ??= { affiliate_id: r.affiliateId, order_count: 0, total_commission: 0, orders: [] });
    g.order_count += 1;
    g.total_commission = round2(g.total_commission + r.commission);
    g.orders.push(r);
  }
  // Affiliate isim/kod
  const affIds = Object.keys(byAff);
  const affInfo: Record<string, any> = {};
  if (affIds.length) {
    const { data: affs } = await supabase
      .from("affiliate_profiles")
      .select("id, code, credit_balance, total_earnings, profiles(first_name, last_name, email)")
      .in("id", affIds);
    for (const a of (affs as any[]) || []) affInfo[a.id] = a;
  }
  const summary = Object.values(byAff).map((g) => ({
    affiliate_id: g.affiliate_id,
    code: affInfo[g.affiliate_id]?.code ?? null,
    name: `${affInfo[g.affiliate_id]?.profiles?.first_name ?? ""} ${affInfo[g.affiliate_id]?.profiles?.last_name ?? ""}`.trim(),
    email: affInfo[g.affiliate_id]?.profiles?.email ?? null,
    order_count: g.order_count,
    total_commission: g.total_commission,
  }));
  const grandTotal = round2(summary.reduce((s, g) => s + g.total_commission, 0));

  if (mode === "preview") {
    return NextResponse.json({ ok: true, period, mode, summary, grandTotal, orderCount: rows.length });
  }

  // ── COMMIT ────────────────────────────────────────────────────────────────
  if (!rows.length) {
    return NextResponse.json({ ok: true, period, mode, committed: 0, grandTotal: 0, message: "İşlenecek hakediş yok." });
  }

  // Dönem çalıştırması
  const { data: run, error: runErr } = await supabase
    .from("affiliate_payout_runs")
    .insert({ period, status: "posted", order_count: rows.length, total_commission: grandTotal, created_by: user.id })
    .select("id").single();
  if (runErr || !run) {
    return NextResponse.json({ error: "Dönem kaydı oluşturulamadı", detail: runErr?.message }, { status: 500 });
  }
  const runId = (run as any).id;

  // Sipariş başına konversiyon + siparişi run'a bağla (idempotent guard)
  for (const r of rows) {
    const { error: cErr } = await supabase.from("affiliate_conversions").insert({
      affiliate_id: r.affiliateId,
      order_id: r.orderId,
      order_amount: r.matrah,
      commission_rate: r.rate,
      commission_amount: r.commission,
      status: "paid",
      run_id: runId,
    });
    // order_id UNIQUE → daha önce sayıldıysa atla (çift işlemeye karşı)
    if (cErr) continue;
    await supabase.from("orders").update({ commission_run_id: runId }).eq("id", r.orderId).is("commission_run_id", null);
  }

  // Affiliate başına cüzdan bakiyesi + ledger
  for (const g of Object.values(byAff)) {
    const prevBal = Number(affInfo[g.affiliate_id]?.credit_balance || 0);
    const newBal = round2(prevBal + g.total_commission);
    const prevEarn = Number(affInfo[g.affiliate_id]?.total_earnings || 0);
    await supabase.from("affiliate_profiles").update({
      credit_balance: newBal,
      total_earnings: round2(prevEarn + g.total_commission),
    }).eq("id", g.affiliate_id);
    await supabase.from("store_credit_ledger").insert({
      affiliate_id: g.affiliate_id,
      user_id: null,
      type: "earning",
      amount: g.total_commission,
      balance_after: newBal,
      period,
      run_id: runId,
      note: `${period} dönemi hakedişi (${g.order_count} sipariş)`,
    });
  }

  return NextResponse.json({ ok: true, period, mode, committed: rows.length, grandTotal, runId, summary });
}
