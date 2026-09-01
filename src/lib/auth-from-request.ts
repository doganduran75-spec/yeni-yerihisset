import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Browser client localStorage'a yazar, cookie okumak işe yaramaz.
 * Client, Authorization: Bearer <token> header gönderir; burada doğrularız.
 */
export async function getAuthUserFromRequest(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    console.warn("[auth-from-request] Authorization header/token yok");
    return null;
  }
  try {
    const { data: { user }, error } = await createAdminClient().auth.getUser(token);
    if (error) console.warn("[auth-from-request] getUser hata:", error.message);
    return user ?? null;
  } catch (e) {
    console.error("[auth-from-request] getUser istisna:", e);
    return null;
  }
}
