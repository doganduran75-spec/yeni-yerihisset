/* eslint-disable @typescript-eslint/no-explicit-any */
// Paraşüt bildirimi (webhook) — "gelen e-fatura" (inbound_e_invoice / create). Panelde Gelen e-faturalar › "Bildirimi aç"
// ile Paraşüt'e kurulur; her istekte X-Client-Key = parasut_auth.webhook_key (sabit zamanlı karşılaştırma).
// Hızlı 200 döner; Paraşüt 5xx / zaman aşımında ~4-5 saat yeniden dener, aynı fatura iki kez gelirse tek kayıt.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { handleWebhook } from "@/lib/parasut-inbound";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-client-key") || "";
  const body = (await req.json().catch(() => null)) as any;
  try {
    const r = await handleWebhook(createAdminClient(), key, body);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e: any) {
    console.error("[parasut/webhook]", e?.message || e);
    return NextResponse.json({ error: "işlenemedi" }, { status: 500 }); // Paraşüt yeniden dener
  }
}
