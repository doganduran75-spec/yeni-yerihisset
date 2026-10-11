// Müşterinin gördüğü hatayı yöneticinin "Sistem" ekranına bildir (src/app/api/client-error). Sessiz; asla hata fırlatmaz.
import { supabase } from "@/lib/supabase";

export async function reportClientError(kind: "checkout" | "stock" | "after_sale" | "other", message: string, orderId?: string | null) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/client-error", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ kind, message, path: window.location.pathname, orderId: orderId ?? null }),
    });
  } catch { /* kayıt kritik değil */ }
}
