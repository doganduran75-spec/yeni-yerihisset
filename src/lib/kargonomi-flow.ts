/* eslint-disable @typescript-eslint/no-explicit-any */
// KARGO ENTEGRASYONU AKIŞI (kullanıcının akışı, 2026-10-13) — iki sağlayıcı, aynı adımlar:
//   1) "Kargoya ver" → desi → taslak gönderi + firma teklifleri (quoteOrder)
//   2) Yönetici firmayı seçer → onay (confirmOrder) → kargo kodu (Basit Kargo hemen; Kargonomi'de birkaç sn – 10+ dk)
//   3) Kod beklenirken dakikada bir sorgu (pollKargonomi; cron) + siparişte "Şimdi sorgula"
//   4) Kod gelince: kod + firma kaydedilir (Kargoda YAPILMAZ — etiket → "Paket hazır" → kurye alınca "Kurye aldı")
//   Basit Kargo ayrıca durum bildirir (webhook + saatlik sorgu): kargoda → "Kurye aldı" ile aynı (Kargoda + e-posta),
//   teslim → Teslim edildi + e-posta, sorunlu durum (iade yolunda, kayıp, destek) → siparişe hata (bekleyen işler / Telegram).
// Sağlayıcı: ayarlarda Basit Kargo açık + token varsa yeni gönderiler Basit Kargo'dan (kullanıcı 2026-11-03); siparişteki
// gönderinin sağlayıcısı orders.kargo_api (NULL = kargonomi). Siparişin kargonomi_* alanları iki sağlayıcıda ortak.
// Kod gelmeden sipariş kargolanmış sayılmaz (stok / iptal kuralları değişmez).

import { createAdminClient } from "@/lib/supabase-admin";
import {
  KargonomiError, createShipment, getOffers, confirmProvider, getShipment, cancelShipment,
  findStateId, findCityId, stateCount, trackingOf, phone10, FAILED_STATUSES, type KargonomiOffer,
} from "@/lib/kargonomi";
import * as bk from "@/lib/basitkargo";
import { markPickedUp, markDelivered } from "@/lib/order-ship-events";

type Sb = ReturnType<typeof createAdminClient>;
type Provider = "kargonomi" | "basitkargo";
const SHIPPED = ["shipped", "delivered", "undelivered", "returned"];
const WAIT_DAYS = 3; // bu süreden sonra otomatik kod sorgusu durur (siparişte "Şimdi sorgula" çalışır)
const TRACK_DAYS = 30; // Basit Kargo: kargodaki gönderinin durumu bu süre boyunca saatte bir sorgulanır (webhook yedeği)
export const PROVIDER_NAME: Record<Provider, string> = { kargonomi: "Kargonomi", basitkargo: "Basit Kargo" };

export async function cargoConfig(sb: Sb) {
  const { data } = await (sb as any).from("settings")
    .select("kargonomi_enabled, kargonomi_api_token, kargonomi_warehouse_id, basitkargo_enabled, basitkargo_api_token, basitkargo_address_id")
    .order("id").limit(1).maybeSingle();
  const basit = {
    enabled: data?.basitkargo_enabled === true,
    token: String(data?.basitkargo_api_token || "").trim(),
    addressId: String(data?.basitkargo_address_id || "").trim(),
  };
  const kargonomi = {
    enabled: data?.kargonomi_enabled !== false,
    token: String(data?.kargonomi_api_token || process.env.KARGONOMI_API_TOKEN || "").trim(),
    warehouseId: Number(String(data?.kargonomi_warehouse_id || process.env.KARGONOMI_WAREHOUSE_ID || "").trim()) || 0,
  };
  const active: Provider = basit.enabled && basit.token ? "basitkargo" : "kargonomi";
  return { basit, kargonomi, active };
}
/** Eski ad (geriye uyum) */
export const kargonomiConfig = async (sb: Sb) => (await cargoConfig(sb)).kargonomi;

