import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { issueEmailVerification } from "@/lib/email-verify";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * E-postamı düzelt — kayıt sırasında yanlış yazılan adresi düzeltir.
 * GoTrue kullanıcı e-postasını günceller (email_confirm:true → giriş çalışır),
 * profiles.email güncellenir, bayrak sıfırlanır ve YENİ adrese onay maili gider.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const newEmail = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Başka bir üye bu e-postayı kullanıyor mu?
  const { data: clash } = await (supabase as any)
    .from("profiles").select("id").ilike("email", newEmail).neq("id", user.id).maybeSingle();
  if (clash) return NextResponse.json({ error: "Bu e-posta başka bir hesapta kayıtlı." }, { status: 409 });

  // GoTrue kullanıcısını güncelle (anında onaylı — giriş kesilmesin)
  const { error: upErr } = await supabase.auth.admin.updateUserById(user.id, {
    email: newEmail, email_confirm: true,
  } as any);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: p } = await (supabase as any)
    .from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
  await (supabase as any).from("profiles").update({ email: newEmail }).eq("id", user.id);

  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ");
  const mail = await issueEmailVerification(user.id, newEmail, name);
  return NextResponse.json({ ok: true, emailStatus: mail.status });
}
