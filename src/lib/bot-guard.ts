/* eslint-disable @typescript-eslint/no-explicit-any */
// FORM SPAM KORUMASI (sunucu tarafı). İstemci: src/components/BotTrap.tsx (useBotTrap).
// Katmanlar: bal küpü alanı dolu → bot; gönderim süresi yok / çok kısa → bot;
// metin alanlarında "anlamsız" dizi (WordPress'teki gibi "kJhGfDsAqW") → bot.
// Sonuç:
//   "silent"  → bota başarı dönülür, hiçbir şey kaydedilmez / gönderilmez (bot öğrenmesin)
//   "retry"   → süre yok / çok kısa: gerçek kullanıcı da olabilir (eski sayfa, çok hızlı) → nazik
//               hata, sayfayı yenileyip tekrar dener
//   "invalid" → anlamsız ad/metin ama formda görünür hata istenmiş (kayıt, misafir sipariş):
//               yanlışlıkla takılan gerçek kişi düzeltebilsin
// Engellenen her deneme bot_blocks tablosuna yazılır (IP özetlenmiş); Sunucu Sağlığı kartı sayar.
// Oturum açmış kullanıcılarda çağırma (gerek yok).
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export type BotVerdict = { kind: "silent" | "retry" | "invalid"; reason: string } | null;

const VOWELS = /[aeıioöuüAEIİOÖUÜ]/;

/** Rastgele üretilmiş dizi mi? (ör. "pIbqUpDLHjc", "RvcEqYzKbHn") — Türkçe adlara takılmayacak kadar temkinli */
export function looksGibberish(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim();
  if (t.length < 6) return false;
  if (/https?:\/\//i.test(t) && t.split(/\s+/).length <= 3) return true; // yalnız bağlantıdan ibaret
  if (t.length >= 25 && !/\s/.test(t) && !t.includes("@")) return true; // boşluksuz uzun dizi
  for (const w of t.split(/[\s,.;:!?'"()\-_/]+/)) {
    if (w.length < 7 || !/^[A-Za-zÇĞİÖŞÜçğıöşü]+$/.test(w)) continue;
    const inner = w.slice(1);
    const innerCaps = (inner.match(/[A-ZÇĞİÖŞÜ]/g) || []).length;
    const isAllCaps = w === w.toLocaleUpperCase("tr");
    if (!isAllCaps && innerCaps >= 2) return true; // kJhGfDsA
    let run = 0, maxRun = 0;
    for (const ch of w) { run = VOWELS.test(ch) ? 0 : run + 1; maxRun = Math.max(maxRun, run); }
    if (maxRun >= 5) return true; // ünsüz yığını
    const vowelRatio = (w.match(/[aeıioöuüAEIİOÖUÜ]/g) || []).length / w.length;
    if (w.length >= 9 && vowelRatio < 0.15) return true;
  }
  return false;
}

/**
 * @param body   isteğin gövdesi (_hp ve _t alanları useBotTrap'ten gelir)
 * @param texts  insan yazısı olması beklenen alanlar (ad, mesaj…) — anlamsızsa bot
 * @param minMs  formun açılmasından gönderime en kısa süre
 */
export function botVerdict(
  body: any,
  opts: { texts?: (string | null | undefined)[]; minMs?: number; gibberish?: "silent" | "invalid" } = {},
): BotVerdict {
  if (body?._hp) return { kind: "silent", reason: "honeypot" };
  const t = Number(body?._t);
  if (!Number.isFinite(t) || t <= 0) return { kind: "retry", reason: "no-timer" }; // formsuz, doğrudan API'ye gönderim
  if (t < (opts.minMs ?? 2000)) return { kind: "retry", reason: `fast:${Math.round(t)}ms` };
  for (const x of opts.texts ?? []) if (looksGibberish(x)) return { kind: opts.gibberish ?? "silent", reason: "gibberish" };
  return null;
}

/** Engellenen denemeyi kaydet (beklemeden). IP ham tutulmaz — günlük tuzlu özet. */
export function logBotBlock(endpoint: string, verdict: NonNullable<BotVerdict>, ip: string) {
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = createHash("sha256").update(`${day}|${ip}|${process.env.CRON_SECRET ?? "yh"}`).digest("hex").slice(0, 16);
  (createAdminClient() as any).from("bot_blocks").insert({ endpoint, reason: verdict.reason, ip_hash: ipHash })
    .then(({ error }: any) => { if (error) console.warn("[bot-guard] kayıt:", error.message); });
  console.warn(`[bot-guard] ${endpoint} engellendi (${verdict.reason})`);
}

/** Uç için hazır yanıt: bot → sahte başarı / nazik hata. null → devam et. */
export function botResponse(endpoint: string, verdict: BotVerdict, ip: string, okBody: Record<string, unknown> = { ok: true }) {
  if (!verdict) return null;
  logBotBlock(endpoint, verdict, ip);
  if (verdict.kind === "retry") {
    return NextResponse.json({ error: "Gönderilemedi. Sayfayı yenileyip birkaç saniye sonra tekrar dener misin?" }, { status: 429 });
  }
  if (verdict.kind === "invalid") {
    return NextResponse.json({ error: "Ad / metin alanı geçersiz görünüyor. Kontrol edip tekrar dener misin?" }, { status: 400 });
  }
  return NextResponse.json(okBody);
}