type Cfg = Awaited<ReturnType<typeof cargoConfig>>;
function ready(c: Cfg, p: Provider) {
  if (p === "basitkargo") {
    if (!c.basit.enabled) throw new KargonomiError(400, "Basit Kargo kapalı (Ayarlar › Entegrasyonlar › Basit Kargo).");
    if (!c.basit.token) throw new KargonomiError(400, "Basit Kargo API token girilmemiş (Ayarlar › Entegrasyonlar › Basit Kargo).");
    return;
  }
  if (!c.kargonomi.enabled) throw new KargonomiError(400, "Kargonomi kapalı (Ayarlar › Entegrasyonlar).");
  if (!c.kargonomi.token) throw new KargonomiError(400, "Kargonomi API token girilmemiş (Ayarlar › Entegrasyonlar › Kargonomi).");
  if (!c.kargonomi.warehouseId) throw new KargonomiError(400, "Kargonomi Depo ID girilmemiş (Ayarlar › Entegrasyonlar › Kargonomi).");
}

const ORDER_COLS = "id, order_number, user_id, channel, status, payment_status, payment_method, total_amount, shipment_status, shipping_address, customer_name, customer_phone, customer_email, cargo_tracking_number, kargo_api, kargonomi_shipment_id, kargonomi_tracking_code, kargonomi_status, kargonomi_desi, kargonomi_confirmed_at, kargonomi_error, profiles(first_name, last_name, phone, email), order_items(title, variant_name, quantity, sku, products(title))";

async function loadOrder(sb: Sb, orderId: string) {
  const { data, error } = await (sb as any).from("orders").select(ORDER_COLS).eq("id", orderId).maybeSingle();
  if (error || !data) throw new KargonomiError(404, "Sipariş bulunamadı.");
  return data;
}
const providerOfOrder = (o: any): Provider => (o.kargo_api === "basitkargo" ? "basitkargo" : "kargonomi");
const update = (sb: Sb, id: string, fields: Record<string, unknown>) => (sb as any).from("orders").update(fields).eq("id", id);
const note = (sb: Sb, id: string, t: string) => (sb as any).from("order_events").insert({ order_id: id, type: "note", note: t.slice(0, 400), created_by: null });

/** Kullanıma hazır sağlayıcılar (açık + token; Kargonomi'de depo da) */
function availableOf(c: Cfg): Provider[] {
  return (["basitkargo", "kargonomi"] as Provider[]).filter((p) => { try { ready(c, p); return true; } catch { return false; } });
}

/** Pencere için: varsayılan sağlayıcı + hazır olanlar (ikisi de hazırsa siparişte seçilir) */
export async function activeProvider(sb: Sb) {
  const c = await cargoConfig(sb);
  return { provider: c.active, name: PROVIDER_NAME[c.active], available: availableOf(c).map((p) => ({ provider: p, name: PROVIDER_NAME[p] })) };
}

/** Ayarlar › Kargonomi "Bağlantıyı test et": kayıtlı token ile il listesi okunur (gönderi açılmaz) */
export async function testKargonomi(sb: Sb) {
  const c = await cargoConfig(sb);
  if (!c.kargonomi.token) throw new KargonomiError(400, "Kargonomi API token kaydedilmemiş — önce token'ı girip Kaydet'e bas.");
  const states = await stateCount(c.kargonomi.token);
  if (!states) throw new KargonomiError(502, "Kargonomi bağlandı ama il listesi boş döndü.");
  return { states, enabled: c.kargonomi.enabled, warehouse: c.kargonomi.warehouseId || null };
}

/** Alıcı bilgileri (iki sağlayıcıda aynı kontroller) */
function recipient(o: any) {
  let addr: any = {};
  try { addr = typeof o.shipping_address === "string" ? JSON.parse(o.shipping_address) : o.shipping_address || {}; } catch { /* boş */ }
  const p = o.profiles || {};
  const name = String(addr.name || o.customer_name || [p.first_name, p.last_name].filter(Boolean).join(" ")).trim();
  const phone = phone10(addr.phone || o.customer_phone || p.phone);
  const address = String(addr.address || "").trim();
  if (name.split(/\s+/).length < 2 || name.length < 5) throw new KargonomiError(422, "Alıcı adı soyadıyla birlikte olmalı (sipariş adresi).");
  if (phone.length !== 10) throw new KargonomiError(422, "Alıcı telefonu 10 haneli olmalı (sipariş adresi).");
  if (address.length < 10) throw new KargonomiError(422, "Açık adres çok kısa (sipariş adresi).");
  if (!addr.city || !addr.district) throw new KargonomiError(422, "Sipariş adresinde il / ilçe eksik.");
  return { name, phone, address, city: String(addr.city), district: String(addr.district), email: o.customer_email || p.email || null };
}

