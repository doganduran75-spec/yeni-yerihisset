/* eslint-disable @typescript-eslint/no-explicit-any */
// TELEGRAM BİLDİRİMLERİ (kullanıcı isteği 2026-11-01) — yalnız sunucuda.
// Konu bazlı (parametrik, Ayarlar › Entegrasyonlar › Telegram). Kuyruk: telegram_outbox (migration 20261159).
//   new_order: veritabanı tetikleyicisi her kanaldaki yeni siparişi kuyruğa ekler. İşleyici ~15 sn sonra mesajı
//   gönderir (sipariş no, müşteri, ürünler, stok kaçtan kaça düştü); pazaryeri / Google gönderimleri bitince
//   (en çok ~10 dk) AYNI mesajı günceller: hangi entegrasyon tetiklendi, güncellendi ya da hata verdi.
// Diğer konular (migration 20261160): stok talebi / iade-değişim talebi / müşteri mesajı tetikleyiciyle kuyruğa girer;
// entegrasyon hatası + günlük özet dakikalık işleyicide taranır; sunucu uyarısı e-postayla aynı anda (notifyServerAlert).
// Çağıranlar: dakikalık cron (/api/cron/marketplace-sync) + site siparişinden hemen sonra kickTelegram().
// Test siparişi (@….test üye / REGRESYON-TEST ürün) GÖNDERİLMEZ. Token hiçbir yanıtta / hata metninde dönmez.
import { createAdminClient } from "@/lib/supabase-admin";
import { isTestEmail } from "@/lib/mail-guard";

type SB = any;

/** Konular — yeni konu buraya eklenir; ready=false olanlar panelde "yakında" görünür. */
export const TELEGRAM_TOPICS = [
  { key: "new_order", label: "Yeni sipariş", desc: "Sipariş no, müşteri, ürünler, stok kaçtan kaça düştü, siparişten sonra güncellenen entegrasyonlar", ready: true },
  { key: "stock_request", label: "Yeni stok talebi", desc: "Müşteri “stoğa gelince haber ver” dedi: ürün, numara, o numarayı bekleyen kişi sayısı (elle eklediğin hariç)", ready: true },
  { key: "after_sale_request", label: "İade / değişim talebi", desc: "Müşteri siparişinde iade ya da değişim istedi: sebep, istenen numara, not", ready: true },
  { key: "customer_message", label: "Müşteri mesajı", desc: "Müşteri sipariş ekranından mesaj yazdı", ready: true },
  { key: "integration_error", label: "Entegrasyon hatası", desc: "Paraşüt faturası, pazaryeri fatura yükleme, Trendyol işleme al, Kargonomi, pazaryeri stok, Google gönderimi hata verdi", ready: true },
  { key: "server_alert", label: "Sunucu / sistem uyarısı", desc: "Sunucu sağlığı uyarısı (disk, yedek, yeni IP’den SSH girişi, zamanlanmış görev durdu…) ve “giderildi”", ready: true },
  { key: "daily_summary", label: "Günlük özet (periyodik)", desc: "Her sabah seçtiğin saatte: dünkü satış (kanal kırılımı), bekleyen işler, stok talepleri, sunucu durumu", ready: true },
] as const;
export type TelegramTopic = (typeof TELEGRAM_TOPICS)[number]["key"];

export type TelegramConfig = { enabled: boolean; token: string; chatId: string; topics: Record<string, boolean>; dailyHour: number };

