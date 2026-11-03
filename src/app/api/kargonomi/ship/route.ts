/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { KargonomiError } from "@/lib/kargonomi";
import { BasitKargoError } from "@/lib/basitkargo";
import { quoteOrder, confirmOrder, cancelOrderShipment, checkOrder, activeProvider, basitReturnCode, testKargonomi } from "@/lib/kargonomi-flow";

// Siparişte "Kargoya ver" — yalnız yönetici. Sağlayıcı (Kargonomi / Basit Kargo) ayarlardan; akış src/lib/kargonomi-flow.ts:
//   op "info"        {}                     → varsayılan sağlayıcı + hazır olanlar (ikisi de hazırsa pencerede seçilir)
//   op "test"        {}                     → Kargonomi bağlantı denemesi (kayıtlı token; gönderi açmaz)
//   op "quote"       {order_id, desi, provider?} → taslak gönderi + firma teklifleri
//   op "confirm"     {order_id, provider_id}→ seçilen firma; kod (Kargonomi'de gelene kadar dakikada bir sorgulanır)
//   op "check"       {order_id}             → şimdi sorgula
//   op "cancel"      {order_id}             → taslağı sil / gönderiyi iptal et (yeniden teklif alınabilir)
//   op "return_code" {order_id}             → Basit Kargo iade kodu (teslim edilmiş gönderi)
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
  const sb = createAdminClient();
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "admin") return NextResponse.json({ error: "Admin yetkisi gerekli." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { op?: string; order_id?: string; desi?: number; provider_id?: string; provider?: string };
  if (body.op === "info") return NextResponse.json({ ok: true, ...(await activeProvider(sb)) });
  const id = String(body.order_id || "");
  if (body.op !== "test" && !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "order_id eksik" }, { status: 400 });

  try {
    switch (body.op) {
      case "test": return NextResponse.json({ ok: true, ...(await testKargonomi(sb)) });
      case "quote": return NextResponse.json({ ok: true, ...(await quoteOrder(sb, id, Number(body.desi), body.provider)) });
      case "confirm": return NextResponse.json({ ok: true, ...(await confirmOrder(sb, id, String(body.provider_id ?? ""))) });
      case "check": return NextResponse.json({ ok: true, ...(await checkOrder(sb, id)) });
      case "cancel": return NextResponse.json(await cancelOrderShipment(sb, id));
      case "return_code": return NextResponse.json({ ok: true, ...(await basitReturnCode(sb, id)) });
      default: return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
    }
  } catch (e: any) {
    const known = e instanceof KargonomiError || e instanceof BasitKargoError;
    const status = known ? (e.status >= 400 && e.status < 500 ? e.status : 502) : 500;
    return NextResponse.json({ error: e?.message || "Kargo hatası" }, { status });
  }
}
