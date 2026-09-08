import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { issueEmailVerification } from "@/lib/email-verify";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Onay e-postasını yeniden gönder (giriş yapan kullanıcı kendi adresine). */
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: p } = await (supabase as any)
    .from("profiles").select("email, first_name, last_name, email_verified").eq("id", user.id).maybeSingle();

  const email = p?.email || user.email;
  if (!email) return NextResponse.json({ error: "E-posta bulunamadı" }, { status: 400 });
  if (p?.email_verified) return NextResponse.json({ ok: true, alreadyVerified: true });

  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ");
  const mail = await issueEmailVerification(user.id, email, name);
  return NextResponse.json({ ok: true, emailStatus: mail.status });
}