export async function getTelegramConfig(sb: SB): Promise<TelegramConfig> {
  const { data } = await sb.from("settings")
    .select("telegram_enabled, telegram_bot_token, telegram_chat_id, telegram_topics, telegram_daily_hour")
    .order("id", { ascending: true }).limit(1).maybeSingle();
  return {
    enabled: !!data?.telegram_enabled,
    token: String(data?.telegram_bot_token || "").trim(),
    chatId: String(data?.telegram_chat_id || "").trim(),
    topics: (data?.telegram_topics && typeof data.telegram_topics === "object") ? data.telegram_topics : { new_order: true },
    dailyHour: Number.isInteger(data?.telegram_daily_hour) ? data.telegram_daily_hour : 9,
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
const STORE_URL = () => process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
const on = (cfg: TelegramConfig, topic: string) => cfg.enabled && !!cfg.token && !!cfg.chatId && !!cfg.topics?.[topic];

/** Sipariş kimliği (no + müşteri adı) ve test mi — talep / mesaj bildirimleri için. */
async function orderIdentity(sb: SB, orderId: string) {
  const { data: o } = await sb.from("orders")
    .select("id, order_number, external_order_number, channel, customer_name, customer_email, shipping_address, user_id").eq("id", orderId).maybeSingle();
  if (!o) return null;
  let profile: any = null;
  if (o.user_id) profile = (await sb.from("profiles").select("first_name, last_name, email").eq("id", o.user_id).maybeSingle()).data;
  const { data: its } = await sb.from("order_items").select("title, products(title)").eq("order_id", orderId);
  const addr = parseJson(o.shipping_address);
  return {
    no: o.order_number ? `YH${o.order_number}` : o.external_order_number || o.id.slice(0, 8).toUpperCase(),
    name: o.customer_name || addr?.name || [addr?.first_name, addr?.last_name].filter(Boolean).join(" ") || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "—",
    test: isTestEmail(profile?.email) || isTestEmail(o.customer_email)
      || ((its as any[]) || []).some((i) => /^REGRESYON-TEST/.test(String(i.products?.title || i.title || ""))),
    link: `${STORE_URL()}/admin/orders?id=${o.id}`,
  };
}

/** Stok talebi / iade-değişim talebi / müşteri mesajı → mesaj (test kaydı: test=true). */
async function composeRefMessage(sb: SB, topic: string, id: string): Promise<{ text: string; settled: boolean; test: boolean } | null> {
  if (topic === "stock_request") {
    const { data: n } = await sb.from("stock_notifications").select("id, product_id, variant_id, user_id, email, contact_id, created_at").eq("id", id).maybeSingle();
    if (!n) return null;
    const { data: p } = await sb.from("products").select("title").eq("id", n.product_id).maybeSingle();
    const { data: v } = n.variant_id ? await sb.from("product_variants").select("stock, variant_options(value)").eq("id", n.variant_id).maybeSingle() : { data: null };
    let w = sb.from("stock_notifications").select("id", { count: "exact", head: true }).eq("status", "pending").eq("product_id", n.product_id);
    w = n.variant_id ? w.eq("variant_id", n.variant_id) : w.is("variant_id", null);
    const { count: waiting } = await w;
    const { count: allWaiting } = await sb.from("stock_notifications").select("id", { count: "exact", head: true }).eq("status", "pending").eq("product_id", n.product_id);
    let memberEmail: string | null = null;
    if (n.user_id) memberEmail = (await sb.from("profiles").select("email").eq("id", n.user_id).maybeSingle()).data?.email ?? null;
    const test = isTestEmail(n.email) || isTestEmail(memberEmail) || /^REGRESYON-TEST/.test(String(p?.title || ""));
    const size = v?.variant_options?.value;
    const stock = Number(v?.stock ?? 0);
    const text = [
      "🔔 <b>Yeni stok talebi</b>",
      `${esc(p?.title || "Ürün")}${size ? ` · <b>${esc(size)}</b>` : ""}`,
      `Kişi: ${n.user_id ? "üye" : "misafir"}${n.email || memberEmail ? " (e-postalı — stok gelince otomatik haber gider)" : " (e-postasız — elden haber ver)"}`,
      `Bu numarayı bekleyen: <b>${waiting ?? 1}</b> kişi${(allWaiting ?? 0) > (waiting ?? 0) ? ` · ürünün tüm numaraları: ${allWaiting}` : ""}`,
      ...(n.variant_id && stock > 0 ? [`⚠️ Bu numara şu an stokta (${stock}) — haber verilebilir`] : []),
      "",
      `<a href="${STORE_URL()}/admin/crm/stock-notifications">Stok bildirimleri</a>`,
    ].join("\n");
    return { text, settled: true, test };
  }
  if (topic === "after_sale_request") {
    const { data: c } = await sb.from("order_cases").select("id, order_id, kind, reason, customer_note, items, return_method").eq("id", id).maybeSingle();
    if (!c) return null;
    const o = await orderIdentity(sb, c.order_id);
    if (!o) return null;
    const wants = ((c.items as any[]) || []).map((i) => i?.want_label).filter(Boolean);
    const text = [
      `${c.kind === "exchange" ? "🔁 <b>Değişim talebi</b>" : "↩️ <b>İade talebi</b>"}`,
      `<b>${esc(o.no)}</b> — ${esc(o.name)}`,
      ...(c.reason ? [`Sebep: ${esc(c.reason)}`] : []),
      ...(wants.length ? [`İstenen: ${esc(wants.join(", "))}`] : []),
      ...(c.customer_note ? [`Not: <i>${esc(String(c.customer_note).slice(0, 300))}</i>`] : []),
      "",
      `<a href="${o.link}">Siparişi aç</a>`,
    ].join("\n");
    return { text, settled: true, test: o.test };
  }
  if (topic === "customer_message") {
    const { data: m } = await sb.from("messages").select("id, order_id, content, sender_role").eq("id", id).maybeSingle();
    if (!m || m.sender_role !== "user" || !m.order_id) return null;
    const o = await orderIdentity(sb, m.order_id);
    if (!o) return null;
    const text = [
      "💬 <b>Müşteri mesajı</b>",
      `<b>${esc(o.no)}</b> — ${esc(o.name)}`,
      `<i>${esc(String(m.content || "").slice(0, 600))}</i>`,
      "",
      `<a href="${o.link}">Siparişi aç ve yanıtla</a>`,
    ].join("\n");
    return { text, settled: true, test: o.test };
  }
  return null;
}

export async function composeTopicMessage(sb: SB, topic: string, refId: string) {
  return topic === "new_order" ? composeOrderMessage(sb, refId) : composeRefMessage(sb, topic, refId);
}

/** Tek seferlik mesaj (kuyruksuz). dedupeKey verilirse aynı anahtarla ikinci kez gönderilmez. */
async function sendDirect(sb: SB, cfg: TelegramConfig, topic: string, text: string, dedupeKey?: string): Promise<boolean> {
  const row: Record<string, unknown> = { topic, status: "sending", text, locked_at: new Date().toISOString(), ...(dedupeKey ? { dedupe_key: dedupeKey } : {}) };
  const { data: ins, error } = await sb.from("telegram_outbox").insert(row).select("id").maybeSingle();
  if (error || !ins) return false; // aynı dedupe_key zaten var (ya da yazılamadı) → gönderme
  try {
    const messageId = await tgSend(cfg, text);
    await sb.from("telegram_outbox").update({ status: "done", message_id: messageId, sent_at: new Date().toISOString(), done_at: new Date().toISOString() }).eq("id", ins.id);
    return true;
  } catch (e: any) {
    await sb.from("telegram_outbox").update({ status: "failed", error: String(e?.message || e).slice(0, 300), ...(dedupeKey ? { dedupe_key: null } : {}) }).eq("id", ins.id);
    throw e;
  }
}

async function getState(sb: SB, key: string): Promise<string | null> {
  return (await sb.from("telegram_state").select("value").eq("key", key).maybeSingle()).data?.value ?? null;
}
async function setState(sb: SB, key: string, value: string) {
  await sb.from("telegram_state").upsert({ key, value, updated_at: new Date().toISOString() });
}
const short = (s: unknown, n = 160) => esc(String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n));
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

/** Sunucu sağlığı uyarısı (src/lib/server-health-alerts.ts — e-postayla aynı an). Gönderildiyse true. */
export async function notifyServerAlert(sb: SB, subject: string, problems: { key: string; label: string; status: string; value: string; hint: string }[], fresh: string[] = []): Promise<boolean> {
  const cfg = await getTelegramConfig(sb);
  if (!on(cfg, "server_alert")) return false;
  const text = problems.length
    ? [`⚠️ <b>${esc(subject)}</b>`, "", ...problems.map((p) => `${p.status === "fail" ? "🔴" : "🟠"} <b>${esc(p.label)}</b>${fresh.includes(p.key) ? " <i>(yeni)</i>" : ""}\n   ${short(p.value, 200)}${p.hint ? `\n   → ${short(p.hint, 200)}` : ""}`), "", `<a href="${STORE_URL()}/admin">Panoyu aç</a>`].join("\n")
    : `✅ <b>Sunucu sorunları giderildi</b>\nÖnceki uyarıdaki sorunların hepsi düzeldi.`;
  try { return await sendDirect(sb, cfg, "server_alert", text); } catch (e: any) { console.error("[telegram/server_alert]", e?.message || e); return false; }
}

// ─── Entegrasyon hataları (dakikalık tarama) ────────────────────────────────
const ORDER_ERRORS: [string, string][] = [
  ["parasut_error", "Paraşüt faturası"], ["mp_invoice_error", "Pazaryerine fatura yükleme"],
  ["mp_picking_error", "Trendyol “İşleme al”"], ["kargonomi_error", "Kargonomi"],
];
async function scanIntegrationErrors(sb: SB, cfg: TelegramConfig): Promise<number> {
  const nowIso = new Date().toISOString();
  const since = await getState(sb, "integration_error_since");
  if (!since) { await setState(sb, "integration_error_since", nowIso); return 0; } // ilk açılışta eski hatalar yağmasın
  const lines: string[] = [];
  const keys: string[] = [];

  // a) Sipariş bazlı hatalar (aynı sipariş + aynı hata bir kez)
  const { data: os } = await sb.from("orders")
    .select(`id, order_number, external_order_number, updated_at, ${ORDER_ERRORS.map(([c]) => c).join(", ")}`)
    .gt("updated_at", since).or(ORDER_ERRORS.map(([c]) => `${c}.not.is.null`).join(",")).limit(50);
  const cand: { key: string; line: string }[] = [];
  for (const o of (os as any[]) || []) {
    const no = o.order_number ? `YH${o.order_number}` : o.external_order_number || o.id.slice(0, 8);
    for (const [col, label] of ORDER_ERRORS) {
      if (!o[col]) continue;
      cand.push({ key: `ie:${col}:${o.id}:${hash(String(o[col]))}`, line: `✗ <b>${label}</b> · <a href="${STORE_URL()}/admin/orders?id=${o.id}">${esc(no)}</a>\n   ${short(o[col])}` });
    }
  }
  if (cand.length) {
    const { data: seen } = await sb.from("telegram_outbox").select("dedupe_key").in("dedupe_key", cand.map((c) => c.key));
    const seenSet = new Set(((seen as any[]) || []).map((r) => r.dedupe_key));
    for (const c of cand) if (!seenSet.has(c.key)) { lines.push(c.line); keys.push(c.key); }
  }

  // b) Pazaryeri stok gönderimi reddedildi (kanal başına özet)
  const { data: msl } = await sb.from("marketplace_stock_log").select("channel, listing_key, message, created_at")
    .eq("ok", false).gt("created_at", since).order("created_at").limit(200);
  const byCh = new Map<string, any[]>();
  for (const r of (msl as any[]) || []) byCh.set(r.channel, [...(byCh.get(r.channel) || []), r]);
  for (const [ch, rs] of byCh) {
    lines.push(`✗ <b>${esc(MP[ch] || ch)} stok</b>: ${rs.length} gönderim reddedildi\n   ${rs.slice(0, 3).map((r) => `${esc(r.listing_key)} — ${short(r.message, 80)}`).join("\n   ")}`);
  }

  // c) Google Merchant gönderimi hatalı
  const { data: st } = await sb.from("settings").select("gmc_api_enabled").limit(1).maybeSingle();
  if (st?.gmc_api_enabled) {
    const { data: g } = await sb.from("gmc_offers").select("offer_id, error, sent_at").eq("ok", false).gt("sent_at", since).limit(50);
    if ((g as any[])?.length) lines.push(`✗ <b>Google Merchant</b>: ${(g as any[]).length} kalem reddedildi\n   ${(g as any[]).slice(0, 3).map((r) => `${esc(r.offer_id)} — ${short(r.error, 80)}`).join("\n   ")}`);
  }

  if (!lines.length) { await setState(sb, "integration_error_since", nowIso); return 0; }
  const text = ["⚠️ <b>Entegrasyon hatası</b>", "", ...lines.slice(0, 12), ...(lines.length > 12 ? [`… ve ${lines.length - 12} hata daha`] : [])].join("\n");
  await sendDirect(sb, cfg, "integration_error", text);
  // Sipariş hatalarını "bildirildi" işaretle (aynı hata bir daha gelmesin)
  if (keys.length) await sb.from("telegram_outbox").insert(keys.map((k) => ({ topic: "integration_error", status: "done", dedupe_key: k, done_at: nowIso })));
  await setState(sb, "integration_error_since", nowIso);
  return 1;
}

// ─── Günlük özet ────────────────────────────────────────────────────────────
const trDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(ms)); // YYYY-MM-DD
const trHour = (ms: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));

