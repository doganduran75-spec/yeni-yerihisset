import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { botVerdict, botResponse } from "@/lib/bot-guard";
import { marketingEligible } from "@/lib/marketing-mail";
import { newsletterMessage, sendNewsletterConfirm, type NewsletterResult } from "@/lib/newsletter";
import { formMailAllowed } from "@/lib/form-mail-quota";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Bülten kaydı — footer formundan. ÇİFT ONAY (güvenlik 2026-11-16): form izni YAZMAZ; kişi kaydını (contacts,
// 'newsletter' kanalı) izinsiz açar ve adrese "aboneliğini onayla" e-postası gönderir. İzin + hoş geldin e-postası,
// kişi e-postadaki imzalı bağlantıda "Evet"e basınca (/api/marketing-consent). Böylece başkasının adresi yazılınca o
// kişi "izin verdi" sayılmaz, abonelikten çıkmış biri onun haberi olmadan yeniden abone edilemez.
// Zaten izinliyse "zaten listemizde" (e-posta gitmez); kampanya iznini açıkça kapatmış üyeye Hesabım yönlendirmesi.
// Aynı adrese son 24 saatte en fazla 3 form e-postası (src/lib/form-mail-quota.ts) — sınır dolsa da cevap aynı.
export async function POST(req: NextRequest) {
  // Toplu kötüye kullanıma karşı IP başına sınır
  if (rateLimited("newsletter", clientIp(req), 5, 3600000)) return NextResponse.json(TOO_MANY, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const blocked = botResponse("newsletter", botVerdict(body), clientIp(req));
  if (blocked) return blocked;
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  const supabase = createAdminClient() as any;
  const reply = (result: NewsletterResult) => NextResponse.json({ ok: true, result, already: result === "already", message: newsletterMessage(result) });

  // Zaten kampanya e-postası alıyor (üye izni ya da bülten kaydı) → bir şey değişmez, e-posta gitmez
  if ((await marketingEligible(supabase, [email])).has(email)) return reply("already");

  // Üye izni açıkça kapatmış → bülten formu bunu ezmesin (izin Hesabım'dan)
  const { data: prof } = await supabase.from("profiles").select("id, marketing_consent, marketing_consent_at").eq("email", email).maybeSingle();
  if (prof && !prof.marketing_consent && prof.marketing_consent_at) return reply("member_opted_out");

  // Kişi kaydı (izin DEĞİŞMEZ — çıkmış kişinin çıkışı da korunur); onay e-postası
  const { data: existing } = await supabase.from("contacts").select("id").eq("email", email).maybeSingle();
  let contactId: string | null = existing?.id ?? null;
  if (!contactId) {
    if (!(await formMailAllowed(supabase, email, "newsletter"))) return reply("confirm_sent"); // sınır doldu: kayıt da açılmaz
    const { data: ins, error } = await supabase.from("contacts")
      .insert({ email, source_channel: "newsletter", status: "lead", marketing_consent: false }).select("id").single();
    if (error?.code === "23505") return reply("confirm_sent"); // aynı anda gelen ikinci istek
    if (error) { console.error("[newsletter]", error.message); return NextResponse.json({ error: "Kaydedilemedi, lütfen biraz sonra tekrar dene." }, { status: 500 }); }
    contactId = ins?.id ?? null;
  } else if (!(await formMailAllowed(supabase, email, "newsletter"))) {
    return reply("confirm_sent");
  }
  if (contactId) await sendNewsletterConfirm(contactId, email).catch(() => null);
  return reply("confirm_sent");
}
