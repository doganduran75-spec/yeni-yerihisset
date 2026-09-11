import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Dalga 4: Sepeti terk eden ÜYELERİ yakala → hatırlatma e-postası kuyruğa +
// "Sıcak Lead" etiketi. Ürünü sepete ekleyip satın almadan ayrılan, son 1-48 saat
// içinde aktifliği bitmiş, girişli oturumları tarar. Oturum başına bir kez;
// aynı üyeye 7 günde bir defadan fazla mail atmaz.
// CRON_SECRET korumalı. Saatte bir çalıştırılması önerilir.

const HTML = (storeName: string, storeUrl: string, name: string, items: { name: string; price?: number }[]) => {
  const rows = items.slice(0, 6).map((it) =>
    `<li style="margin:0 0 6px;font-size:14px;color:#334155"><b>${it.name}</b>${it.price ? ` — ₺${Number(it.price).toLocaleString("tr-TR")}` : ""}</li>`
  ).join("");
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px">
    <h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">Sepetinde seni bekleyen ürünler var 👟</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba ${name}, göz attığın ürünleri senin için ayırdık. Numaran tükenmeden tamamlamak ister misin?</p>
    <ul style="margin:0 0 20px;padding:0 0 0 18px">${rows}</ul>
    <div style="text-align:center;margin:8px 0 4px">
      <a href="${storeUrl}/sepet" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:14px">Sepete Dön</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0">${storeName}</p>
  </div>`;
};

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (!secret || provided !== secret) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const nowMs = Date.now();
  const from = new Date(nowMs - 48 * 3600_000).toISOString(); // en fazla 48 saat geriye
  const until = new Date(nowMs - 60 * 60_000).toISOString();   // en az 1 saat sessiz

  // Aday oturumlar: girişli, bot değil, daha önce maillenmemiş, aktifliği bitmiş
  const { data: sessions } = await (supabase as any)
    .from("analytics_sessions")
    .select("session_id, user_id, last_seen_at")
    .eq("is_bot", false)
    .is("abandoned_notified_at", null)
    .not("user_id", "is", null)
    .gte("last_seen_at", from)
    .lte("last_seen_at", until)
    .limit(200);

  const cand = (sessions as any[]) || [];
  if (!cand.length) return NextResponse.json({ ok: true, checked: 0, queued: 0 });

  const sessionIds = cand.map((s) => s.session_id);
  const { data: events } = await (supabase as any)
    .from("analytics_events")
    .select("session_id, event_type, meta")
    .in("session_id", sessionIds);
  const evBySession: Record<string, any[]> = {};
  for (const e of (events as any[]) || []) (evBySession[e.session_id] ??= []).push(e);

  // Ayarlar + "Sıcak Lead" etiket seçeneği
  const { data: settings } = await (supabase.from("settings").select("*").limit(1).maybeSingle() as any) as { data: any };
  const storeName = settings?.store_name || "YeriHisset";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  const fromEmail = settings?.smtp_from_email || settings?.smtp_user || "";
  const fromName = settings?.smtp_from_name || storeName;

  const { data: tagOpt } = await (supabase as any)
    .from("member_tag_options").select("id").eq("value", "Sıcak Lead").maybeSingle();
  const hotLeadTagId = tagOpt?.id ?? null;

  // Bu üyeye son 7 günde zaten mail attık mı? (spam guard)
  const userIds = [...new Set(cand.map((s) => s.user_id))];
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 3600_000).toISOString();
  const { data: recent } = await (supabase as any)
    .from("analytics_sessions").select("user_id")
    .in("user_id", userIds).gte("abandoned_notified_at", sevenDaysAgo);
  const recentlyMailed = new Set((recent as any[] || []).map((r) => r.user_id));

  const { data: profiles } = await (supabase as any)
    .from("profiles").select("id, email, first_name").in("id", userIds);
  const profById: Record<string, any> = {};
  for (const p of (profiles as any[]) || []) profById[p.id] = p;

  let queued = 0;
  const done = new Set<string>(); // aynı üyeye bu turda iki kez atma

  for (const s of cand) {
    const evs = evBySession[s.session_id] || [];
    const added = evs.filter((e) => e.event_type === "add_to_cart" || e.event_type === "quick_buy");
    const bought = evs.some((e) => e.event_type === "purchase");
    if (bought || added.length === 0) continue; // sepete atmadıysa/aldıysa atla

    // Damgayı her durumda vur (tekrar değerlendirmeyi önle)
    await (supabase as any).from("analytics_sessions")
      .update({ abandoned_notified_at: new Date().toISOString() }).eq("session_id", s.session_id);

    const prof = profById[s.user_id];
    if (!prof?.email || recentlyMailed.has(s.user_id) || done.has(s.user_id)) continue;

    const removedNames = new Set(evs.filter((e) => e.event_type === "remove_from_cart").map((e) => e.meta?.name));
    const items = added
      .map((e) => ({ name: e.meta?.name || e.meta?.product_id || "Ürün", price: e.meta?.price }))
      .filter((it) => !removedNames.has(it.name));
    if (!items.length) continue;

    await (supabase as any).from("email_queue").insert({
      kind: "cart_abandonment",
      recipient_email: prof.email,
      to_name: prof.first_name || null,
      subject: `${storeName} — Sepetini tamamlamak ister misin? 👟`,
      html_body: HTML(storeName, storeUrl, prof.first_name || "Değerli Müşterimiz", items),
      from_name: fromName,
      from_email: fromEmail,
      status: "pending",
    });

    if (hotLeadTagId) {
      await (supabase as any).from("user_tags")
        .upsert({ user_id: s.user_id, tag_option_id: hotLeadTagId }, { onConflict: "user_id,tag_option_id", ignoreDuplicates: true });
    }

    done.add(s.user_id);
    queued++;
  }

  return NextResponse.json({ ok: true, checked: cand.length, queued });
}

export const POST = run;
export const GET = run;