export async function composeDailySummary(sb: SB): Promise<string> {
  const today = trDate(Date.now());
  const start = new Date(`${today}T00:00:00+03:00`).getTime() - 86400_000; // dün 00:00 (TR)
  const end = start + 86400_000;
  const yLabel = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", weekday: "long" }).format(new Date(start + 3600_000));
  const iso = (ms: number) => new Date(ms).toISOString();

  // Dünkü ciro (satış özetiyle aynı kural: ödemesi alınmış, iptal edilmemiş; iade düşülmüş)
  const { data: ords } = await sb.from("orders").select("channel, total_amount, refunded_amount, payment_status, status")
    .gte("created_at", iso(start)).lt("created_at", iso(end)).neq("status", "cancelled");
  const paid = ((ords as any[]) || []).filter((o) => ["paid", "partial_refund", "refunded"].includes(o.payment_status));
  const rev = (o: any) => Math.max(0, Number(o.total_amount || 0) - Math.min(Number(o.refunded_amount || 0), Number(o.total_amount || 0)));
  const byCh = new Map<string, { n: number; t: number }>();
  for (const o of paid) { const k = o.channel || "site"; const b = byCh.get(k) || { n: 0, t: 0 }; b.n++; b.t += rev(o); byCh.set(k, b); }
  const { data: chs } = await sb.from("sales_channels").select("code, label");
  const chLabel = (k: string) => ((chs as any[]) || []).find((c) => c.code === k)?.label || MP[k] || (k === "site" ? "YeriHisset" : k);
  const order = ["site", "trendyol", "hepsiburada"];
  const chRows = [...byCh.entries()].sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
    .map(([k, b]) => `   ${esc(chLabel(k))}: ${tl(b.t)} (${b.n})`);
  const unpaidNew = ((ords as any[]) || []).filter((o) => o.payment_status === "pending").length;

  // Bekleyen işler
  const cnt = async (q: any) => (await q).count ?? 0;
  const head = () => sb.from("orders").select("id", { count: "exact", head: true });
  const awaitingTransfer = await cnt(head().eq("payment_method", "bank_transfer").eq("payment_status", "pending").neq("status", "cancelled").is("import_source", null));
  const toShip = await cnt(head().in("payment_status", ["paid", "partial_refund"]).neq("status", "cancelled").in("shipment_status", ["waiting", "preparing"]).eq("channel", "site").is("import_source", null));
  const mpToShip = await cnt(head().neq("channel", "site").neq("status", "cancelled").in("shipment_status", ["waiting", "preparing"]).is("import_source", null));
  const openCases = await cnt(sb.from("order_cases").select("id", { count: "exact", head: true }).is("closed_at", null));
  const mpReturns = await cnt(head().in("mp_claim_state", ["in_transit", "arrived", "accepted"]));
  const unreadMsg = await cnt(sb.from("messages").select("id", { count: "exact", head: true }).eq("sender_role", "user").eq("is_read", false));
  const stockWaiting = await cnt(sb.from("stock_notifications").select("id", { count: "exact", head: true }).eq("status", "pending"));
  const stockNew = await cnt(sb.from("stock_notifications").select("id", { count: "exact", head: true }).gte("created_at", iso(start)).lt("created_at", iso(end)));
  const invErr = await cnt(head().not("parasut_error", "is", null).eq("invoice_status", "pending").neq("status", "cancelled"));

  let health = "";
  try {
    const { getServerHealth } = await import("@/lib/server-health");
    const h = await getServerHealth(sb);
    const bad = h.checks.filter((c: any) => c.status !== "ok");
    health = bad.length ? `🟠 Sunucu: ${bad.slice(0, 3).map((c: any) => esc(c.label)).join(", ")}${bad.length > 3 ? "…" : ""}` : "🟢 Sunucu: sağlıklı";
  } catch { /* sağlık okunamadı — özet yine gider */ }

  const todo = [
    awaitingTransfer && `💳 Ödemesi beklenen havale: <b>${awaitingTransfer}</b>`,
    toShip && `📦 Kargolanacak site siparişi: <b>${toShip}</b>`,
    mpToShip && `📦 Kargolanacak pazaryeri siparişi: <b>${mpToShip}</b>`,
    (openCases || mpReturns) && `↩️ Açık iade / değişim: <b>${openCases + mpReturns}</b>`,
    unreadMsg && `💬 Okunmamış müşteri mesajı: <b>${unreadMsg}</b>`,
    invErr && `🧾 Fatura hatası olan sipariş: <b>${invErr}</b>`,
  ].filter(Boolean) as string[];

  return [
    `☀️ <b>Günlük özet</b> · ${esc(yLabel)}`,
    "",
    `<b>Dünkü satış:</b> ${tl(paid.reduce((a, o) => a + rev(o), 0))} · ${paid.length} sipariş`,
    ...chRows,
    ...(unpaidNew ? [`   + ${unpaidNew} sipariş ödeme bekliyor`] : []),
    "",
    "<b>Bekleyen işler</b>",
    ...(todo.length ? todo : ["✓ Bekleyen iş yok"]),
    "",
    `🔔 Stok talebi: <b>${stockWaiting}</b> kişi bekliyor${stockNew ? ` (dün +${stockNew})` : ""}`,
    ...(health ? [health] : []),
    "",
    `<a href="${STORE_URL()}/admin">Panoyu aç</a>`,
  ].join("\n");
}

