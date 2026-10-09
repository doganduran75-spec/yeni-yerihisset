import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { setMarketingConsent, verifyConsentToken } from "@/lib/marketing-consent";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Kampanya e-postası izni — ver / geri al / durumu oku.
//   GET  ?t=<token>                 → { granted, email (maskeli) }   (e-postadaki bağlantı sayfası)
//   POST { granted, t? }            → t varsa e-posta bağlantısıyla (giriş gerekmez), yoksa oturumdaki üye
const mask = (e?: string | null) => {
  if (!e) return null;
  const [u, d] = e.split("@");
  return d ? `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}` : null;
};

async function resolveUser(req: NextRequest, token?: string | null): Promise<{ userId: string | null; viaLink: boolean }> {
  if (token) return { userId: verifyConsentToken(token), viaLink: true };
  const user = await getAuthUserFromRequest(req);
  return { userId: user?.id ?? null, viaLink: false };
}

export async function GET(req: NextRequest) {
  if (rateLimited("marketing-consent", clientIp(req), 60, 600000)) return NextResponse.json(TOO_MANY, { status: 429 });
  const { userId } = await resolveUser(req, new URL(req.url).searchParams.get("t"));
  if (!userId) return NextResponse.json({ error: "Bağlantı geçersiz" }, { status: 400 });
  const { data: p } = await (createAdminClient() as any).from("profiles").select("email, marketing_consent").eq("id", userId).maybeSingle();
  if (!p) return NextResponse.json({ error: "Bağlantı geçersiz" }, { status: 400 });
  return NextResponse.json({ ok: true, granted: !!p.marketing_consent, email: mask(p.email) });
}

export async function POST(req: NextRequest) {
  if (rateLimited("marketing-consent", clientIp(req), 60, 600000)) return NextResponse.json(TOO_MANY, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { granted?: unknown; t?: string };
  if (typeof body.granted !== "boolean") return NextResponse.json({ error: "granted gerekli" }, { status: 400 });
  const { userId, viaLink } = await resolveUser(req, body.t);
  if (!userId) return NextResponse.json({ error: viaLink ? "Bağlantı geçersiz" : "Giriş yapmalısınız" }, { status: viaLink ? 400 : 401 });
  const r = await setMarketingConsent(userId, body.granted, viaLink ? "email_link" : "account");
  if (!r.ok) return NextResponse.json({ error: "Kaydedilemedi" }, { status: 500 });
  return NextResponse.json({ ok: true, granted: body.granted });
}
