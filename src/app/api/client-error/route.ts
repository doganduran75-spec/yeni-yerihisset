import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { rateLimited, clientIp } from "@/lib/rate-limit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Müşterinin karşılaştığı hatayı kaydet (pano › Sistem › "Hata alan müşteriler").
// Kişisel veri YOK: tür, kısa mesaj, sayfa yolu; oturum varsa üye kimliği. Çerez onayından bağımsızdır
// (hizmetin çalışması için gerekli hata kaydı). Kötüye kullanıma karşı IP başına sınırlı, sessiz.
const KINDS = new Set(["checkout", "stock", "after_sale", "other"]);

export async function POST(req: NextRequest) {
  if (rateLimited("client-error", clientIp(req), 30, 600000)) return NextResponse.json({ ok: true });
  const body = (await req.json().catch(() => ({}))) as any;
  const kind = KINDS.has(body?.kind) ? body.kind : "other";
  const message = String(body?.message || "").replace(/\s+/g, " ").slice(0, 300) || null;
  const path = String(body?.path || "").slice(0, 120) || null;
  const orderId = /^[0-9a-f-]{36}$/i.test(String(body?.orderId || "")) ? body.orderId : null;
  const user = await getAuthUserFromRequest(req).catch(() => null);
  await (createAdminClient() as any).from("client_errors").insert({ kind, message, path, user_id: user?.id ?? null, order_id: orderId });
  return NextResponse.json({ ok: true });
}
