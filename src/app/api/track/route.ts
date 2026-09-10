import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// First-party analitik toplama uç noktası (Yol B).
// Client (src/lib/track.ts) buraya event yığını gönderir. IP server-side
// header'dan alınır (client'a güvenilmez). service_role ile yazar (RLS atlar).

// Kaydedilecek event türleri — allowlist (çöp/abuse engeli).
const ALLOWED = new Set([
  "page_view", "hero_click", "category_click", "brand_click", "size_filter",
  "view_item", "add_to_cart", "quick_buy", "remove_from_cart", "search",
  "coupon_apply", "begin_checkout", "purchase", "opportunity_click", "campaign_landing",
]);

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|headless|python-requests|curl|wget|axios|node-fetch|lighthouse|pingdom|uptime/i;

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || null;
}

function deviceFrom(ua: string): string {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "geçersiz" }, { status: 400 });
  }

  const sessionId: string | undefined = body?.session_id;
  const events: any[] = Array.isArray(body?.events) ? body.events.slice(0, 50) : [];
  if (!sessionId || events.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const ua = req.headers.get("user-agent") || "";
  const isBot = BOT_RE.test(ua);
  const supabase = createAdminClient();

  try {
    // Oturum: ilk temasta oluştur (UTM/kaynak/IP burada dondurulur),
    // sonraki flush'larda yalnız last_seen/sayaç ve dolan kimlik güncellenir.
    const existing = await (supabase as any)
      .from("analytics_sessions").select("session_id, user_id, contact_id").eq("session_id", sessionId).maybeSingle();

    const userId = body?.user_id || null;

    if (!existing.data) {
      await (supabase as any).from("analytics_sessions").insert({
        session_id: sessionId,
        user_id: userId,
        utm_source: body?.utm?.source || null,
        utm_medium: body?.utm?.medium || null,
        utm_campaign: body?.utm?.campaign || null,
        utm_content: body?.utm?.content || null,
        utm_term: body?.utm?.term || null,
        referrer: body?.referrer || null,
        landing_path: body?.landing_path || null,
        ip: clientIp(req),
        user_agent: ua.slice(0, 400),
        device: deviceFrom(ua),
        is_bot: isBot,
        event_count: events.length,
        last_seen_at: new Date().toISOString(),
      });
    } else {
      await (supabase as any).from("analytics_sessions").update({
        last_seen_at: new Date().toISOString(),
        event_count: (existing.data.event_count || 0) + events.length,
        user_id: existing.data.user_id || userId,   // ilk dolanı koru
      }).eq("session_id", sessionId);
    }

    const rows = events
      .filter((e) => ALLOWED.has(e?.type))
      .map((e) => ({
        session_id: sessionId,
        user_id: userId,
        event_type: e.type,
        path: typeof e.path === "string" ? e.path.slice(0, 300) : null,
        meta: e.meta ?? null,
        created_at: e.ts ? new Date(e.ts).toISOString() : new Date().toISOString(),
      }));

    if (rows.length) await (supabase as any).from("analytics_events").insert(rows);

    return NextResponse.json({ ok: true, stored: rows.length });
  } catch (err: any) {
    console.error("[api/track]", err?.message || err);
    // Takip kritik değil — hata bile olsa client'ı bloklamayalım.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
