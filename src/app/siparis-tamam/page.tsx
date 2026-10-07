"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// KARTLA ÖDEME SONRASI — iyzico dönüşü buraya yönlenir (/siparis-tamam?id=<sipariş>).
// Havale başarı ekranıyla (checkout) aynı dil: "Siparişini aldık" + bilgiler + misafir
// aktivasyon kutusu. Sipariş özeti sunucudan okunur (/api/orders/summary) — misafir
// oturum açmadığından RLS istemciden okumaya izin vermez.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/useCartStore";
import { trackPurchase } from "@/lib/analytics";

type Summary = {
  orderNumber: number | null;
  total: number;
  shipping: number;
  paid: boolean;
  cancelled: boolean;
  email: string | null;
  isGuest: boolean;
  items: { id: string; title: string; variant_name: string; price: number; quantity: number }[];
};

function SiparisTamamInner() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("id") ?? "";
  const { clearCart } = useCartStore();
  const [s, setS] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activationState, setActivationState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [activationMsg, setActivationMsg] = useState("");

  useEffect(() => {
    clearCart();
    if (!orderId) { setLoading(false); return; }
    (async () => {
      try {
        const r = await fetch(`/api/orders/summary?id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || !j.ok) return;
        setS(j);
        // GA4 satın alma — sayfa yenilenirse ikinci kez sayılmasın
        const key = `yh_purchase_tracked_${orderId}`;
        let already = false;
        try { already = sessionStorage.getItem(key) === "1"; } catch { /* yok say */ }
        if (j.paid && !already) {
          trackPurchase({
            orderId,
            items: j.items.map((i: any) => ({ id: i.id, title: i.title, price: i.price, quantity: i.quantity, variant_name: i.variant_name })),
            total: j.total,
            shipping: j.shipping,
          });
          try { sessionStorage.setItem(key, "1"); } catch { /* yok say */ }
        }
      } catch { /* özet okunamazsa genel ekran gösterilir */ }
      finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function resendActivation() {
    setActivationState("sending");
    try {
      const res = await fetch("/api/orders/guest-activation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const j = await res.json().catch(() => ({}));
      setActivationMsg(res.ok ? "" : j?.error || "");
      setActivationState(res.ok ? "sent" : "error");
    } catch { setActivationState("error"); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-olive-600 font-bold">
        <Loader2 size={18} className="animate-spin" /> Siparişin yükleniyor…
      </div>
    );
  }

  const label = s?.orderNumber ? `YH${s.orderNumber}` : orderId ? `#${orderId.slice(0, 8).toUpperCase()}` : null;
  const isGuest = !!s?.isGuest;

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4 py-10">
      <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-10 max-w-lg w-full space-y-6">
        {/* ÜST — Siparişini aldık */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-green-600" />
          </div>
          <h2 className="text-3xl font-black text-slate-900">Siparişini aldık!</h2>
          <p className="text-slate-500 font-medium">Ödemen alındı, siparişini hazırlamaya başladık.</p>
        </div>

        {/* Sipariş / ödeme bilgileri */}
        {label && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Sipariş No</span><span className="font-black text-slate-900">{label}</span></div>
            {s && (
              <>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Ödenen Tutar</span>
                  <span className="font-black text-olive-600">₺{s.total.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} <span className="text-[10px] font-medium text-slate-400">KDV dahil</span></span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Ödeme</span>
                  <span className="font-bold text-slate-700 flex items-center gap-1.5"><CreditCard size={14} /> Kredi / banka kartı</span>
                </div>
              </>
            )}
          </div>
        )}

        {s?.email && (
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            Sipariş bilgilerini <b className="text-slate-700">{s.email}</b> adresine de gönderdik.
          </p>
        )}

        {/* MİSAFİR — hesap aktivasyonu (havale ekranıyla aynı) */}
        {isGuest && (
          <div className="rounded-2xl border-2 border-olive-100 bg-olive-50/50 p-5 space-y-3">
            <p className="font-black text-slate-900">Siparişini takip etmek için hesabını aktifleştir</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Siparişinle birlikte bu e-postaya bir hesap açıldı. <b>E-postana gönderdiğimiz bağlantıdan şifreni belirlemen</b> yeterli.
            </p>
            <ul className="text-sm text-slate-600 space-y-1.5">
              {[
                "Sipariş ve kargo takibi",
                "İade / değişim talebi ve bizimle yazışma",
                "Kayıtlı adresle hızlı alışveriş",
                "Favoriler ve “stok gelince haber ver”",
                "Satış ortaklığı ile YeriHisset Kredisi",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2"><CheckCircle2 size={15} className="text-olive-600 shrink-0 mt-0.5" /> {t}</li>
              ))}
            </ul>
            <div className="pt-1 text-xs text-slate-500">
              {activationState === "sent" ? (
                <span className="text-green-700 font-bold">✓ Bağlantıyı tekrar gönderdik.</span>
              ) : activationState === "error" ? (
                <span className="text-red-600 font-bold">{activationMsg || "Gönderilemedi, biraz sonra tekrar dene."}</span>
              ) : (
                <>E-posta gelmedi mi? (Spam klasörüne de bak){" "}
                  <button type="button" onClick={resendActivation} disabled={activationState === "sending"}
                    className="font-bold text-olive-700 underline disabled:opacity-50">
                    {activationState === "sending" ? "Gönderiliyor…" : "Tekrar gönder"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {!isGuest && (
            <Link href="/account?tab=orders" className={cn(buttonVariants({ variant: "default" }), "h-12 rounded-2xl bg-olive-600 font-bold")}>
              Siparişlerimi Gör
            </Link>
          )}
          <Link href="/magaza" className={cn(buttonVariants({ variant: isGuest ? "default" : "ghost" }), "h-12 rounded-2xl font-bold", isGuest && "bg-olive-600")}>
            Alışverişe Devam Et
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SiparisTamamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center animate-pulse text-olive-600 font-bold">Yükleniyor...</div>}>
      <SiparisTamamInner />
    </Suspense>
  );
}
