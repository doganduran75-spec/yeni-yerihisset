import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { sendLeadMagnetWelcome } from "@/lib/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Lead-magnet: e-posta karşılığı ücretsiz kargo.
 * Açık katılım → şifresiz gerçek üye oluşturulur, kupon anında hesabına eklenir,
 * markalı e-postayla şifre belirleme bağlantısı gönderilir. (F17)
 */
export async function POST(req: NextRequest) {
  // Toplu kötüye kullanıma karşı IP başına sınır
  if (rateLimited("lead-magnet", clientIp(req), 5, 3600000)) return NextResponse.json(TOO_MANY, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const consent = body.consent === true;
  // GÜVENLİK: istemcinin gönderdiği kupon kodu KULLANILMAZ (herhangi bir aktif
  // kuponu herhangi bir e-postaya tanımlatabiliyordu). Yalnız sunucuda tanımlı
  // lead-magnet kuponu verilir ve o da yalnız "ücretsiz kargo" türündeyse.
  const couponCode = (process.env.LEAD_MAGNET_COUPON || "KARGOBEDAVA").trim().toUpperCase();

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
    coupon = data && (data as any).type === "free_shipping" ? data : null;
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
    const hashedToken = (linkData as any)?.properties?.hashed_token;
    const actionUrl = hashedToken ? `${storeUrl}/sifre-belirle?token_hash=${hashedToken}&type=recovery` : `${storeUrl}/login`;
    sendLeadMagnetWelcome({ to: email, name: null, couponCode: coupon?.code ?? null, couponValue, actionUrl, mode: "existing" }).catch(() => {});
    return NextResponse.json({ ok: true, status: "existing" });
  }

  const userId = created.user.id;
  // Profil garantiye al (trigger yoksa)
  await supabase.from("profiles").upsert({ id: userId, email } as any, { onConflict: "id", ignoreDuplicates: true });
  await grantCoupon(userId);

  // Şifre belirleme bağlantısı üret — token_hash ile KENDİ domainimizde
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: "recovery", email, options: { redirectTo: `${storeUrl}/sifre-belirle` },
  } as any);
  const hashedToken = (linkData as any)?.properties?.hashed_token;
  const actionUrl = hashedToken ? `${storeUrl}/sifre-belirle?token_hash=${hashedToken}&type=recovery` : `${storeUrl}/sifre-belirle`;

  const emailRes = await sendLeadMagnetWelcome({
    to: email, name: null, couponCode: coupon?.code ?? null, couponValue, actionUrl, mode: "created",
  });

  return NextResponse.json({ ok: true, status: "created", emailStatus: emailRes.status });
}
