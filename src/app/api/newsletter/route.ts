import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { botVerdict, botResponse } from "@/lib/bot-guard";
import { marketingEligible } from "@/lib/marketing-mail";
import { newsletterMessage, sendNewsletterWelcome, type NewsletterResult } from "@/lib/newsletter";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Bülten kaydı — footer formundan. E-postayı contacts'a 'newsletter' kanalı
// olarak ekler (service role; RLS admin-only). Aynı e-posta varsa tekrar eklemez.
// 2026-11-12: zaten izinliyse "zaten listemizde" (e-posta gitmez); yeni / geri dönen aboneye hoş geldin e-postası;
// kampanya iznini açıkça kapatmış üyeye Hesabım yönlendirmesi (bülten formu üyenin kararını ezmez).
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

  // Bülten = kampanya e-postasına açık izin (src/lib/marketing-mail.ts); tekrar abone olan çıkışını geri alır
  const consent = { marketing_consent: true, marketing_consent_at: new Date().toISOString(), marketing_opt_out_at: null };
  const { data: existing } = await supabase.from("contacts").select("id").eq("email", email).maybeSingle();
  let contactId: string | null = existing?.id ?? null;
  if (contactId) {
    await supabase.from("contacts").update(consent).eq("id", contactId);
  } else {
    const { data: ins, error } = await supabase.from("contacts")
      .insert({ email, source_channel: "newsletter", status: "lead", ...consent }).select("id").single();
    if (error?.code === "23505") return reply("already"); // aynı anda gelen ikinci istek
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    contactId = ins?.id ?? null;
  }

  if (contactId) await sendNewsletterWelcome(contactId, email).catch(() => null);
  return reply(existing ? "resubscribed" : "subscribed");
}
