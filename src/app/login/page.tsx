"use client";

import { useState, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { 
  User, 
  Lock, 
  Mail, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  EyeOff,
  Apple
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold text-blue-600">Yükleniyor...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  
  const [isLogin, setIsLogin] = useState(true);
  const [forgot, setForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // Kayıt sonrası e-posta doğrulama kutusu
  const [pendingVerify, setPendingVerify] = useState<string | null>(null); // gönderilen e-posta
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [editEmail, setEditEmail] = useState<string | null>(null); // düzeltme inputu (açıksa değer)
  const [savingEmail, setSavingEmail] = useState(false);

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }
  async function resendVerification() {
    setResending(true); setVerifyNote(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) } });
      const d = await res.json().catch(() => ({}));
      setVerifyNote(res.ok ? "Onay e-postası yeniden gönderildi." : (d?.error || "Gönderilemedi."));
    } finally { setResending(false); }
  }
  async function saveNewEmail() {
    if (!editEmail) return;
    setSavingEmail(true); setVerifyNote(null);
    try {
      const res = await fetch("/api/auth/change-email", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ email: editEmail.trim().toLowerCase() }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setPendingVerify(editEmail.trim().toLowerCase()); setEditEmail(null); setVerifyNote("E-posta güncellendi, yeni adrese onay bağlantısı gönderildi."); }
      else setVerifyNote(d?.error || "Güncellenemedi.");
    } finally { setSavingEmail(false); }
  }

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: ""
  });

  // Sosyal giriş yalnızca ilgili sağlayıcı GoTrue'da etkinse gösterilir.
  // NEXT_PUBLIC_SOCIAL_LOGIN="google" veya "google,apple" (varsayılan: gizli).
  const socialFlag = (process.env.NEXT_PUBLIC_SOCIAL_LOGIN || "").toLowerCase();
  const showGoogle = socialFlag.includes("google");
  const showApple = socialFlag.includes("apple");
  const anySocial = showGoogle || showApple;

  async function handleSocialLogin(provider: 'google' | 'apple') {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (forgot) {
        // Şifre sıfırlama bağlantısı gönder — uygulama SMTP'si üzerinden
        // (GoTrue'nun kendi SMTP'sine bağımlı değil). Route daima generic
        // başarı döner (e-posta varlık sızdırma yok).
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: formData.email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "İstek gönderilemedi.");
        setSuccess("Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Lütfen gelen kutunuzu (ve spam) kontrol edin.");
        return;
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;
        router.push(redirect);
      } else {
        // Üyelik sunucu tarafında (admin.createUser, anında onaylı) — GoTrue
        // confirmation e-postasına (bozuk self-host SMTP) bağımlı değil.
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            firstName: formData.firstName,
            lastName: formData.lastName,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Kayıt oluşturulamadı.");

        // Anında giriş yap
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (signInErr) {
          // Kullanıcı oluştu ama giriş olmadıysa, giriş ekranına al
          setSuccess("Kayıt başarılı! Giriş yapabilirsiniz.");
          setIsLogin(true);
        } else {
          // Karşılama kuponlarını hesabına ekle (fire-and-forget)
          if (data.userId) {
            fetch("/api/coupons/welcome", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: data.userId }),
            }).catch(() => {});
          }
          // Onay kutusunu göster (hesap aktif; alışverişe devam edilebilir)
          setPendingVerify(formData.email);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4">
      <Link href="/" className="mb-8 text-3xl font-black tracking-tighter text-blue-600 flex items-center gap-2">
        <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
           Y
        </div>
        Yeri<span className="text-slate-900">Hisset</span>
      </Link>

      <Card className="w-full max-w-md border-none shadow-2xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
        <div className="flex border-b">
          <button
            onClick={() => { setIsLogin(true); setForgot(false); setError(null); }}
            className={cn(
              "flex-1 py-5 text-sm font-black transition-all",
              isLogin && !forgot ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/30" : "text-slate-400 hover:text-slate-600"
            )}
          >
            GİRİŞ YAP
          </button>
          <button
            onClick={() => { setIsLogin(false); setForgot(false); setError(null); }}
            className={cn(
              "flex-1 py-5 text-sm font-black transition-all",
              !isLogin && !forgot ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/30" : "text-slate-400 hover:text-slate-600"
            )}
          >
            KAYIT OL
          </button>
        </div>

        <CardContent className="p-8 md:p-10">
          {pendingVerify ? (
            <div className="space-y-5 animate-in fade-in">
              <div className="text-center space-y-2">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-olive-50 flex items-center justify-center">
                  <Mail className="text-olive-600" size={26} />
                </div>
                <h2 className="text-xl font-black text-slate-900">Hesabın hazır! 🎉</h2>
                <p className="text-sm text-slate-500">
                  <b className="text-slate-700">{pendingVerify}</b> adresine onay bağlantısı gönderdik.
                  Onaylamak zorunda değilsin — dilediğin zaman tıklayabilirsin.
                </p>
              </div>

              {verifyNote && (
                <p className="text-xs font-bold text-center text-olive-700 bg-olive-50 border border-olive-100 rounded-lg px-3 py-2">{verifyNote}</p>
              )}

              {editEmail !== null ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">DOĞRU E-POSTA</label>
                  <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="dogru@mail.com" className="h-12 rounded-xl" />
                  <div className="flex gap-2">
                    <Button type="button" onClick={saveNewEmail} disabled={savingEmail} className="flex-1 h-11 rounded-xl bg-olive-600 hover:bg-olive-700">
                      {savingEmail ? "Kaydediliyor…" : "Kaydet ve Gönder"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditEmail(null)} className="h-11 rounded-xl">Vazgeç</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <Button type="button" onClick={() => router.push(redirect)} className="w-full h-12 rounded-xl bg-olive-600 hover:bg-olive-700 text-sm font-black tracking-wide">
                    Alışverişe Devam Et
                  </Button>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={resendVerification} disabled={resending} className="flex-1 h-11 rounded-xl text-xs font-bold">
                      {resending ? "Gönderiliyor…" : "Tekrar Gönder"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditEmail(pendingVerify)} className="flex-1 h-11 rounded-xl text-xs font-bold">
                      E-postamı Düzelt
                    </Button>
                  </div>
                  <p className="text-[11px] text-center text-slate-400">Onay mailini bulamadıysan spam klasörüne de bak.</p>
                </div>
              )}
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">AD</label>
                  <Input 
                    required 
                    placeholder="Ad" 
                    value={formData.firstName}
                    onChange={e => setFormData({...formData, firstName: e.target.value})}
                    className="h-12 rounded-xl bg-slate-50 border-slate-100 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">SOYAD</label>
                  <Input 
                    required 
                    placeholder="Soyad" 
                    value={formData.lastName}
                    onChange={e => setFormData({...formData, lastName: e.target.value})}
                    className="h-12 rounded-xl bg-slate-50 border-slate-100 font-bold"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">E-POSTA</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input 
                  type="email" 
                  required 
                  placeholder="name@example.com" 
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="h-12 pl-12 rounded-xl bg-slate-50 border-slate-100 font-bold"
                />
              </div>
            </div>

            {!forgot && (
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">ŞİFRE</label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => { setForgot(true); setError(null); setSuccess(null); }}
                    className="text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    Şifremi Unuttum
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="h-12 pl-12 pr-12 rounded-xl bg-slate-50 border-slate-100 font-bold"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            )}

            {forgot && (
              <p className="text-xs text-slate-500 -mt-2">
                Kayıtlı e-postanı gir; şifre belirleme bağlantısı gönderelim.{" "}
                <button
                  type="button"
                  onClick={() => { setForgot(false); setError(null); setSuccess(null); }}
                  className="font-bold text-blue-600 hover:underline"
                >
                  ← Girişe dön
                </button>
              </p>
            )}

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 flex gap-3 animate-in shake">
                 <AlertCircle className="text-red-500 shrink-0" size={18} />
                 <p className="text-xs font-bold text-red-700">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border-l-4 border-green-500 p-4 flex gap-3 animate-in zoom-in">
                 <CheckCircle2 className="text-green-500 shrink-0" size={18} />
                 <p className="text-xs font-bold text-green-700">{success}</p>
              </div>
            )}

            <Button 
              type="submit" 
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-sm font-black tracking-widest uppercase shadow-xl shadow-blue-100 group transition-all"
            >
              {loading ? "İŞLEM YAPILIYOR..." : forgot ? "SIFIRLAMA BAĞLANTISI GÖNDER" : (isLogin ? "GİRİŞ YAP" : "HESAP OLUŞTUR")}
              <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>

            {!forgot && anySocial && (
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100"></span>
              </div>
              <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
                <span className="bg-white px-4 text-slate-400">VEYA</span>
              </div>
            </div>
            )}

            {anySocial && (
            <div className={cn("grid gap-4", showGoogle && showApple ? "grid-cols-2" : "grid-cols-1", forgot && "hidden")}>
              {showGoogle && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSocialLogin('google')}
                disabled={loading}
                className="h-12 rounded-xl border-slate-100 font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.26 1.07-3.71 1.07-2.87 0-5.3-1.94-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.83z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.86-2.59 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </Button>
              )}
              {showApple && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSocialLogin('apple')}
                disabled={loading}
                className="h-12 rounded-xl border-slate-100 font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <Apple size={18} fill="black" />
                Apple
              </Button>
              )}
            </div>
            )}

            <div className="pt-4 text-center">
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                  Giriş yaparak Kullanım Koşulları ve <br/> Gizlilik Politikası'nı kabul etmiş sayılırsınız.
               </p>
            </div>
          </form>
          )}
        </CardContent>
      </Card>

      <footer className="mt-12 text-slate-400 text-xs font-bold">
        © {new Date().getFullYear()} YeriHisset. Tüm hakları saklıdır.
      </footer>
    </div>
  );
}
