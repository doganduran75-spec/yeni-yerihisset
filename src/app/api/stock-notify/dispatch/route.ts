import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { sendBackInStockNotification } from "@/lib/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Stok gelince: bir ürün/varyantı bekleyen (pending) e-postalı kişilere
 * otomatik "stok geldi" maili gönderir ve onları 'notified' işaretler.
 * E-postasızlar (Instagram/telefon) pending kalır → elden bilgilendirilir.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { productId, variantId } = (await req.json()) as { productId?: string; variantId?: string | null };
  if (!productId) return NextResponse.json({ error: "productId zorunlu" }, { status: 400 });

  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

  // Ürün bilgisi (başlık + link)
  const { data: product } = await (supabase as any).from("products").select("title, slug").eq("id", productId).maybeSingle();
  const productTitle = product?.title ?? "Ürün";
  const productUrl = product?.slug ? `${storeUrl}/products/${product.slug}` : storeUrl;

  // Bekleyen kayıtlar
  let q = (supabase as any).from("stock_notifications")
    .select("id, email, contact_id, user_id")
    .eq("status", "pending")
    .eq("product_id", productId);
  q = variantId ? q.eq("variant_id", variantId) : q.is("variant_id", null);
  const { data: rows } = await q;
  const list = (rows as any[]) || [];

  if (list.length === 0) return NextResponse.json({ ok: true, sent: 0, manual: 0 });

  // E-posta/isim çözümle (contact veya profile'dan)
  const contactIds = [...new Set(list.filter((r) => !r.email && r.contact_id).map((r) => r.contact_id))];
  const userIds = [...new Set(list.filter((r) => !r.email && !r.contact_id && r.user_id).map((r) => r.user_id))];
  const cmap = new Map<string, any>();
  const umap = new Map<string, any>();
  if (contactIds.length) {
    const { data: cs } = await (supabase as any).from("contacts").select("id, email, full_name").in("id", contactIds);
    (cs as any[] || []).forEach((c) => cmap.set(c.id, c));
  }
  if (userIds.length) {
    const { data: ps } = await supabase.from("profiles").select("id, email, first_name, last_name").in("id", userIds);
    (ps as any[] || []).forEach((p) => umap.set(p.id, p));
  }

  let sent = 0;
  let manual = 0;
  let failed = 0;
  let firstError: string | undefined;
  const notifiedIds: string[] = [];

  for (const r of list) {
    let email: string | null = r.email ?? null;
    let name: string | null = null;
    if (!email && r.contact_id) { const c = cmap.get(r.contact_id); email = c?.email ?? null; name = c?.full_name ?? null; }
    if (!email && r.user_id) { const p = umap.get(r.user_id); email = p?.email ?? null; name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || null; }

    if (!email) { manual += 1; continue; }

    const res = await sendBackInStockNotification({ to: email, name, productTitle, productUrl });
    if (res.status === "sent") {
      sent += 1;
      notifiedIds.push(r.id);
    } else {
      failed += 1;
      if (!firstError) firstError = res.error;
      console.error("[stock-notify/dispatch] e-posta gönderilemedi:", email, res.error);
    }
  }

  // Gönderilenleri 'notified' işaretle (başarısızlar pending kalır → tekrar denenebilir)
  if (notifiedIds.length) {
    await (supabase as any).from("stock_notifications")
      .update({ status: "notified", notified_at: new Date().toISOString() })
      .in("id", notifiedIds);
  }

  return NextResponse.json({ ok: true, sent, manual, failed, error: firstError, product: productTitle });
}
