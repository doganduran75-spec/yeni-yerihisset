import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { resolveLegacy } from "@/lib/legacy-redirect";

// ESKİ WORDPRESS ADRESİ → kalıcı yönlendirme (301). Doğrudan çağrılmaz: next.config.ts rewrites eski kalıpları
// (/urun/…, /urun-kategori/…, /urun-etiketi/…, eski sayfalar, kökteki eski yazılar) içeriden buraya verir.
// Kurallar: src/lib/legacy-redirect.ts. Location site içi yol (alan adı yok → Caddy arkasında da doğru adres).
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  let target = "/";
  try {
    target = await resolveLegacy(createAdminClient(), (path || []).map((p) => { try { return decodeURIComponent(p); } catch { return p; } }));
  } catch { target = "/magaza"; } // veritabanı cevap vermezse de müşteri boş sayfaya düşmesin
  if (!target.startsWith("/") || target.startsWith("//")) target = "/";
  return new Response(null, { status: 301, headers: { Location: target, "Cache-Control": "public, max-age=3600" } });
}
