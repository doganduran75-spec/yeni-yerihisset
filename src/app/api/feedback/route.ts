import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * "Aradığını bulamadın mı?" geri bildirim/talep kutusu.
 * Ziyaretçi e-posta (opsiyonel) + not bırakır. Service role ile eklenir.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase() || null;
  const message = String(body.message || "").trim();
  const source = String(body.source || "products").slice(0, 40);

  if (!message) return NextResponse.json({ error: "Lütfen ne aradığını yaz." }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: "Not çok uzun." }, { status: 400 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin (ya da boş bırak)." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("feedback").insert({ email, message, source } as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
