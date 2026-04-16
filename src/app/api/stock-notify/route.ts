import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId, variantId, contact } = body as {
      productId: string;
      variantId?: string;
      contact?: string;
    };

    if (!productId) {
      return NextResponse.json({ error: "productId gerekli" }, { status: 400 });
    }

    // Kullanıcı kimliğini doğrula
    // Admin client'taki service role key, auth.getUser(userJwt) ile çakışır.
    // Bunun yerine anon client'a kullanıcının JWT'ini header olarak vererek doğruluyoruz.
    let user: any = null;

    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const anonClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        );
        const { data } = await anonClient.auth.getUser();
        user = data.user ?? null;
      } catch {
        // Token doğrulaması başarısız, devam et
      }
    }

    // Fallback: cookie tabanlı oturum
    if (!user) {
      try {
        const cookieStore = await cookies();
        const userClient = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll: () => cookieStore.getAll(),
              setAll: () => {},
            },
          }
        );
        const { data } = await userClient.auth.getUser();
        user = data.user ?? null;
      } catch {
        // Cookie auth başarısız
      }
    }

    // Misafir ise contact bilgisi zorunlu
    if (!user && !contact?.trim()) {
      return NextResponse.json(
        { error: "E-posta veya telefon gerekli" },
        { status: 400 }
      );
    }

    const trimmedContact = contact?.trim() ?? "";
    const isEmail = trimmedContact.includes("@");
    const guestEmail = isEmail ? trimmedContact.toLowerCase() : null;
    const guestPhone = !isEmail && trimmedContact ? trimmedContact : null;

    const supabase = createAdminClient();

    // Mükerrer kayıt kontrolü
    let dupQuery = supabase
      .from("stock_notifications")
      .select("id")
      .eq("product_id", productId)
      .eq("status", "pending")
      .limit(1);

    if (variantId) dupQuery = dupQuery.eq("variant_id", variantId) as any;

    if (user) {
      dupQuery = dupQuery.eq("user_id", user.id) as any;
    } else if (guestEmail) {
      dupQuery = dupQuery.eq("email", guestEmail) as any;
    } else if (guestPhone) {
      dupQuery = dupQuery.eq("phone", guestPhone) as any;
    }

    const { data: existing } = await dupQuery;
    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, alreadyRegistered: true });
    }

    // Satır oluştur
    const row: Record<string, any> = {
      product_id: productId,
      variant_id: variantId ?? null,
      status: "pending",
    };

    if (user) {
      row.user_id = user.id;
      if (user.email) row.email = user.email;
    } else {
      if (guestEmail) row.email = guestEmail;
      if (guestPhone) row.phone = guestPhone;
    }

    const { error: insertError } = await supabase
      .from("stock_notifications")
      .insert(row);

    if (insertError) {
      console.error("stock_notify insert error:", insertError);
      return NextResponse.json(
        { error: "Kayıt başarısız", detail: insertError.message, code: insertError.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("stock_notify unexpected error:", err);
    return NextResponse.json(
      { error: "Sunucu hatası", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
