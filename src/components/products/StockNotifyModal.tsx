"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, Check, Apple, Loader2 } from "lucide-react";

interface StockNotifyModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (variantId?: string) => void;
  productId: string;
  productTitle: string;
  variantId?: string;
  variantName?: string;
}

type Step = "form" | "success";

export default function StockNotifyModal({
  open,
  onClose,
  onSuccess,
  productId,
  productTitle,
  variantId,
  variantName,
}: StockNotifyModalProps) {
  const [step, setStep] = useState<Step>("form");
  const [user, setUser] = useState<any>(null);
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Oturum durumunu kontrol et
  useEffect(() => {
    if (!open) return;
    setStep("form");
    setContact("");
    setError(null);
    setCheckingAuth(true);

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setCheckingAuth(false);
    });
  }, [open]);

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      // Oturum token'ını Authorization header olarak gönder
      // (Supabase oturumu cookie yerine localStorage'da olabilir)
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/stock-notify", {
        method: "POST",
        headers,
        body: JSON.stringify({
          productId,
          variantId,
          contact: user ? undefined : contact.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || data.error || "Bir hata oluştu.");
        return;
      }

      setStep("success");
      onSuccess(variantId);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    // OAuth öncesi bildirimi localStorage'a kaydet
    localStorage.setItem(
      "pendingStockNotify",
      JSON.stringify({ productId, variantId })
    );

    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.href },
    });
  }

  const canSubmitGuest =
    contact.trim().length > 3 &&
    (contact.includes("@") || contact.replace(/\D/g, "").length >= 10);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
        {step === "success" ? (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Check size={32} className="text-green-600" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-black text-slate-900">Kaydedildi!</h2>
              <p className="text-sm text-slate-500">
                Ürün stoka girdiğinde sizi hemen haberdar edeceğiz.
              </p>
            </div>
            <Button
              onClick={onClose}
              className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 font-bold"
            >
              Tamam
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="p-6 pb-0">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center">
                  <Bell size={20} className="text-amber-600" />
                </div>
                <DialogTitle className="text-lg font-black text-slate-900">
                  Stok Bildirimi
                </DialogTitle>
              </div>
              <p className="text-sm text-slate-500 pt-1 pb-2">
                <span className="font-bold text-slate-700">{productTitle}</span>
                {variantName && (
                  <span className="text-slate-400"> &mdash; {variantName}</span>
                )}
                <br />
                Bu seçenek stoka girdiğinde size haber verelim.
              </p>
            </DialogHeader>

            <div className="p-6 pt-4 space-y-4">
              {checkingAuth ? (
                <div className="flex justify-center py-4">
                  <Loader2 size={24} className="animate-spin text-slate-400" />
                </div>
              ) : user ? (
                /* Kayıtlı kullanıcı */
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-2xl text-sm text-blue-700 font-medium">
                    <span className="font-bold">{user.email}</span> adresinize
                    haber vereceğiz.
                  </div>
                  {error && (
                    <p className="text-xs text-red-600 font-medium">{error}</p>
                  )}
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 font-bold"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin mr-2" />
                    ) : (
                      <Bell size={18} className="mr-2" />
                    )}
                    Haber Ver
                  </Button>
                </div>
              ) : (
                /* Misafir */
                <div className="space-y-4">
                  {/* OAuth butonları */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl border-slate-100 font-bold hover:bg-slate-50 gap-2"
                      onClick={() => handleOAuth("google")}
                      disabled={loading}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.26 1.07-3.71 1.07-2.87 0-5.3-1.94-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.83z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.86-2.59 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Google
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl border-slate-100 font-bold hover:bg-slate-50 gap-2"
                      onClick={() => handleOAuth("apple")}
                      disabled={loading}
                    >
                      <Apple size={16} fill="black" />
                      Apple
                    </Button>
                  </div>

                  {/* Ayırıcı */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-100" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        veya
                      </span>
                    </div>
                  </div>

                  {/* E-posta / Telefon */}
                  <div className="space-y-2">
                    <Input
                      placeholder="E-posta veya telefon numaranız"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      className="h-11 rounded-xl bg-slate-50 border-slate-100 font-medium"
                      onKeyDown={(e) => e.key === "Enter" && canSubmitGuest && handleSubmit()}
                    />
                    {error && (
                      <p className="text-xs text-red-600 font-medium">{error}</p>
                    )}
                    <Button
                      onClick={handleSubmit}
                      disabled={loading || !canSubmitGuest}
                      className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold disabled:opacity-40"
                    >
                      {loading ? (
                        <Loader2 size={16} className="animate-spin mr-2" />
                      ) : null}
                      Haber Al
                    </Button>
                  </div>

                  <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    Bilgileriniz yalnızca stok bildirimi için kullanılır.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
