"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Şifre belirleme / sıfırlama sayfası.
 * İki durumda kullanılır:
 *   1) "Şifremi unuttum" → e-postadaki bağlantı buraya gelir (recovery session).
 *   2) Lead-magnet/otomatik üyelik → "şifre belirle" bağlantısı buraya gelir.
 *
 * Supabase tarayıcı istemcisi (localStorage) URL'deki recovery token'ını
 * otomatik işler ve PASSWORD_RECOVERY / SIGNED_IN olayı fırlatır. Biz de o
 * oturumla updateUser({ password }) çağırırız.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null); // recovery oturumu var mı
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let settled = false;

    // URL'deki token işlendiğinde bu olay gelir (eski hash-tabanlı akış / lead-magnet)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))) {
        settled = true;
        setReady(true);
      }
    });

    // Kendi-domain akışı: ?token_hash=...&type=recovery → sayfa kendisi doğrular.
    // Bu sayede e-postadaki bağlantı tamamen kendi domainimizdedir (altyapı gizli).
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (tokenHash && type) {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: type as any }) // eslint-disable-line @typescript-eslint/no-explicit-any
        .then(({ data, error }) => {
          if (!error && data?.session) {
            settled = true;
            setReady(true);
            // Token'ı adres çubuğundan temizle
            window.history.replaceState(null, "", "/sifre-belirle");
          } else {
            settled = true;
            setReady(false);
          }
        });
    } else {
      // Doğrudan da bir oturum var mı diye kontrol et (bağlantı zaten işlenmişse)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) { settled = true; setReady(true); }
      });
    }

    // 6 sn içinde oturum kurulmadıysa bağlantı geçersiz/expired demektir
    const t = setTimeout(() => { if (!settled) setReady(false); }, 6000);

    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError("Şifre en az 6 karakter olmalı."); return; }
    if (password !== password2) { setError("Şifreler eşleşmiyor."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.push("/account"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Şifre güncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4">
      <Link href="/" className="mb-8 text-3xl font-black tracking-tighter text-blue-600 flex items-center gap-2">
        <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">Y</div>
        Yeri<span className="text-slate-900">Hisset</span>
      </Link>

      <Card className="w-full max-w-md border-none shadow-2xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
        <CardContent className="p-8 md:p-10">
          <h1 className="text-xl font-black text-slate-900 mb-1">Şifrenizi Belirleyin</h1>
          <p className="text-sm text-slate-500 mb-6">Hesabınıza girmek için yeni bir şifre oluşturun.</p>

          {ready === null && (
            <p className="text-sm text-slate-400 py-6 text-center">Bağlantı doğrulanıyor...</p>
          )}

          {ready === false && !done && (
            <div className="space-y-4">
              <div className="bg-red-50 border-l-4 border-red-500 p-4 flex gap-3">
                <AlertCircle className="text-red-500 shrink-0" size={18} />
                <p className="text-xs font-bold text-red-700">
                  Bağlantı geçersiz ya da süresi dolmuş. Lütfen yeni bir şifre sıfırlama bağlantısı isteyin.
                </p>
              </div>
              <Link href="/login">
                <Button variant="outline" className="w-full rounded-xl">Giriş sayfasına dön</Button>
              </Link>
            </div>
          )}

          {done && (
            <div className="bg-green-50 border-l-4 border-green-500 p-4 flex gap-3">
              <CheckCircle2 className="text-green-500 shrink-0" size={18} />
              <p className="text-xs font-bold text-green-700">Şifreniz belirlendi! Hesabınıza yönlendiriliyorsunuz...</p>
            </div>
          )}

          {ready === true && !done && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">YENİ ŞİFRE</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type={show ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pl-12 pr-12 rounded-xl bg-slate-50 border-slate-100 font-bold"
                  />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">ŞİFRE (TEKRAR)</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type={show ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    className="h-12 pl-12 rounded-xl bg-slate-50 border-slate-100 font-bold"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 flex gap-3">
                  <AlertCircle className="text-red-500 shrink-0" size={18} />
                  <p className="text-xs font-bold text-red-700">{error}</p>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-sm font-black tracking-widest uppercase shadow-xl shadow-blue-100 group">
                {loading ? "KAYDEDİLİYOR..." : "ŞİFREYİ KAYDET"}
                <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
