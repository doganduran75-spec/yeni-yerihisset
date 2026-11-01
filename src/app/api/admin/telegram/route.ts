/* eslint-disable @typescript-eslint/no-explicit-any */
// Ayarlar › Entegrasyonlar › Telegram (src/lib/telegram.ts). Yalnız yönetici. Bot token HİÇBİR yanıtta dönmez.
//   POST { op: "status" }                          → açık mı, token kayıtlı mı (bot adı), sohbet, konular, son gönderimler
//   POST { op: "save", token?, chatId?, enabled?, topics? } → kaydet (token getMe ile doğrulanır)
//   POST { op: "find_chat" }                       → bota en son yazan sohbeti bul (önce Telegram'da bota /start yaz)
//   POST { op: "test" }                            → deneme mesajı
//   POST { op: "preview", orderId }                → sipariş mesajının metni (gönderilmez)
//   POST { op: "send_daily" }                      → günlük özeti şimdi gönder (deneme)
//   POST { op: "preview_daily" }                   → günlük özetin metni (gönderilmez)
//   POST { op: "remove_token" }                    → token'ı sil + kapat
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { TELEGRAM_TOPICS, TOKEN_RE, getTelegramConfig, tgCall, tgSend, composeOrderMessage, composeDailySummary } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as any;
  const save = async (patch: Record<string, unknown>) => {
    const { error } = await sb.from("settings").update({ ...patch, updated_at: new Date().toISOString() }).not("id", "is", null);
    if (error) throw new Error(error.message);
  };

  try {
    const cfg = await getTelegramConfig(sb);

    if (body.op === "status") {
      let bot: string | null = null;
      let tokenError: string | null = null;
      if (cfg.token) {
        try { bot = (await tgCall(cfg.token, "getMe"))?.username ?? null; } catch (e: any) { tokenError = e?.message || "Token doğrulanamadı"; }
      }
      // Hata bildirimlerinin "bildirildi" işaret satırları (ie:…) listede görünmez
      const { data: recent } = await sb.from("telegram_outbox").select("id, topic, ref_id, status, error, created_at, sent_at")
        .or("dedupe_key.is.null,dedupe_key.like.daily:*").order("created_at", { ascending: false }).limit(10);
      const ids = ((recent as any[]) || []).map((r) => r.ref_id).filter(Boolean);
      const nums = new Map<string, string>();
      if (ids.length) ((await sb.from("orders").select("id, order_number, external_order_number").in("id", ids)).data || [])
        .forEach((o: any) => nums.set(o.id, o.order_number ? `YH${o.order_number}` : o.external_order_number || ""));
      return NextResponse.json({
        ok: true, enabled: cfg.enabled, tokenSet: !!cfg.token, bot, tokenError, chatId: cfg.chatId, topics: cfg.topics, dailyHour: cfg.dailyHour,
        topicList: TELEGRAM_TOPICS,
        recent: ((recent as any[]) || []).map((r) => ({ ...r, order: nums.get(r.ref_id) || null })),
      });
    }

    if (body.op === "save") {
      const patch: Record<string, unknown> = {};
      if (typeof body.token === "string" && body.token.trim()) {
        const t = body.token.trim();
        if (!TOKEN_RE.test(t)) return NextResponse.json({ error: "Token biçimi geçersiz (ör. 123456789:AA…)" }, { status: 400 });
        await tgCall(t, "getMe"); // geçersizse hata
        patch.telegram_bot_token = t;
      }
      if (typeof body.chatId === "string") {
        const c = body.chatId.trim();
        if (c && !/^-?\d{3,20}$/.test(c)) return NextResponse.json({ error: "Sohbet kimliği sayı olmalı" }, { status: 400 });
        patch.telegram_chat_id = c || null;
      }
      if (body.topics && typeof body.topics === "object") {
        const keys = new Set<string>(TELEGRAM_TOPICS.map((t) => t.key));
        patch.telegram_topics = Object.fromEntries(Object.entries(body.topics).filter(([k]) => keys.has(k)).map(([k, v]) => [k, !!v]));
      }
      if (body.dailyHour !== undefined) {
        const h = Number(body.dailyHour);
        if (!Number.isInteger(h) || h < 0 || h > 23) return NextResponse.json({ error: "Saat 0–23 olmalı" }, { status: 400 });
        patch.telegram_daily_hour = h;
      }
      if (typeof body.enabled === "boolean") {
        if (body.enabled && !((patch.telegram_bot_token as string) || cfg.token)) return NextResponse.json({ error: "Önce bot token'ı kaydet" }, { status: 400 });
        if (body.enabled && !(("telegram_chat_id" in patch ? patch.telegram_chat_id : cfg.chatId))) return NextResponse.json({ error: "Önce sohbeti bul (bota /start yaz → Sohbeti bul)" }, { status: 400 });
        patch.telegram_enabled = body.enabled;
      }
      if (Object.keys(patch).length) await save(patch);
      return NextResponse.json({ ok: true });
    }

    if (body.op === "find_chat") {
      if (!cfg.token) return NextResponse.json({ error: "Önce bot token'ı kaydet" }, { status: 400 });
      const ups: any[] = (await tgCall(cfg.token, "getUpdates", { limit: 50, allowed_updates: ["message"] })) || [];
      const msg = [...ups].reverse().map((u) => u.message).find((m) => m?.chat?.id);
      if (!msg) return NextResponse.json({ error: "Bota gelen mesaj bulunamadı — Telegram'da botu aç, /start yaz, sonra tekrar dene." }, { status: 404 });
      const c = msg.chat;
      const name = c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || "";
      await save({ telegram_chat_id: String(c.id) });
      return NextResponse.json({ ok: true, chatId: String(c.id), name, type: c.type });
    }

    if (body.op === "test") {
      if (!cfg.token || !cfg.chatId) return NextResponse.json({ error: "Önce token'ı kaydet ve sohbeti bul" }, { status: 400 });
      await tgSend(cfg, "✅ <b>YeriHisset</b> bildirimleri bu sohbete gelecek.");
      return NextResponse.json({ ok: true });
    }

    if (body.op === "preview") {
      const id = String(body.orderId || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Geçersiz sipariş" }, { status: 400 });
      const msg = await composeOrderMessage(sb, id, { final: true });
      if (!msg) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
      return NextResponse.json({ ok: true, text: msg.text, test: msg.test });
    }

    if (body.op === "preview_daily") return NextResponse.json({ ok: true, text: await composeDailySummary(sb) });

    if (body.op === "send_daily") {
      if (!cfg.token || !cfg.chatId) return NextResponse.json({ error: "Önce token'ı kaydet ve sohbeti bul" }, { status: 400 });
      await tgSend(cfg, await composeDailySummary(sb));
      return NextResponse.json({ ok: true });
    }

    if (body.op === "remove_token") {
      await save({ telegram_bot_token: null, telegram_enabled: false });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
