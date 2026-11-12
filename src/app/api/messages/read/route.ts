import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// MÜŞTERİ MESAJI OKUDU (2026-11-12): Hesabım › Mesaj rozeti okuduktan / yeniledikten sonra da "1" kalıyordu — istemci
// messages tablosunu güncelleyemiyor (müşteriye UPDATE izni yok; açmak mesaj içeriğini de değiştirilebilir yapardı).
// Sunucu yalnız girişli kullanıcının, o siparişteki YÖNETİCİ mesajlarını okundu yapar. Kullanım: OrderMessagesModal
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const orderId = String(body.orderId || "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });

  const sb = createAdminClient() as any;
  const { data, error } = await sb.from("messages").update({ is_read: true })
    .eq("order_id", orderId).eq("user_id", user.id).eq("sender_role", "admin").eq("is_read", false)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, read: (data || []).length });
}
