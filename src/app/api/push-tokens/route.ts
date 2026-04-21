import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

export async function POST(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const { token, platform } = await request.json();
  if (!token) return Response.json({ error: "Token zorunlu" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("push_tokens")
    .upsert({ user_id: user.id, token, platform }, { onConflict: "user_id,token" });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const { token } = await request.json();
  if (!token) return Response.json({ error: "Token zorunlu" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("push_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("token", token);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
