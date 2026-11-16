import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// DIŞ İZLEME (UptimeRobot vb.) — kullanıcı 2026-11-16: eski sunucu bellek bitince tamamen dondu ve kimse fark etmedi.
// Sunucudaki sağlık betiği (scripts/server-health.sh) ve uyarı e-postası/Telegram aynı sunucuda çalıştığı için sunucu
// donunca SUSAR; donmayı ancak dışarıdan bakan bir izleme yakalar. Bu uç: site + veritabanı cevap veriyorsa 200 "ok",
// veritabanı 4 sn içinde cevap vermezse 503. Ayrıntı dönmez (yalnız ok / hata). /api/* staging şifre kapısının dışında,
// izleme servisi şifresiz erişir.
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const sb = createAdminClient() as any;
    const { error } = await sb.from("settings").select("id").limit(1).abortSignal(AbortSignal.timeout(4000));
    if (error) return NextResponse.json({ ok: false }, { status: 503, headers });
    return NextResponse.json({ ok: true, status: "ok" }, { headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
