"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?redirect=/admin");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "admin") {
        setStatus("ok");
      } else {
        setStatus("denied");
      }
    }
    check();
  }, [router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-5xl">🚫</div>
        <h1 className="text-2xl font-black text-slate-800">Erişim Reddedildi</h1>
        <p className="text-slate-500">Bu sayfayı görüntülemek için admin yetkisine ihtiyacınız var.</p>
        <p className="text-xs text-slate-400 mt-2">
          Supabase'de: <code className="bg-slate-100 px-2 py-0.5 rounded">UPDATE profiles SET role = 'admin' WHERE email = 'sizin@email.com';</code>
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm"
        >
          Ana Sayfaya Dön
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
