/* eslint-disable @typescript-eslint/no-explicit-any */
// TELEGRAM BİLDİRİMLERİ (kullanıcı isteği 2026-11-01) — yalnız sunucuda.
// Konu bazlı (parametrik, Ayarlar › Entegrasyonlar › Telegram). Kuyruk: telegram_outbox (migration 20261159).
//   new_order: veritabanı tetikleyicisi her kanaldaki yeni siparişi kuyruğa ekler. İşleyici ~15 sn sonra mesajı
//   gönderir (sipariş no, müşteri, ürünler, stok kaçtan kaça düştü); pazaryeri / Google gönderimleri bitince
//   (en çok ~10 dk) AYNI mesajı günceller: hangi entegrasyon tetiklendi, güncellendi ya da hata verdi.
// Çağıranlar: dakikalık cron (/api/cron/marketplace-sync) + site siparişinden hemen sonra kickTelegram().
// Test siparişi (@….test üye / REGRESYON-TEST ürün) GÖNDERİLMEZ. Token hiçbir yanıtta / hata metninde dönmez.
import { createAdminClient } from "@/lib/supabase-admin";
import { isTestEmail } from "@/lib/mail-guard";

type SB = any;

/** Konular — yeni konu buraya eklenir; ready=false olanlar panelde "yakında" görünür. */
export const TELEGRAM_TOPICS = [
  { key: "new_order", label: "Yeni sipariş", desc: "Sipariş no, müşteri, ürünler, stok kaçtan kaça düştü, siparişten sonra güncellenen entegrasyonlar", ready: true },
  { key: "stock_request", label: "Yeni stok talebi", desc: "“Stoğa gelince haber ver” kaydı", ready: false },
  { key: "server_alert", label: "Sunucu / sistem uyarısı", desc: "Sunucu sağlığı kırmızı, yeni IP’den SSH girişi, zamanlanmış görev durdu", ready: false },
  { key: "integration_error", label: "Entegrasyon hatası", desc: "Pazaryeri stok / fatura gönderilemedi, Paraşüt hatası", ready: false },
  { key: "daily_summary", label: "Günlük özet (periyodik)", desc: "Her sabah: dünkü satış, bekleyen işler", ready: false },
] as const;
export type TelegramTopic = (typeof TELEGRAM_TOPICS)[number]["key"];

export type TelegramConfig = { enabled: boolean; token: string; chatId: string; topics: Record<string, boolean> };

export async function getTelegramConfig(sb: SB): Promise<TelegramConfig> {
  const { data } = await sb.from("settings")
    .select("telegram_enabled, telegram_bot_token, telegram_chat_id, telegram_topics")
    .order("id", { ascending: true }).limit(1).maybeSingle();
  return {
    enabled: !!data?.telegram_enabled,
    token: String(data?.telegram_bot_token || "").trim(),
    chatId: String(data?.telegram_chat_id || "").trim(),
    topics: (data?.telegram_topics && typeof data.telegram_topics === "object") ? data.telegram_topics : { new_order: true },
  };
}

export const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;

/** Bot API çağrısı. Hata metninde adres (token) YOK — yalnız Telegram'ın açıklaması. */
export async function tgCall(token: string, method: string, body?: Record<string, unknown>): Promise<any> {
  if (!TOKEN_RE.test(token)) throw new Error("Bot token biçimi geçersiz");
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15000), cache: "no-store",
    });
  } catch {
    throw new Error("Telegram'a bağlanılamadı");
  }
  const j: any = await res.json().catch(() => null);
  if (!j?.ok) {
    const d = String(j?.description || `HTTP ${res.status}`);
    const hint = res.status === 401 ? " (token geçersiz ya da iptal edilmiş)" : res.status === 403 ? " (bot engellenmiş ya da sohbete yazamıyor — Telegram'da bota /start yaz)" : "";
    throw new Error(`Telegram: ${d}${hint}`);
  }
  return j.result;
}

