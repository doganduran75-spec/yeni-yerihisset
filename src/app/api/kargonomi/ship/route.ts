/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { KargonomiError } from "@/lib/kargonomi";
import { quoteOrder, confirmOrder, cancelOrderShipment, checkOrder } from "@/lib/kargonomi-flow";

// Siparişte "Kargoya ver (Kargonomi)" — yalnız yönetici. Akış src/lib/kargonomi-flow.ts:
//   op "quote"   {order_id, desi}         → taslak gönderi + firma teklifleri
//   op "confirm" {order_id, provider_id}  → seçilen firma; kod gelene kadar dakikada bir sorgulanır
//   op "check"   {order_id}               → şimdi sorgula
//   op "cancel"  {order_id}               → taslağı sil / gönderiyi iptal et (yeniden teklif alınabilir)
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
  const sb = createAdminClient();
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "admin") return NextResponse.json({ error: "Admin yetkisi gerekli." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { op?: string; order_id?: string; desi?: number; provider_id?: string };
  const id = String(body.order_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "order_id eksik" }, { status: 400 });

  try {
    switch (body.op) {
      case "quote": return NextResponse.json({ ok: true, ...(await quoteOrder(sb, id, Number(body.desi))) });
      case "confirm": return NextResponse.json({ ok: true, ...(await confirmOrder(sb, id, String(body.provider_id ?? ""))) });
      case "check": return NextResponse.json({ ok: true, ...(await checkOrder(sb, id)) });
      case "cancel": return NextResponse.json(await cancelOrderShipment(sb, id));
      default: return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
    }
  } catch (e: any) {
    const status = e instanceof KargonomiError ? (e.status >= 400 && e.status < 500 ? e.status : 502) : 500;
    return NextResponse.json({ error: e?.message || "Kargonomi hatası" }, { status });
  }
}