/** Taslağı sağlayıcıda sil (firma seçilmemiş) — hata yutulur */
async function dropDraft(c: Cfg, p: Provider, shipmentId: string) {
  if (p === "basitkargo") await bk.deleteOrder(c.basit.token, shipmentId).catch(() => {});
  else await cancelShipment(c.kargonomi.token, shipmentId, true).catch(() => {});
}

/** 1) Taslak gönderi + teklifler. Aynı sağlayıcı + desiyle açık taslak varsa yeniden kullanılır. */
export async function quoteOrder(sb: Sb, orderId: string, desi: number, want?: string): Promise<{ offers: KargonomiOffer[]; shipmentId: string; provider: Provider }> {
  if (!(desi > 0 && desi <= 1000)) throw new KargonomiError(400, "Geçerli bir desi gir.");
  const c = await cargoConfig(sb);
  const o = await loadOrder(sb, orderId);
  if (o.kargonomi_tracking_code) throw new KargonomiError(409, "Bu siparişin kargo kodu zaten var.");
  if (o.kargonomi_confirmed_at) throw new KargonomiError(409, "Kargo firması seçildi — önce iptal et.");
  if (o.status === "cancelled" || SHIPPED.includes(o.shipment_status || "")) throw new KargonomiError(409, "Bu sipariş kargoya verilemez (iptal ya da zaten kargolanmış).");
  if (o.payment_status !== "paid") throw new KargonomiError(409, "Ödemesi alınmamış sipariş kargoya verilemez.");
  // İkisi de hazırsa pencerede seçilen sağlayıcı; seçilmediyse varsayılan (Basit Kargo açıksa o)
  const p: Provider = want === "basitkargo" || want === "kargonomi" ? want : c.active;
  ready(c, p);

  let shipmentId = o.kargonomi_shipment_id as string | null;
  // Desi ya da sağlayıcı değiştiyse eski taslağı sil, yenisini aç
  if (shipmentId && (Number(o.kargonomi_desi) !== desi || providerOfOrder(o) !== p)) {
    await dropDraft(c, providerOfOrder(o), shipmentId);
    shipmentId = null;
  }
  if (!shipmentId) {
    const r = recipient(o);
    const ref = o.order_number ? `YH${o.order_number}` : String(o.id).slice(0, 8);
    if (p === "basitkargo") {
      const items = ((o.order_items as any[]) || []).map((i) => ({
        name: String(i.products?.title || i.title || "Ürün").slice(0, 120) + (i.variant_name ? ` (${i.variant_name})` : ""),
        ...(i.sku ? { code: String(i.sku) } : {}), quantity: Number(i.quantity) || 1,
      }));
      const created = await bk.createOrder(c.basit.token, {
        orderTotal: Number(o.total_amount) || 0,
        orderPaymentType: o.payment_method === "bank_transfer" ? "BANK_TRANSFER" : o.payment_method === "iyzico" ? "CREDIT_CARD" : "OTHER",
        ...(c.basit.addressId ? { addressId: c.basit.addressId } : {}),
        content: { name: ref, code: ref, items: items.length ? items : [{ name: ref, quantity: 1 }], packages: [bk.packageOf(desi)] },
        client: { name: r.name.slice(0, 255), phone: r.phone, ...(r.email ? { email: r.email } : {}), city: r.city, town: r.district, address: r.address.slice(0, 500) },
      });
      shipmentId = created.id;
      await update(sb, orderId, { kargonomi_shipment_id: shipmentId, kargo_api: p, kargonomi_status: created.status || "NEW", kargonomi_desi: desi, kargonomi_error: null });
    } else {
      const stateId = await findStateId(c.kargonomi.token, r.city);
      const cityId = await findCityId(c.kargonomi.token, stateId, r.district);
      const sh = await createShipment(c.kargonomi.token, {
        buyer_name: r.name.slice(0, 255), buyer_phone: r.phone, buyer_address: r.address.slice(0, 512),
        ...(r.email ? { buyer_email: r.email } : {}),
        buyer_state_id: stateId, buyer_city_id: cityId, warehouse_id: c.kargonomi.warehouseId, desi, content: ref,
      });
      shipmentId = String(sh.id);
      await update(sb, orderId, { kargonomi_shipment_id: shipmentId, kargo_api: p, kargonomi_status: sh.status || "draft", kargonomi_desi: desi, kargonomi_error: null });
    }
  }
  const offers = p === "basitkargo" ? await bk.getFees(c.basit.token, shipmentId) : await getOffers(c.kargonomi.token, shipmentId);
  await update(sb, orderId, { kargonomi_offers: offers, kargonomi_checked_at: new Date().toISOString() });
  return { offers, shipmentId, provider: p };
}

