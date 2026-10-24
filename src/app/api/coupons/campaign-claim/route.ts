/* eslint-disable @typescript-eslint/no-explicit-any */
// "KUPONU HESABINA EKLE" — kampanya bağlantısından (/kampanya/<slug>) gelen ziyaretçi.
//   POST { slug }            (üye, Bearer)  → kupon hesabına eklenir
//   POST { slug, email, … }  (misafir)      → e-postanın hesabına eklenir; hesap yoksa ŞİFRESİZ açılır ve şifre
//                                             belirleme bağlantısı gider; şifreli üyeye "giriş yap" e-postası gider.
// Kupon süresi hesaba eklendiği andan (coupons.claim_valid_days); tekrar eklemede süre uzamaz.
// Herkese açık form → useBotTrap + botResponse + IP sınırı (form-spam koruması).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { botVerdict, botResponse } from "@/lib/bot-guard";
import { sendClaimEmail } from "@/lib/crm-campaign";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as any;
  const slug = String(body.slug || "").trim().slice(0, 80);
  if (!slug) return NextResponse.json({ error: "Kampanya bulunamadı" }, { status: 400 });
  const sb = createAdminClient() as any;
  const user = await getAuthUserFromRequest(req);

  const { data: coupon } = await sb.from("coupons").select("id, name, type, amount, min_order_amount, expires_at, claim_valid_days, max_uses, used_count")
    .eq("campaign_slug", slug).eq("is_active", true).eq("is_personal", false).maybeSingle();
  if (!coupon || (coupon.expires_at && new Date(coupon.expires_at) < new Date()))
    return NextResponse.json({ error: "Bu kampanya sona ermiş" }, { status: 404 });
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses)
    return NextResponse.json({ error: "Bu kampanyanın kuponları tükendi" }, { status: 400 });

  const grant = async (userId: string) => {
    const days = Number(coupon.claim_valid_days || 0);
    let expires: string | null = days ? new Date(Date.now() + days * 86400_000).toISOString() : null;
    if (expires && coupon.expires_at && new Date(coupon.expires_at) < new Date(expires)) expires = coupon.expires_at; // kampanya bitişini geçmez
    const { data: had } = await sb.from("user_coupons").select("id").eq("user_id", userId).eq("coupon_id", coupon.id).maybeSingle();
    if (had) return { added: false, expires };
    await sb.from("user_coupons").insert({ user_id: userId, coupon_id: coupon.id, use_count: 0, expires_at: expires });
    return { added: true, expires };
  };

  // Üye: doğrudan
  if (user) {
    const g = await grant(user.id);
    return NextResponse.json({ ok: true, status: g.added ? "added" : "already" });
  }

  // Misafir: e-posta
  const ip = clientIp(req);
  if (rateLimited("campaign-claim", ip, 6, 3600000)) return NextResponse.json(TOO_MANY, { status: 429 });
  const blocked = botResponse("campaign-claim", botVerdict(body, { minMs: 1500 }), ip, { ok: true, status: "email" });
  if (blocked) return blocked;
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Geçerli bir e-posta yaz." }, { status: 400 });
  const storeUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");

  const setPasswordUrl = async () => {
    const { data: link } = await sb.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${storeUrl}/sifre-belirle` } });
    const h = link?.properties?.hashed_token;
    return h ? `${storeUrl}/sifre-belirle?token_hash=${h}&type=recovery&kampanya=1` : `${storeUrl}/login`;
  };

  let userId: string | null = null;
  let mode: "created" | "passwordless" | "member" = "member";
  const { data: prof } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
  if (prof?.id) {
    userId = prof.id;
    const { data: state } = await sb.rpc("account_password_state", { p_email: email });
    mode = state === "passwordless" ? "passwordless" : "member";
  } else {
    const { data: created, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
    if (error || !created?.user?.id) return NextResponse.json({ error: "Hesap açılamadı, biraz sonra tekrar dener misin?" }, { status: 500 });
    userId = created.user.id;
    await sb.rpc("mark_account_passwordless", { p_user: userId }); // Auth'un koyduğu rastgele şifreyi sil
    await sb.from("profiles").upsert({ id: userId, email }, { onConflict: "id", ignoreDuplicates: true });
    mode = "created";
  }
  const g = await grant(userId!);
  // Sonuç her durumda aynı görünür (e-postanın kayıtlı olup olmadığı dışarıya sızmaz): "e-postana gönderdik"
  sendClaimEmail({
    to: email, coupon, expires: g.expires || coupon.expires_at, added: g.added,
    actionUrl: mode === "member" ? `${storeUrl}/login?redirect=/sepet` : await setPasswordUrl(), mode,
  }).catch(() => {});
  return NextResponse.json({ ok: true, status: "email" });
}
