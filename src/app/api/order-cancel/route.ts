import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { CANCEL_COLS, verifyCancelToken, performCustomerCancel, orderLabelOf } from "@/lib/customer-cancel";
import { customerCancelCheck, CUSTOMER_CANCEL_REASONS } from "@/lib/customer-cancel-rule";

/* eslint-disable @typescript-eslint/no-explicit-any */

// MÜŞTERİ SİPARİŞ İPTALİ (2026-11-12): /siparis-iptal sayfası. Kimlik: e-postadaki imzalı r=… ya da oturum + kendi
// siparişi (Hesabım). GET → iptal edilebilir mi + özet; POST { confirm: true, reason?, paidClaim?, iban?, ibanName? } → iptal
// (src/lib/customer-cancel.ts)
async function loadOrder(req: NextRequest, r: string | null, id: string | null) {
  const sb = createAdminClient() as any;
  let orderId = r ? verifyCancelToken(r) : null;
  let via: "email" | "account" = "email";
  if (!orderId && id) {
    const user = await getAuthUserFromRequest(req);
    if (!user) return { error: "Giriş yapmalısın", status: 401 };
    const { data } = await sb.from("orders").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!data) return { error: "Sipariş bulunamadı", status: 404 };
    orderId = data.id; via = "account";
  }
  if (!orderId) return { error: "Bağlantı geçersiz", status: 400 };
  const { data: order } = await sb.from("orders").select(CANCEL_COLS).eq("id", orderId).maybeSingle();
  if (!order) return { error: "Sipariş bulunamadı", status: 404 };
  return { sb, order, via };
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const x: any = await loadOrder(req, u.searchParams.get("r"), u.searchParams.get("id"));
  if (x.error) return NextResponse.json({ error: x.error }, { status: x.status });
  const { data: items } = await x.sb.from("order_items").select("quantity, unit_price, variant_name, products(title)").eq("order_id", x.order.id);
  const chk = customerCancelCheck(x.order);
  return NextResponse.json({
    ok: true, label: orderLabelOf(x.order), total: Number(x.order.total_amount), createdAt: x.order.created_at,
    paid: ["paid", "partial_refund"].includes(x.order.payment_status), cancelled: x.order.status === "cancelled",
    canCancel: chk.ok, mode: chk.ok ? chk.mode : null, why: chk.ok ? null : chk.why, reasons: CUSTOMER_CANCEL_REASONS,
    items: ((items as any[]) || []).filter((i) => Number(i.unit_price) > 0).map((i) => ({ title: i.products?.title || "Ürün", size: i.variant_name || "", qty: i.quantity })),
  });
}

export async function POST(req: NextRequest) {
  if (rateLimited("order-cancel", clientIp(req), 10, 3600000)) return NextResponse.json(TOO_MANY, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== true) return NextResponse.json({ error: "İptali onayla" }, { status: 400 });
  const x: any = await loadOrder(req, body.r ? String(body.r) : null, body.id ? String(body.id) : null);
  if (x.error) return NextResponse.json({ error: x.error }, { status: x.status });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const res: any = await performCustomerCancel(x.sb, x.order, { reason: body.reason, ip, via: x.via, paidClaim: body.paidClaim === true, iban: body.iban, ibanName: body.ibanName });
  if (res.error) {
    if (res.notifyAdmin) {
      import("@/lib/after-sale-mail").then(({ sendAdminCaseEmail }) =>
        sendAdminCaseEmail(x.order.id, "Müşteri iptal etmek istedi — tamamlanamadı", [
          `Müşteri siparişi iptal etmek istedi ama işlem tamamlanamadı: <b>${String(res.error).slice(0, 200)}</b>`,
          "Siparişi panelden iptal edip ödemeyi iade et.",
        ])).catch(() => {});
    }
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, outcome: res.outcome, refunded: res.refunded, amount: res.amount, label: res.label, iban: res.iban, ibanMismatch: !!res.ibanMismatch });
}