async function maybeDailySummary(sb: SB, cfg: TelegramConfig): Promise<number> {
  const now = Date.now();
  if (trHour(now) < cfg.dailyHour) return 0;
  const today = trDate(now);
  if ((await getState(sb, "daily_summary_date")) === today) return 0;
  await setState(sb, "daily_summary_date", today); // önce işaretle: hata olsa da aynı gün tekrar tekrar denemesin
  await sendDirect(sb, cfg, "daily_summary", await composeDailySummary(sb), `daily:${today}`);
  return 1;
}

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
  const storeUrl = STORE_URL();

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
      const msg = r.ref_id ? await composeTopicMessage(sb, r.topic, r.ref_id) : null;
      if (!msg || msg.test) {
        await sb.from("telegram_outbox").update({ status: "skipped", error: !msg ? "Kayıt bulunamadı" : "Test kaydı", done_at: iso(Date.now()) }).eq("id", r.id);
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

  // 3) Dönemsel: entegrasyon hataları (her çalışmada) + günlük özet (seçilen saatte, günde bir)
  if (on(cfg, "integration_error")) {
    try { out.sent += await scanIntegrationErrors(sb, cfg); } catch (e: any) { out.errors.push(`entegrasyon hatası taraması: ${e?.message || e}`); }
  } else await sb.from("telegram_state").delete().eq("key", "integration_error_since"); // tekrar açılınca eski hatalar gelmesin
  if (on(cfg, "daily_summary")) {
    try { out.sent += await maybeDailySummary(sb, cfg); } catch (e: any) { out.errors.push(`günlük özet: ${e?.message || e}`); }
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
