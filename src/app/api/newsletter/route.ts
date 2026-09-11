import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Bülten kaydı — footer formundan. E-postayı contacts'a 'newsletter' kanalı
// olarak ekler (service role; RLS admin-only). Aynı e-posta varsa tekrar eklemez.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing } = await (supabase as any)
    .from("contacts").select("id").eq("email", email).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, already: true });

  const { error } = await (supabase as any)
    .from("contacts").insert({ email, source_channel: "newsletter", status: "lead" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