/** 2) Seçilen firmayla onayla → kod (Basit Kargo hemen; Kargonomi'de beklenir, hemen bir kez sorgulanır) */
export async function confirmOrder(sb: Sb, orderId: string, providerId: string) {
  const c = await cargoConfig(sb);
  const o = await loadOrder(sb, orderId);
  const p = providerOfOrder(o);
  ready(c, p);
  if (!o.kargonomi_shipment_id) throw new KargonomiError(409, "Önce teklif al.");
  if (o.kargonomi_confirmed_at) throw new KargonomiError(409, "Kargo firması zaten seçildi.");
  const { data: cur } = await (sb as any).from("orders").select("kargonomi_offers").eq("id", orderId).maybeSingle();
  const offer = ((cur?.kargonomi_offers as KargonomiOffer[]) || []).find((x) => x.id === String(providerId));
  if (!offer) throw new KargonomiError(400, "Seçilen firma tekliflerde yok — teklifleri yenile.");
  if (offer.id !== "-1" && offer.amount == null) throw new KargonomiError(400, `${offer.name} bu adrese hizmet vermiyor.`);

  if (p === "basitkargo") {
    // Önce siparişte "seçildi" diye işaretle (iki tıklamada iki barkod olmasın); barkod alınamazsa geri al
    const { data: claimed } = await (sb as any).from("orders").update({ kargonomi_confirmed_at: new Date().toISOString(), kargonomi_provider: offer.name, kargonomi_error: null })
      .eq("id", orderId).is("kargonomi_confirmed_at", null).select("id");
    if (!claimed?.length) throw new KargonomiError(409, "Kargo firması zaten seçildi.");
    try {
      const res = await bk.createBarcode(c.basit.token, o.kargonomi_shipment_id, offer.id, crypto.randomUUID());
      await update(sb, orderId, { kargonomi_status: res?.status || "READY_TO_SHIP", kargonomi_provider: bk.providerOf(res) || offer.name });
    } catch (e) {
      await update(sb, orderId, { kargonomi_confirmed_at: null, kargonomi_provider: null });
      throw e;
    }
    return checkOrder(sb, orderId);
  }

  const sh = await confirmProvider(c.kargonomi.token, o.kargonomi_shipment_id, offer.id);
  await update(sb, orderId, {
    kargonomi_confirmed_at: new Date().toISOString(), kargonomi_status: sh?.status || "ready",
    kargonomi_provider: sh?.shipping_provider_name || (offer.id === "-1" ? null : offer.name), kargonomi_error: null,
  });
  return checkOrder(sb, orderId);
}

/** Taslağı sil / gönderiyi iptal et → sipariş yeniden teklif alabilir.
 *  Basit Kargo: kurye almadıysa barkod iptal edilir (ücret iade), kod siparişten silinir. */
