import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { syncTrendyolQuestions, answerTrendyolQuestion } from "@/lib/marketplace/trendyol-qna";

/* eslint-disable @typescript-eslint/no-explicit-any */

// PAZARYERİ SORULARI (Mesajlar › Trendyol soruları). Yalnız yönetici.
//   POST { op: "answer", id, text, force? } → cevabı Trendyol'a gönder (uyarı varsa 409 + warnings; force ile geçilir)
//   POST { op: "sync" }                      → soruları şimdi çek (normalde 5 dk'da bir cron)
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  if (body.op === "sync") {
    const r = await syncTrendyolQuestions(sb);
    return NextResponse.json({ ok: !r.errors.length, ...r, error: r.errors[0] });
  }
  if (body.op === "answer") {
    const r: any = await answerTrendyolQuestion(sb, String(body.id || ""), String(body.text || ""), user.id, body.force === true);
    if (r.error) return NextResponse.json({ error: r.error, warnings: r.warnings }, { status: r.status || 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