export async function tgSend(cfg: TelegramConfig, text: string): Promise<number> {
  const r = await tgCall(cfg.token, "sendMessage", { chat_id: cfg.chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  return Number(r?.message_id);
}

async function tgEdit(cfg: TelegramConfig, messageId: number, text: string): Promise<void> {
  try {
    await tgCall(cfg.token, "editMessageText", { chat_id: cfg.chatId, message_id: messageId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  } catch (e: any) {
    if (!/not modified/i.test(e?.message || "")) throw e;
  }
}

// ─── Yeni sipariş mesajı ─────────────────────────────────────────────────────

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tl = (n: unknown) => `₺${Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const parseJson = (v: unknown) => { if (v && typeof v === "object") return v as any; try { return JSON.parse(String(v || "")); } catch { return null; } };

const PAY: Record<string, string> = { bank_transfer: "Havale/EFT", iyzico: "Kart", credit_card: "Kart", store_credit: "YeriHisset Kredisi" };
const PAY_ST: Record<string, string> = { pending: "ödeme bekleniyor", paid: "ödendi", failed: "ödeme başarısız" };
const MP: Record<string, string> = { trendyol: "Trendyol", hepsiburada: "Hepsiburada", amazon: "Amazon" };

export const SETTLE_MS = 10 * 60_000; // entegrasyon sonucu en çok bu kadar beklenir

/** Sipariş mesajı. settled=false → pazaryeri / Google gönderimi sürüyor (mesaj sonra güncellenir). */
export async function composeOrderMessage(sb: SB, orderId: string, opts: { final?: boolean } = {}):
  Promise<{ text: string; settled: boolean; test: boolean } | null> {
  const { data: o } = await sb.from("orders")
    .select("id, order_number, external_order_number, channel, customer_name, customer_email, shipping_address, total_amount, payment_method, payment_status, user_id, created_at, stock_reduced_at")
    .eq("id", orderId).maybeSingle();
  if (!o) return null;

  const { data: itemRows } = await sb.from("order_items")
    .select("id, product_id, variant_id, quantity, unit_price, title, variant_name, stock_applied_at").eq("order_id", orderId);
  const items = (itemRows as any[]) || [];

  // Ürün adı + numara (site kalemlerinde başlık ürün tablosundan)
  const pids = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];
  const vids = [...new Set(items.map((i) => i.variant_id).filter(Boolean))] as string[];
  const pmap = new Map<string, any>();
  const vmap = new Map<string, any>();
  if (pids.length) ((await sb.from("products").select("id, title, stock").in("id", pids)).data || []).forEach((p: any) => pmap.set(p.id, p));
  if (vids.length) ((await sb.from("product_variants").select("id, stock, variant_options(value)").in("id", vids)).data || []).forEach((v: any) => vmap.set(v.id, v));

  // Test siparişi: @….test üye / müşteri e-postası ya da REGRESYON-TEST ürünü → gönderilmez
  let profile: any = null;
  if (o.user_id) profile = (await sb.from("profiles").select("first_name, last_name, email").eq("id", o.user_id).maybeSingle()).data;
  // Kalemsiz sipariş de gönderilmez (pazaryeri kalemleri henüz yazılmadıysa / test kaydı)
  const test = !items.length || isTestEmail(profile?.email) || isTestEmail(o.customer_email)
    || items.some((i) => /^REGRESYON-TEST/.test(String(pmap.get(i.product_id)?.title || i.title || "")));

  // Stok kaçtan kaça: siparişten sonraki ilk düşüm (stock_events), yoksa güncel stok + adet
  const since = new Date(new Date(o.created_at).getTime() - 2 * 60_000).toISOString();
  const evs: any[] = [];
  if (vids.length) evs.push(...(((await sb.from("stock_events").select("variant_id, product_id, old_stock, new_stock, delta, created_at")
    .in("variant_id", vids).lt("delta", 0).gte("created_at", since).order("created_at")).data) || []));
  const plainPids = items.filter((i) => !i.variant_id && i.product_id).map((i) => i.product_id);
  if (plainPids.length) evs.push(...(((await sb.from("stock_events").select("variant_id, product_id, old_stock, new_stock, delta, created_at")
    .in("product_id", plainPids).is("variant_id", null).lt("delta", 0).gte("created_at", since).order("created_at")).data) || []));
  const used = new Set<any>();

  const lines: string[] = [];
  for (const i of items) {
    const title = pmap.get(i.product_id)?.title || i.title || "Ürün";
    const size = vmap.get(i.variant_id)?.variant_options?.value || i.variant_name || "";
    const qty = Number(i.quantity || 0);
    let stockTxt: string;
    // Pazaryeri: kalem başına (stock_applied_at); site: sipariş başına (stock_reduced_at)
    if (!i.stock_applied_at && !((o.channel || "site") === "site" && o.stock_reduced_at)) stockTxt = "⚠️ stok düşülmedi";
    else {
      const ev = evs.find((e) => !used.has(e) && (i.variant_id ? e.variant_id === i.variant_id : e.product_id === i.product_id) && Number(e.delta) === -qty);
      if (ev) { used.add(ev); stockTxt = `stok ${ev.old_stock} → <b>${ev.new_stock}</b>`; }
      else {
        const cur = Number(i.variant_id ? vmap.get(i.variant_id)?.stock : pmap.get(i.product_id)?.stock);
        stockTxt = Number.isFinite(cur) ? `stok → <b>${cur}</b> (şu an)` : "";
      }
    }
    lines.push(`• ${esc(title)}${size ? ` · <b>${esc(size)}</b>` : ""} ×${qty}${Number(i.unit_price) === 0 ? " 🎁" : ""}${stockTxt ? `\n   ${stockTxt}` : ""}`);
  }

  // Entegrasyonlar: siparişin numaraları için pazaryeri stok kuyruğu + Google Merchant
  const created = new Date(o.created_at).getTime();
  const integ: string[] = [];
  let pending = false;
  if (vids.length) {
    const { data: rows } = await sb.from("marketplace_stock_sync")
      .select("channel, variant_id, status, last_sent_qty, error, sent_at").in("variant_id", vids);
    const byCh = new Map<string, any[]>();
    for (const r of (rows as any[]) || []) byCh.set(r.channel, [...(byCh.get(r.channel) || []), r]);
    for (const [ch, rs] of [...byCh.entries()].sort()) {
      const label = MP[ch] || ch;
      const failed = rs.find((r) => r.status === "failed");
      const busy = rs.filter((r) => ["pending", "sending", "sent"].includes(r.status));
      const done = rs.filter((r) => r.status === "ok" && r.sent_at && new Date(r.sent_at).getTime() >= created - 60_000);
      const sizeOf = (r: any) => vmap.get(r.variant_id)?.variant_options?.value;
      if (failed) integ.push(`✗ ${label}: hata — ${esc(String(failed.error || "gönderilemedi").slice(0, 120))}`);
      else if (busy.length) { pending = true; integ.push(`⏳ ${label}: gönderiliyor (${busy.length} numara)`); }
      else if (done.length) integ.push(`✓ ${label}: stok güncellendi (${done.map((r) => `${sizeOf(r) ? sizeOf(r) + "→" : ""}${r.last_sent_qty}`).join(", ")})`);
      else integ.push(`– ${label}: değişiklik gönderilmedi`);
    }
  }
  const { data: st } = await sb.from("settings").select("gmc_api_enabled").limit(1).maybeSingle();
  if (st?.gmc_api_enabled && pids.length) {
    const { count: queued } = await sb.from("gmc_sync_queue").select("product_id", { count: "exact", head: true }).in("product_id", pids);
    const { data: offers } = await sb.from("gmc_offers").select("ok, error, sent_at").in("product_id", pids);
    const recent = ((offers as any[]) || []).filter((x) => x.sent_at && new Date(x.sent_at).getTime() >= created - 60_000);
    const bad = recent.find((x) => x.ok === false);
    if (queued) { pending = true; integ.push("⏳ Google Merchant: sırada"); }
    else if (bad) integ.push(`✗ Google Merchant: ${esc(String(bad.error || "hata").slice(0, 120))}`);
    else if (recent.length) integ.push("✓ Google Merchant: güncellendi");
    else integ.push("– Google Merchant: değişiklik gönderilmedi");
  }
  const timedOut = Date.now() - created > SETTLE_MS;
  const settled = !pending || timedOut || !!opts.final;

  const ch = o.channel || "site";
  const { data: chRow } = await sb.from("sales_channels").select("label").eq("code", ch).maybeSingle();
  const chLabel = chRow?.label || MP[ch] || (ch === "site" ? "YeriHisset" : ch);
  const no = o.order_number ? `YH${o.order_number}` : o.external_order_number || o.id.slice(0, 8).toUpperCase();
  const addr = parseJson(o.shipping_address);
  const name = o.customer_name || addr?.name || [addr?.first_name, addr?.last_name].filter(Boolean).join(" ")
    || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "—";
  const pay = ch === "site" ? `${PAY[o.payment_method] || o.payment_method || "—"} (${PAY_ST[o.payment_status] || o.payment_status || "—"})` : chLabel;
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

  const text = [
    `🛒 <b>Yeni sipariş</b> · ${esc(chLabel)}`,
    `<b>${esc(no)}</b> — ${esc(name)}`,
    `${tl(o.total_amount)} · ${esc(pay)}`,
    "",
    "<b>Ürünler</b>",
    ...(lines.length ? lines : ["—"]),
    "",
    "<b>Entegrasyonlar</b>",
    ...(integ.length ? integ : ["– Bağlı entegrasyon tetiklenmedi"]),
    ...(!settled ? ["", "<i>Gönderimler bitince bu mesaj güncellenir.</i>"] : pending ? ["", "<i>Bazı gönderimler hâlâ sürüyor — sipariş ekranından bak.</i>"] : []),
    "",
    `<a href="${storeUrl}/admin/orders?id=${o.id}">Siparişi aç</a>`,
  ].join("\n");
  return { text, settled, test };
}

// ─── Kuyruk işleyici ────────────────────────────────────────────────────────

const MIN_AGE_MS = 15_000; // pazaryeri siparişinde kalemler + stok düşümü yazılsın

export async function processTelegramOutbox(sb: SB = createAdminClient()): Promise<{ sent: number; updated: number; skipped: number; errors: string[] }> {
  const out = { sent: 0, updated: 0, skipped: 0, errors: [] as string[] };
  const cfg = await getTelegramConfig(sb);
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  await sb.from("telegram_outbox").delete().lt("created_at", iso(now - 30 * 86400_000));

  // Kapalıyken biriken kayıt açılınca eski siparişleri yağdırmasın → atlanır
  const off = !cfg.enabled || !cfg.token || !cfg.chatId;
  const offTopics = TELEGRAM_TOPICS.map((t) => t.key).filter((k) => off || !cfg.topics?.[k]);
  if (offTopics.length) {
    const { data: sk } = await sb.from("telegram_outbox").update({ status: "skipped", error: off ? "Telegram kapalı" : "Konu kapalı", done_at: iso(now) })
      .eq("status", "pending").in("topic", offTopics).select("id");
    out.skipped += (sk as any[] | null)?.length || 0;
  }
  if (off) return out;

  // 1) Yeni kayıtlar → gönder
  const { data: pend } = await sb.from("telegram_outbox").select("id, topic, ref_id, status, attempts")
    .or(`status.eq.pending,and(status.eq.sending,locked_at.lt.${iso(now - 5 * 60_000)})`)
    .lte("created_at", iso(now - MIN_AGE_MS)).order("created_at").limit(20);
  for (const r of (pend as any[]) || []) {
    const { data: claimed } = await sb.from("telegram_outbox").update({ status: "sending", locked_at: iso(Date.now()) })
      .eq("id", r.id).eq("status", r.status).select("id");
    if (!claimed?.length) continue;
    try {
      const msg = r.topic === "new_order" && r.ref_id ? await composeOrderMessage(sb, r.ref_id) : null;
      if (!msg || msg.test) {
        await sb.from("telegram_outbox").update({ status: "skipped", error: !msg ? "Kayıt bulunamadı" : "Test siparişi", done_at: iso(Date.now()) }).eq("id", r.id);
        out.skipped++;
        continue;
      }
      const messageId = await tgSend(cfg, msg.text);
      await sb.from("telegram_outbox").update({
        status: msg.settled ? "done" : "sent", message_id: messageId, text: msg.text, error: null,
        sent_at: iso(Date.now()), ...(msg.settled ? { done_at: iso(Date.now()) } : {}),
      }).eq("id", r.id);
      out.sent++;
    } catch (e: any) {
      const attempts = Number(r.attempts || 0) + 1;
      await sb.from("telegram_outbox").update({ status: attempts >= 5 ? "failed" : "pending", attempts, error: String(e?.message || e).slice(0, 300) }).eq("id", r.id);
      out.errors.push(String(e?.message || e));
      if (/token|401/i.test(String(e?.message))) break; // yanlış token: kalanları boşuna deneme
    }
  }

  // 2) Gönderilmiş, entegrasyonu süren mesajlar → tamamlanınca güncelle
  const { data: open } = await sb.from("telegram_outbox").select("id, topic, ref_id, message_id, text")
    .eq("status", "sent").order("created_at").limit(30);
  for (const r of (open as any[]) || []) {
    try {
      const msg = r.topic === "new_order" && r.ref_id ? await composeOrderMessage(sb, r.ref_id) : null;
      if (!msg) { await sb.from("telegram_outbox").update({ status: "done", done_at: iso(Date.now()) }).eq("id", r.id); continue; }
      if (!msg.settled) continue;
      if (msg.text !== r.text && r.message_id) await tgEdit(cfg, Number(r.message_id), msg.text);
      await sb.from("telegram_outbox").update({ status: "done", text: msg.text, done_at: iso(Date.now()) }).eq("id", r.id);
      out.updated++;
    } catch (e: any) {
      out.errors.push(String(e?.message || e));
    }
  }
  return out;
}

// Site siparişinden hemen sonra (cron'u beklemeden). Aynı anda tek çalışma.
let running = false;
export function kickTelegram(delayMs = MIN_AGE_MS + 2000) {
  setTimeout(async () => {
    if (running) return;
    running = true;
    try {
      const r = await processTelegramOutbox();
      if (r.errors.length) console.error("[telegram]", r.errors.join(" | "));
      // Entegrasyon sonucu için bir kez daha (pazaryeri yükleme sonucu birkaç saniye sürer)
      if (r.sent) setTimeout(() => kickTelegram(0), 45_000);
    } catch (e: any) {
      console.error("[telegram]", e?.message || e);
    } finally {
      running = false;
    }
  }, delayMs);
}
