import { NextRequest } from "next/server";
import { sendAdminReplyNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase-admin";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: NextRequest) {
  // 1. Yetki Kontrolü
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const userClient = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: "Yetkisiz" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return Response.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Auth hatası" }, { status: 500 });
  }

  // 2. Veri İşleme
  const body = await request.json();
  const { userId, body: replyContent } = body; // Component içinden 'body' olarak geliyor

  if (!userId || !replyContent) {
    return Response.json({ error: "userId ve mesaj içeriği zorunlu" }, { status: 400 });
  }

  // 3. Email Gönderimi (arka planda çalışabilir ama sonucunu dönüyoruz)
  const result = await sendAdminReplyNotification(userId, replyContent);

  return Response.json(result);
}
