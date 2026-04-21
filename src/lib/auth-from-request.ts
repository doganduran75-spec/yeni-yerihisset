import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Browser client localStorage'a yazar, cookie okumak işe yaramaz.
 * Client, Authorization: Bearer <token> header gönderir; burada doğrularız.
 */
export async function getAuthUserFromRequest(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user } } = await createAdminClient().auth.getUser(token);
  return user ?? null;
}
