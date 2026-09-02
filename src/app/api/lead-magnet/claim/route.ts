import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendLeadMagnetWelcome } from "@/lib/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Lead-magnet: e-posta karşılığı ücretsiz kargo.
 * Açık katılım → şifresiz gerçek üye oluşturulur, kupon anında hesabına eklenir,
 * markalı e-postayla şifre belirleme bağlantısı gönderilir. (F17)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const consent = body.consent === true;
  const couponCode = body.couponCode ? String(body.couponCode).trim().toUpperCase() : null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json({ error: "Devam etmek için onay kutusunu işaretleyin." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

  // Kupon (opsiyonel): koda göre bul
  let coupon: any = null;
  if (couponCode) {
    const { data } = await supabase.from("coupons").select("*").eq("code", couponCode).eq("is_active", true).maybeSingle();
    coupon = data ?? null;
  }
  const couponValue = coupon
    ? (coupon.type === "free_shipping" ? "Ücretsiz kargo"
        : coupon.type === "percentage" ? `%${coupon.amount} indirim`
        : coupon.type === "fixed" ? `₺${Number(coupon.amount).toFixed(2)} indirim` : "")
    : null;

  async function grantCoupon(userId: string) {
    if (!coupon) return;
    const { data: existing } = await supabase.from("user_coupons").select("id").eq("user_id", userId).eq("coupon_id", coupon.id).maybeSingle();
    if (!existing) {
      await supabase.from("user_coupons").insert({ user_id: userId, coupon_id: coupon.id, use_count: 0 });
    }
  }

  // Zaten üye mi?
  const { data: existingProfile } = await supabase.from("profiles").select("id, email").eq("email", email).maybeSingle();

  if (existingProfile) {
    await grantCoupon(existingProfile.id);
    sendLeadMagnetWelcome({
      to: email, name: null, couponCode: coupon?.code ?? null, couponValue,
      actionUrl: `${storeUrl}/login`, mode: "existing",
    }).catch(() => {});
    return NextResponse.json({ ok: true, status: "existing" });
  }

  // Yeni şifresiz üye oluştur
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email, email_confirm: true,
  });

  if (createErr || !created?.user) {
    // Muhtemelen auth'ta zaten var (profilsiz) → şifre belirleme linki gönder
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: "recovery", email, options: { redirectTo: `${storeUrl}/sifre-belirle` },
    } as any);
    const actionUrl = (linkData as any)?.properties?.action_link ?? `${storeUrl}/login`;
    sendLeadMagnetWelcome({ to: email, name: null, couponCode: coupon?.code ?? null, couponValue, actionUrl, mode: "existing" }).catch(() => {});
    return NextResponse.json({ ok: true, status: "existing" });
  }

  const userId = created.user.id;
  // Profil garantiye al (trigger yoksa)
  await supabase.from("profiles").upsert({ id: userId, email } as any, { onConflict: "id", ignoreDuplicates: true });
  await grantCoupon(userId);

  // Şifre belirleme bağlantısı üret
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: "recovery", email, options: { redirectTo: `${storeUrl}/sifre-belirle` },
  } as any);
  const actionUrl = (linkData as any)?.properties?.action_link ?? `${storeUrl}/sifre-belirle`;

  const emailRes = await sendLeadMagnetWelcome({
    to: email, name: null, couponCode: coupon?.code ?? null, couponValue, actionUrl, mode: "created",
  });

  return NextResponse.json({ ok: true, status: "created", emailStatus: emailRes.status });
}