export async function cancelOrderShipment(sb: Sb, orderId: string) {
  const c = await cargoConfig(sb);
  const o = await loadOrder(sb, orderId);
  if (!o.kargonomi_shipment_id) return { ok: true };
  const p = providerOfOrder(o);
  ready(c, p);
  const clear: Record<string, unknown> = {
    kargonomi_shipment_id: null, kargonomi_status: null, kargonomi_provider: null, kargonomi_offers: null,
    kargonomi_desi: null, kargonomi_confirmed_at: null, kargonomi_error: null, kargo_api: null,
  };
  if (p === "basitkargo") {
    if (SHIPPED.includes(o.shipment_status || "")) throw new KargonomiError(409, "Sipariş kargoda — iptal Basit Kargo panelinden.");
    if (o.kargonomi_confirmed_at) {
      const cur = await bk.getOrder(c.basit.token, o.kargonomi_shipment_id).catch((e) => { if (e instanceof bk.BasitKargoError && e.status === 404) return null; throw e; });
      if (cur && !["NEW", "READY_TO_SHIP"].includes(String(cur.status))) throw new KargonomiError(409, `Gönderi ${bk.STATUS_LABEL[String(cur.status)] || cur.status} — iptal Basit Kargo panelinden.`);
      if (cur?.barcode && cur.status === "READY_TO_SHIP") await bk.cancelBarcode(c.basit.token, cur.barcode);
    }
    await bk.deleteOrder(c.basit.token, o.kargonomi_shipment_id).catch((e) => { if (!(e instanceof bk.BasitKargoError && e.status === 404)) throw e; });
    // Kod bu gönderiden geldiyse siparişten de sil (elle girilmiş başka kod kalır)
    if (o.kargonomi_tracking_code) {
      clear.kargonomi_tracking_code = null;
      if (o.cargo_tracking_number === o.kargonomi_tracking_code) { clear.cargo_tracking_number = null; clear.cargo_provider = null; }
      await note(sb, orderId, `Basit Kargo gönderisi iptal edildi (kod ${o.kargonomi_tracking_code})`);
    }
    await update(sb, orderId, clear);
    return { ok: true, cancelRequested: false };
  }
  if (o.kargonomi_tracking_code) throw new KargonomiError(409, "Kargo kodu gelmiş — sipariş kargoda; iptal Kargonomi panelinden.");
  const draft = !o.kargonomi_confirmed_at;
  try { await cancelShipment(c.kargonomi.token, o.kargonomi_shipment_id, draft); }
  catch (e: any) { if (!(e instanceof KargonomiError && e.status === 404)) throw e; } // Kargonomi'de zaten yok
  await update(sb, orderId, clear);
  return { ok: true, cancelRequested: !draft };
}

/** 3) Tek siparişin gönderisini sorgula; kod geldiyse siparişe yaz. Basit Kargo'da durum da işlenir. */
export async function checkOrder(sb: Sb, orderId: string) {
  const c = await cargoConfig(sb);
  const o = await loadOrder(sb, orderId);
  if (!o.kargonomi_shipment_id) return { tracking: o.kargonomi_tracking_code ?? null, status: o.kargonomi_status };
  if (providerOfOrder(o) === "basitkargo") {
    if (!c.basit.token) throw new KargonomiError(400, "Basit Kargo API token girilmemiş.");
    const cur = await bk.getOrder(c.basit.token, o.kargonomi_shipment_id);
    return applyBasitState(sb, o, cur);
  }
  if (o.kargonomi_tracking_code) return { tracking: o.kargonomi_tracking_code, status: o.kargonomi_status };
  if (!c.kargonomi.token) throw new KargonomiError(400, "Kargonomi API token girilmemiş.");
  const sh = await getShipment(c.kargonomi.token, o.kargonomi_shipment_id);
  const tracking = trackingOf(sh);
  const failed = FAILED_STATUSES.includes(String(sh.status || ""));
  await update(sb, orderId, {
    kargonomi_status: sh.status ?? o.kargonomi_status, kargonomi_checked_at: new Date().toISOString(),
    ...(sh.shipping_provider_name ? { kargonomi_provider: sh.shipping_provider_name } : {}),
    kargonomi_error: failed ? `${sh.status_label || sh.status} — iptal edip yeniden teklif al` : null,
  });
  if (tracking && !failed) await markTracking(sb, o, tracking, String(sh.shipping_provider_name || ""));
  return { tracking, status: sh.status ?? null, provider: sh.shipping_provider_name ?? null, failed };
}

/** Basit Kargo durumu → sipariş (sorgu ve webhook ortak). Yük değil API'den okunan gönderi işlenir. */
export async function applyBasitState(sb: Sb, o: any, cur: bk.BkOrder) {
  const status = String(cur.status || "");
  const tracking = bk.trackingOf(cur);
  const provider = bk.providerOf(cur);
  const label = bk.STATUS_LABEL[status] || status;
  const problem = bk.PROBLEM_STATUSES.includes(status);
  await update(sb, o.id, {
    kargonomi_status: status || o.kargonomi_status, kargonomi_checked_at: new Date().toISOString(),
    ...(provider ? { kargonomi_provider: provider } : {}),
    kargonomi_error: problem ? `Basit Kargo: ${label} — Basit Kargo panelinden kontrol et` : null,
  });
  if (problem && o.kargonomi_status !== status) await note(sb, o.id, `Basit Kargo: ${label}`);
  if (tracking && !o.kargonomi_tracking_code) await markTracking(sb, o, tracking, provider || "");
  if (bk.MOVING_STATUSES.includes(status)) await markPickedUp(sb, o.id, `Basit Kargo: ${label} — sipariş kargoda`);
  if (status === "DELIVERED") await markDelivered(sb, o.id, "Basit Kargo: teslim edildi");
  return { tracking: tracking ?? o.kargonomi_tracking_code ?? null, status, provider, failed: problem };
}

