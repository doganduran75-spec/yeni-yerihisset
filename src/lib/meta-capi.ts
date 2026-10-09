/* eslint-disable @typescript-eslint/no-explicit-any */
// META CONVERSIONS API — satın almayı SUNUCUDAN Meta'ya bildirir (tarayıcı Pixel'ini iOS /
// reklam engelleyici kaçırsa da satış sayılır). Tarayıcıdaki Purchase ile aynı event_id
// (`purchase_<sipariş>`) → Meta ikisini tek satış sayar.
//
// KVKK: yalnız müşteri çerezlere "Kabul Et" dediyse gönderilir (sipariş isteğindeki adContext.consent).
// Kişisel veri (e-posta, telefon, ad) Meta'ya yalnız SHA-256 özetiyle gider. IP/tarayıcı bilgisi
// siparişte geçici durur (orders.attribution.meta) ve gönderimden sonra silinir.
// Test siparişleri (@….test) hiç gönderilmez.
//
// Ne zaman: havale → sipariş anında (GA purchase ile aynı an); kart → iyzico ödemeyi onaylayınca;
// tamamı krediyle ödenen → sipariş anında.
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isTestEmail } from "@/lib/mail-guard";
import { clientIp } from "@/lib/rate-limit";

const GRAPH = "https://graph.facebook.com/v23.0";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing"] as const;

/**
 * Sipariş isteğindeki adContext'i (src/lib/ad-context.ts › getAdContext) doğrulayıp
 * orders.attribution'a yazılacak biçime getirir. Bozuk/eksikse null.
 */
export function readAdContext(body: any, req: NextRequest): Record<string, any> | null {
  const ctx = body?.adContext;
  if (!ctx || typeof ctx !== "object") return null;
  const out: Record<string, any> = {};

  const s = ctx.source && typeof ctx.source === "object" ? ctx.source : null;
  if (s) {
    const source: Record<string, any> = {};
    for (const k of SOURCE_KEYS) { const v = str(s[k], 150); if (v) source[k] = v; }
    if (s.fbclid) source.fbclid = true;   // reklam tıklaması (kimliğin kendisi saklanmaz)
    if (s.gclid) source.gclid = true;
    if (Object.keys(source).length) out.source = source;
  }

  if (ctx.consent === true && ctx.meta && typeof ctx.meta === "object") {
    const fbp = str(ctx.meta.fbp, 100);
    const fbc = str(ctx.meta.fbc, 600);
    out.meta = {
      fbp: fbp && /^fb\.\d\.\d+\.\d+$/.test(fbp) ? fbp : undefined,
      fbc: fbc && /^fb\.\d\.\d+\.\S+$/.test(fbc) ? fbc : undefined,
      url: str(ctx.meta.url, 300),
      ua: str(req.headers.get("user-agent"), 400),
      ip: clientIp(req) !== "unknown" ? clientIp(req) : undefined,
    };
  }
  return Object.keys(out).length ? out : null;
}

type Result = { status: "sent" | "skipped" | "failed"; error?: string };

/** Siparişin Purchase olayını Conversions API'ye gönderir; sonucu attribution.capi'ye yazar, meta'yı siler. */
export async function sendMetaPurchaseFromOrder(orderId: string): Promise<Result> {
  const sb = createAdminClient() as any;
  const { data: o } = await sb.from("orders")
    .select("id, user_id, total_amount, attribution, order_items(product_id, quantity, unit_price)")
    .eq("id", orderId).maybeSingle();
  if (!o?.attribution?.meta) return { status: "skipped", error: "çerez onayı yok" };

  const meta = o.attribution.meta;
  const finish = async (capi: Record<string, unknown>, r: Result) => {
    const { meta: _drop, ...rest } = o.attribution || {}; // eslint-disable-line @typescript-eslint/no-unused-vars
    await sb.from("orders").update({ attribution: { ...rest, capi: { ...capi, at: new Date().toISOString() } } }).eq("id", orderId);
    return r;
  };

  const { data: st } = await sb.from("settings").select("meta_pixel_id, meta_capi_token, meta_test_event_code").order("id").limit(1).maybeSingle();
  const pixel = str(st?.meta_pixel_id, 30);
  const token = str(st?.meta_capi_token, 1000);
  if (!pixel || !token) return finish({ status: "skipped", reason: "Meta ayarları boş" }, { status: "skipped", error: "ayar yok" });

  const { data: prof } = await sb.from("profiles").select("email, phone, first_name, last_name").eq("id", o.user_id).maybeSingle();
  if (isTestEmail(prof?.email)) return finish({ status: "skipped", reason: "test siparişi" }, { status: "skipped", error: "test" });

  const lower = (v?: string | null) => (v || "").trim().toLocaleLowerCase("tr-TR");
  const digits = String(prof?.phone || "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `90${digits}` : digits.length === 11 && digits.startsWith("0") ? `9${digits}` : digits;
  const items = (o.order_items as any[]) || [];

  const user_data: Record<string, unknown> = {
    ...(prof?.email ? { em: [sha(lower(prof.email))] } : {}),
    ...(phone.length >= 11 ? { ph: [sha(phone)] } : {}),
    ...(prof?.first_name ? { fn: [sha(lower(prof.first_name))] } : {}),
    ...(prof?.last_name ? { ln: [sha(lower(prof.last_name))] } : {}),
    country: [sha("tr")],
    external_id: [sha(String(o.user_id))],
    ...(meta.ip ? { client_ip_address: meta.ip } : {}),
    ...(meta.ua ? { client_user_agent: meta.ua } : {}),
    ...(meta.fbp ? { fbp: meta.fbp } : {}),
    ...(meta.fbc ? { fbc: meta.fbc } : {}),
  };
  const event = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: `purchase_${orderId}`,
    action_source: "website",
    ...(meta.url ? { event_source_url: meta.url } : {}),
    user_data,
    custom_data: {
      currency: "TRY",
      value: Number(o.total_amount) || 0,
      content_type: "product_group",
      content_ids: [...new Set(items.map((i) => String(i.product_id)))],
      contents: items.map((i) => ({ id: String(i.product_id), quantity: Number(i.quantity), item_price: Number(i.unit_price) })),
      num_items: items.reduce((n, i) => n + Number(i.quantity || 0), 0),
      order_id: orderId,
    },
  };

  try {
    const res = await fetch(`${GRAPH}/${pixel}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token, data: [event], ...(str(st?.meta_test_event_code, 50) ? { test_event_code: str(st.meta_test_event_code, 50) } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = String(j?.error?.message || `HTTP ${res.status}`).slice(0, 200);
      console.error("[meta-capi]", orderId, err);
      return finish({ status: "failed", error: err }, { status: "failed", error: err });
    }
    return finish({ status: "sent", test: !!str(st?.meta_test_event_code, 50) }, { status: "sent" });
  } catch (e: any) {
    const err = String(e?.message || e).slice(0, 200);
    console.error("[meta-capi]", orderId, err);
    return finish({ status: "failed", error: err }, { status: "failed", error: err });
  }
}
