/* eslint-disable @typescript-eslint/no-explicit-any */
// TRENDYOL MÜŞTERİ SORULARI (kullanıcı 2026-11-14): soruları çek → marketplace_questions; panelden cevapla → Trendyol.
// Trendyol yeni soruyu bildirmez → 5 dk'da bir (cron/marketplace-sync) son 2 haftanın değişen soruları çekilir:
// yeni soru eklenir (ayrıntıdan model kodu → ürün eşleşmesi), var olanın durumu / cevabı / ret nedeni güncellenir.
// Kurallar ve uyarılar: src/lib/marketplace/qna-rules.ts. Tablo: MIG 20261184.
import type { createAdminClient } from "@/lib/supabase-admin";
import { getTrendyolConfig, hasCredentials, getQuestions, getQuestion, answerQuestion, TrendyolError } from "./trendyol";
import { answerProblems } from "./qna-rules";

type Sb = ReturnType<typeof createAdminClient>;
const DAY = 86400_000;
const ms = (v: unknown) => (v ? new Date(Number(v)).toISOString() : null);

function rowFrom(q: any) {
  const ans = q.answer || null;
  const rej = q.rejectedAnswer || null;
  return {
    status: String(q.status || "WAITING_FOR_ANSWER"),
    question: String(q.text || "").slice(0, 4000),
    user_name: q.showUserName === false ? null : (q.userName || null),
    product_name: q.productName || null,
    product_url: q.webUrl || null,
    image_url: q.imageUrl || null,
    asked_at: ms(q.creationDate),
    ...(ans?.text ? { answer: String(ans.text), answered_at: ms(ans.creationDate) } : {}),
    reject_reason: rej ? String(rej.reason || q.reason || "Trendyol cevabı reddetti") : (q.status === "REJECTED" ? String(q.reason || "Reddedildi") : null),
  };
}

/** Son 2 haftada değişen soruları çek ve kaydet. Trendyol kapalıysa / kimlik yoksa sessizce geçer. */
export async function syncTrendyolQuestions(sb: Sb): Promise<{ checked: number; added: number; updated: number; errors: string[] }> {
  const s = sb as any;
  const c = await getTrendyolConfig(sb);
  const out = { checked: 0, added: 0, updated: 0, errors: [] as string[] };
  if (!c.enabled || !hasCredentials(c)) return out;
  const end = Date.now(), start = end - 14 * DAY + 60_000;
  try {
    for (let page = 0; page < 20; page++) {
      const j = await getQuestions(c, { startDate: String(start), endDate: String(end), page: String(page), size: "50", orderByField: "LastModifiedDate", orderByDirection: "DESC" });
      const list: any[] = j?.content || [];
      if (!list.length) break;
      const ids = list.map((q) => String(q.id));
      const { data: have } = await s.from("marketplace_questions").select("id, external_id, status, answer").eq("channel", "trendyol").in("external_id", ids);
      const known = new Map(((have as any[]) || []).map((r) => [r.external_id, r]));
      for (const q of list) {
        out.checked++;
        const row = rowFrom(q);
        const ex = known.get(String(q.id));
        if (ex) {
          if (ex.status !== row.status || (!ex.answer && (row as any).answer)) {
            await s.from("marketplace_questions").update({ ...row, updated_at: new Date().toISOString() }).eq("id", ex.id);
            out.updated++;
          }
          continue;
        }
        // Yeni soru: ayrıntıdan model kodu → bizim ürün (products.model_code)
        let mainId: string | null = null, productId: string | null = null;
        try { mainId = (await getQuestion(c, String(q.id)))?.productMainId || null; } catch { /* ayrıntı alınamadı */ }
        if (mainId) productId = (await s.from("products").select("id").ilike("model_code", mainId).limit(1).maybeSingle()).data?.id ?? null;
        const { error } = await s.from("marketplace_questions").insert({ channel: "trendyol", external_id: String(q.id), ...row, product_main_id: mainId, product_id: productId });
        if (!error) out.added++;
      }
      if (j?.totalPages != null && page + 1 >= Number(j.totalPages)) break;
    }
  } catch (e: any) {
    out.errors.push(e?.message || String(e));
  }
  return out;
}

/** Panelden cevap gönder. Kurallara aykırıysa (kısa / uzun) gönderilmez; uyarılar force ile geçilir. */
export async function answerTrendyolQuestion(sb: Sb, questionId: string, text: string, userId: string, force = false) {
  const s = sb as any;
  const { data: q } = await s.from("marketplace_questions").select("id, channel, external_id, status").eq("id", questionId).maybeSingle();
  if (!q || q.channel !== "trendyol") return { error: "Soru bulunamadı", status: 404 };
  if (q.status !== "WAITING_FOR_ANSWER") return { error: "Bu soru cevaplanamaz (yalnız “Cevap bekliyor” durumundaki sorular)", status: 400 };
  const t = String(text || "").trim();
  const p = answerProblems(t);
  if (p.errors.length) return { error: p.errors.join(" "), status: 400 };
  if (p.warnings.length && !force) return { error: p.warnings.join(" "), warnings: p.warnings, status: 409 };
  const c = await getTrendyolConfig(sb);
  if (!c.enabled || !hasCredentials(c)) return { error: "Trendyol entegrasyonu kapalı / kimlik eksik", status: 400 };
  try {
    await answerQuestion(c, q.external_id, t);
  } catch (e: any) {
    const msg = e instanceof TrendyolError ? e.message : String(e?.message || e);
    await s.from("marketplace_questions").update({ error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", q.id);
    return { error: msg, status: 502 };
  }
  const now = new Date().toISOString();
  await s.from("marketplace_questions").update({ status: "WAITING_FOR_APPROVE", answer: t, answered_at: now, answered_by: userId, error: null, reject_reason: null, updated_at: now }).eq("id", q.id);
  return { ok: true };
}
