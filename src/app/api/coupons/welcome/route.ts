import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { assignSignupCoupons } from "@/lib/member-status";

/**
 * Yeni üye kaydolduğunda çağrılır (kayıt akışından, fire-and-forget).
 * Hoş geldin kuponları artık E-POSTA DOĞRULANINCA atanır (src/lib/member-status.ts);
 * kayıt anında üye henüz doğrulanmamış olduğundan burada genelde "bekleniyor" döner,
 * kuponlar doğrulama bağlantısına tıklanınca gelir (/api/auth/verify-email, /api/auth/mark-verified).
 * Oturum gerektirmez; kötüye kullanımı sınırlamak için yalnızca SON 10 DAKİKADA oluşturulmuş kullanıcılar.
 */
export async function POST(req: NextRequest) {
  const { userId } = (await req.json()) as { userId?: string };
  if (!userId) return NextResponse.json({ error: "userId zorunlu" }, { status: 400 });

  const { data: authData } = await createAdminClient().auth.admin.getUserById(userId);
  const u = authData?.user;
  if (!u) return NextResponse.json({ skipped: true, reason: "kullanıcı yok" });
  if (Date.now() - new Date(u.created_at).getTime() > 10 * 60 * 1000) {
    return NextResponse.json({ skipped: true, reason: "yeni kayıt değil" });
  }
  const r = await assignSignupCoupons(userId);
  return NextResponse.json({ ok: true, atanan: r.assigned, epostaGonderilen: r.emailed, ...(r.skipped ? { bekleniyor: r.skipped } : {}) });
}
