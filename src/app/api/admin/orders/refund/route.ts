import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { createIyzicoClient, formatPrice, newConversationId } from "@/lib/iyzico";

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = await req.json() as {
    orderId: string;
    amount?: number;   // kısmi iade tutarı; yoksa tam iade
    reason?: string;
  };

  const { orderId, amount, reason } = body;
  if (!orderId) return NextResponse.json({ error: "orderId zorunlu" }, { status: 400 });

  // Siparişi çek
  const { data: order } = await (supabase as any)
    .from("orders")
    .select("id, total_amount, iyzico_payment_id, payment_method, refund_status, refunded_amount")
    .eq("id", orderId)
    .single();

  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  if (order.payment_method !== "iyzico") {
    return NextResponse.json({ error: "Bu sipariş iyzico ile ödenmemiş; manuel iade yapın." }, { status: 400 });
  }
  if (!order.iyzico_payment_id) {
    return NextResponse.json({ error: "iyzico ödeme ID bulunamadı." }, { status: 400 });
  }
  if (order.refund_status === "full") {
    return NextResponse.json({ error: "Bu sipariş zaten tam iade edilmiş." }, { status: 400 });
  }

  const refundAmount = amount ?? order.total_amount;
  const alreadyRefunded = Number(order.refunded_amount ?? 0);
  const maxRefundable = Number(order.total_amount) - alreadyRefunded;

  if (refundAmount <= 0 || refundAmount > maxRefundable) {
    return NextResponse.json({
      error: `İade tutarı 0 ile ${maxRefundable.toFixed(2)} ₺ arasında olmalı.`,
    }, { status: 400 });
  }

  // iyzico iade isteği — paymentTransactionId gerekli
  // Önce ödeme detaylarından transaction ID'yi al
  const iyzipay = createIyzicoClient();

  const paymentDetail = await new Promise<any>((resolve) => {
    iyzipay.payment.retrieve(
      { locale: "tr", conversationId: newConversationId(), paymentId: order.iyzico_payment_id },
      (_err: any, result: any) => resolve(result)
    );
  });

  const transactionId = paymentDetail?.paymentItems?.[0]?.paymentTransactionId;
  if (!transactionId) {
    return NextResponse.json({ error: "İşlem ID alınamadı. iyzico panelinden manuel iade yapın." }, { status: 502 });
  }

  // ip adresi (iyzico zorunlu)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

  const refundResult = await new Promise<any>((resolve) => {
    iyzipay.refund.create(
      {
        locale: "tr",
        conversationId: newConversationId(),
        paymentTransactionId: transactionId,
        price: formatPrice(refundAmount),
        currency: "TRY",
        ip,
        ...(reason ? { description: reason } : {}),
      },
      (_err: any, result: any) => resolve(result)
    );
  });

  if (refundResult?.status !== "success") {
    console.error("[refund] iyzico error:", refundResult);
    return NextResponse.json({
      error: refundResult?.errorMessage ?? "iyzico iade hatası",
      code: refundResult?.errorCode,
    }, { status: 502 });
  }

  // DB güncelle
  const newRefunded = alreadyRefunded + refundAmount;
  const isFullRefund = Math.abs(newRefunded - Number(order.total_amount)) < 0.01;

  await (supabase as any)
    .from("orders")
    .update({
      refund_status: isFullRefund ? "full" : "partial",
      refunded_amount: newRefunded,
      status: isFullRefund ? "refunded" : order.status,
      payment_status: isFullRefund ? "refunded" : "partial_refund",
    })
    .eq("id", orderId);

  // Tam iade → ürünler iade edildiği için stoğu geri yükle
  if (isFullRefund) {
    await (supabase as any).rpc("restore_order_stock", { p_order_id: orderId });
  }

  return NextResponse.json({
    ok: true,
    refundedAmount: refundAmount,
    totalRefunded: newRefunded,
    refundStatus: isFullRefund ? "full" : "partial",
  });
}