/** Kod geldi: kod + firma siparişe yazılır (yalnız ilk kez — koşullu güncelleme). Sipariş "Kargoda" YAPILMAZ ve
 *  e-posta GİTMEZ ("Paket hazır" akışı, 2026-10-24): etiket basılır → "Paket hazır" → kurye alınca "Kurye aldı"
 *  (/api/admin/orders/ship-flow ya da Basit Kargo "kargoda" bildirimi) → Kargoda + kargo e-postası o an. */
async function markTracking(sb: Sb, o: any, tracking: string, provider: string) {
  await (sb as any).from("orders")
    .update({ kargonomi_tracking_code: tracking, cargo_tracking_number: tracking, ...(provider ? { cargo_provider: provider } : {}) })
    .eq("id", o.id).is("kargonomi_tracking_code", null);
}

/** Basit Kargo iade kodu (teslim edilmiş gönderi) — iade / değişim talebinde müşteriye gönderilecek kod */
export async function basitReturnCode(sb: Sb, orderId: string) {
  const c = await cargoConfig(sb);
  const o = await loadOrder(sb, orderId);
  if (providerOfOrder(o) !== "basitkargo" || !o.kargonomi_shipment_id) throw new KargonomiError(409, "Bu sipariş Basit Kargo ile gönderilmedi — iade kodunu kargo panelinden al.");
  if (!c.basit.token) throw new KargonomiError(400, "Basit Kargo API token girilmemiş.");
  const cur = await bk.getOrder(c.basit.token, o.kargonomi_shipment_id);
  if (!cur.barcode) throw new KargonomiError(409, "Gönderinin Basit Kargo barkodu yok.");
  const r = await bk.createReturnCode(c.basit.token, cur.barcode);
  if (!r.code) throw new KargonomiError(502, "Basit Kargo iade kodu dönmedi — Basit Kargo panelinden kontrol et.");
  await note(sb, orderId, `Basit Kargo iade kodu alındı: ${r.code}`);
  return { code: r.code };
}

/** Cron (dakikada bir): firma seçilmiş, kodu gelmemiş siparişler + (Basit Kargo) kargodaki gönderilerin saatlik durumu */
export async function pollKargonomi(sb: Sb = createAdminClient()) {
  const since = new Date(Date.now() - WAIT_DAYS * 86400_000).toISOString();
  const { data } = await (sb as any).from("orders").select("id, kargonomi_status")
    .not("kargonomi_shipment_id", "is", null).is("kargonomi_tracking_code", null)
    .gte("kargonomi_confirmed_at", since).limit(30);
  const waiting = ((data as any[]) || []).filter((r) => !FAILED_STATUSES.includes(r.kargonomi_status || ""));
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: moving } = await (sb as any).from("orders").select("id")
    .eq("kargo_api", "basitkargo").not("kargonomi_tracking_code", "is", null)
    .not("shipment_status", "in", "(delivered,undelivered,returned,cancelled)").neq("status", "cancelled")
    .gte("kargonomi_confirmed_at", new Date(Date.now() - TRACK_DAYS * 86400_000).toISOString())
    .or(`kargonomi_checked_at.is.null,kargonomi_checked_at.lt.${hourAgo}`).limit(20);
  const rows = [...waiting, ...((moving as any[]) || [])];
  if (!rows.length) return { checked: 0, shipped: 0, errors: [] as string[] };
  let shipped = 0;
  const errors: string[] = [];
  for (const r of rows) {
    try { if ((await checkOrder(sb, r.id)).tracking) shipped++; }
    catch (e: any) {
      errors.push(e?.message || String(e));
      if ((e instanceof KargonomiError || e instanceof bk.BasitKargoError) && [0, 400, 401].includes(e.status)) break;
    }
  }
  return { checked: rows.length, shipped, errors };
}
