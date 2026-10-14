/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { reviewContext, submitReview } from "@/lib/review-winback";
import { botResponse, botVerdict } from "@/lib/bot-guard";
import { clientIp } from "@/lib/rate-limit";

// Yorum isteme e-postasındaki bağlantı (/yorum?t=…): giriş gerekmez, kişiye özel bağlantı (src/lib/review-winback.ts)
//   GET ?t=…  → sorular + ürünler (kişisel bilgi yalnız ad)
//   POST {t, overall, answers, comment} → yorum (yönetici onayı bekler)
export async function GET(req: NextRequest) {
  const ctx = await reviewContext(createAdminClient(), String(req.nextUrl.searchParams.get("t") || ""));
  if (!ctx) return NextResponse.json({ error: "Bağlantı geçersiz ya da süresi dolmuş." }, { status: 404 });
  return NextResponse.json({ ok: true, firstName: ctx.firstName, items: ctx.items, questions: ctx.questions, done: ctx.done });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as any;
  const blocked = botResponse("review", botVerdict(body, { minMs: 2500 }), clientIp(req));
  if (blocked) return blocked;
  const r = await submitReview(createAdminClient(), String(body.t || ""), {
    overall: Number(body.overall), answers: body.answers && typeof body.answers === "object" ? body.answers : {}, comment: body.comment,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
