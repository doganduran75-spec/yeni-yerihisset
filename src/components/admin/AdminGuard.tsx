"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2, WifiOff, RefreshCw } from "lucide-react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  const check = useCallback(async () => {
    setStatus("loading");
    try {
      // getSession, oturumu localStorage'dan okur ve gerekirse access token'ı
      // refresh token ile YENİLER — sunucuya doğrulama isteği atmaz. Sayfa
      // yenilendiğinde (refresh) getUser() gibi ağ hatası/401 yüzünden yanlışlıkla
      // login'e atmaz. Gerçek "oturum yok" durumu session === null ile ayrılır.
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const user = session?.user ?? null;
      if (!user) {
        router.replace("/login?redirect=/admin");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (profile?.role === "admin") {
        setStatus("ok");
      } else {
        // Admin değil → hiçbir detay göstermeden ana sayfaya yönlendir.
        // (Panelin varlığını/altyapıyı ifşa eden bir "erişim reddedildi" ekranı YOK.)
        router.replace("/");
      }
    } catch (err) {
      // Ağ/veritabanı erişilemezliği → sonsuz spinner yerine tekrar-dene ekranı
      console.error("[AdminGuard] yetki kontrolü başarısız:", err);
      setStatus("error");
    }
  }, [router]);

  useEffect(() => {
    check();

    // Hidrasyon race'i: bazen ilk mount'ta oturum henüz storage'dan okunmamış olur.
    // INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED olaylarında yeniden kontrol et.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        check();
      }
    });
    return () => subscription.unsubscribe();
  }, [check]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff className="text-slate-400" size={40} />
        <h1 className="text-xl font-black text-slate-800">Bağlantı kurulamadı</h1>
        <p className="text-slate-500 max-w-sm">
          Sunucuya şu an ulaşılamıyor (veritabanı uykuda veya ağ sorunu olabilir).
          Lütfen birkaç saniye sonra tekrar deneyin.
        </p>
        <button
          onClick={check}
          className="mt-2 inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm"
        >
          <RefreshCw size={16} /> Tekrar Dene
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
