/* eslint-disable @typescript-eslint/no-explicit-any */
// Basit Kargo durum bildirimi (Basit Kargo paneli › Ayarlar › Webhook: "Durum değişikliği").
// Adres: /api/basitkargo/webhook?key=<gizli anahtar> — anahtar Ayarlar › Entegrasyonlar › Basit Kargo'da üretilir.
// Basit Kargo imza göndermiyor → anahtar adreste + yükteki bilgiye GÜVENİLMEZ: yalnız gönderi numarası alınır,
// gönderi Basit Kargo API'sinden yeniden okunur ve öyle işlenir (src/lib/kargonomi-flow.ts › applyBasitState).
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { getOrder } from "@/lib/basitkargo";
import { applyBasitState } from "@/lib/kargonomi-flow";

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "";
  const sb = createAdminClient() as any;
  const { data: st } = await sb.from("settings").select("basitkargo_enabled, basitkargo_api_token, basitkargo_webhook_key").order("id").limit(1).maybeSingle();
  const expected = String(st?.basitkargo_webhook_key || "");
  if (!expected || !key || !same(key, expected)) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!st?.basitkargo_api_token) return NextResponse.json({ ok: true, skipped: "token yok" });

  const body = (await req.json().catch(() => ({}))) as any;
  const bkId = String(body?.id ?? body?.orderId ?? "").trim();
  if (!bkId || bkId.length > 64) return NextResponse.json({ ok: true, skipped: "gönderi numarası yok" });
  const { data: o } = await sb.from("orders")
    .select("id, kargonomi_status, kargonomi_tracking_code").eq("kargo_api", "basitkargo").eq("kargonomi_shipment_id", bkId).maybeSingle();
  if (!o) return NextResponse.json({ ok: true, skipped: "sipariş bulunamadı" });
  try {
    const cur = await getOrder(String(st.basitkargo_api_token), bkId);
    const r = await applyBasitState(sb, o, cur);
    return NextResponse.json({ ok: true, status: r.status });
  } catch (e: any) {
    console.error("[basitkargo/webhook]", e?.message || e);
    // 200 dön: Basit Kargo'nun tekrar davranışı belgede yok; saatlik sorgu (cron) durumu yine yakalar
    return NextResponse.json({ ok: false, error: "işlenemedi" });
  }
}
