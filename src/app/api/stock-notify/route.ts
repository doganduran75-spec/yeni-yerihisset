import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendStockNotifySignupWelcome } from "@/lib/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

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

      // #9 — Misafir kaydını Kişiler'e (contacts) ekle/bağla → Üyeler & Kişiler
      // ekranında "Henüz üye değil" olarak görünsün. Mükerrer önleme:
      // e-posta (ilike) ya da telefon ile mevcut kişiyi bul, yoksa oluştur.
      try {
        let existingContact: { id: string; source_channel: string | null } | null = null;
        if (guestEmail) {
          const { data } = await supabase.from("contacts").select("id, source_channel").ilike("email", guestEmail).limit(1).maybeSingle();
          existingContact = (data as any) ?? null;
        }
        if (!existingContact && guestPhone) {
          const { data } = await supabase.from("contacts").select("id, source_channel").eq("phone", guestPhone).limit(1).maybeSingle();
          existingContact = (data as any) ?? null;
        }

        if (existingContact) {
          row.contact_id = existingContact.id;
        } else {
          const { data: created } = await supabase
            .from("contacts")
            .insert({
              email: guestEmail,
              phone: guestPhone,
              source_channel: "stock_notify",
              status: "lead",
            } as any)
            .select("id")
            .single();
          if (created?.id) row.contact_id = created.id;
        }
      } catch (e) {
        console.error("stock_notify contact upsert error:", e);
        // kişi oluşturulamasa da bildirim kaydı devam etsin
      }
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

    // #10 — Kayıt onay e-postası (ürün fotosu + barefoot tanıtımı). Yalnız
    // e-posta varsa ve YENİ kayıtta. Ürün + varyant bilgisini çek.
    const toEmail: string | null = (user?.email as string) || guestEmail || null;
    if (toEmail) {
      try {
        const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
        const { data: product } = await supabase
          .from("products")
          .select("title, slug, image_url, images")
          .eq("id", productId)
          .maybeSingle();
        let variantLabel: string | null = null;
        if (variantId) {
          const { data: v } = await supabase
            .from("product_variants")
            .select("variant_options(value, variant_groups(name))")
            .eq("id", variantId)
            .maybeSingle();
          const val = (v as any)?.variant_options?.value;
          const gn = (v as any)?.variant_options?.variant_groups?.name;
          variantLabel = val ? (gn ? `${gn}: ${val}` : val) : null;
        }
        const productTitle = (product as any)?.title ?? "Ürün";
        const productImage = (product as any)?.image_url || (product as any)?.images?.[0] || null;
        const productUrl = (product as any)?.slug ? `${storeUrl}/products/${(product as any).slug}` : storeUrl;
        // fire-and-forget — mail hatası kaydı bozmasın
        sendStockNotifySignupWelcome({ to: toEmail, name: null, productTitle, productUrl, productImage, variantLabel })
          .catch((e) => console.error("stock_notify welcome email:", e));
      } catch (e) {
        console.error("stock_notify welcome email prep error:", e);
      }
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
