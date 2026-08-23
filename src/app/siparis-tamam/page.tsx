"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/useCartStore";
import { trackPurchase } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";

function SiparisTamamInner() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("id") ?? "";
  const { clearCart } = useCartStore();

  useEffect(() => {
    clearCart();

    // GA4 purchase tracking
    if (!orderId) return;
    (async () => {
      const { data: order } = await (supabase as any)
        .from("orders")
        .select("id, order_number, total_amount, order_items(unit_price, quantity, products(title))")
        .eq("id", orderId)
        .single();
      if (!order) return;
      trackPurchase({
        orderId: order.id,
        items: (order.order_items ?? []).map((i: any) => ({
          id: i.products?.id ?? "",
          title: i.products?.title ?? "",
          price: i.unit_price,
          quantity: i.quantity,
        })),
        total: order.total_amount,
        shipping: 0,
      });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} className="text-green-600" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-slate-900 mb-2">Siparişiniz Alındı!</h2>
          {orderId && (
            <p className="text-slate-500 font-medium">
              Sipariş No: <span className="font-bold text-slate-900">#{orderId.slice(0, 8).toUpperCase()}</span>
            </p>
          )}
        </div>
        <p className="text-sm text-slate-500 font-medium leading-relaxed">
          Ödemeniz iyzico güvencesiyle alındı. Siparişinizi hazırlamaya başladık.
          E-posta adresinize bildirim gönderilecektir.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/account?tab=orders"
            className={cn(buttonVariants({ variant: "default" }), "h-12 rounded-2xl bg-blue-600 font-bold")}
          >
            Siparişlerimi Gör
          </Link>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "ghost" }), "h-12 rounded-2xl font-bold")}
          >
            Alışverişe Devam Et
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SiparisTamamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center animate-pulse text-blue-600 font-bold">Yükleniyor...</div>}>
      <SiparisTamamInner />
    </Suspense>
  );
}
