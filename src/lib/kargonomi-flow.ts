/* eslint-disable @typescript-eslint/no-explicit-any */
// KARGONOMİ AKIŞI (kullanıcının akışı, 2026-10-13):
//   1) "Kargoya ver (Kargonomi)" → desi → taslak gönderi + firma teklifleri (quoteOrder)
//   2) Yönetici firmayı seçer → confirm-shipping-price (confirmOrder) → "Kargo kodu bekleniyor"
//   3) Kod firmaya göre birkaç saniye – 10+ dk sürer → dakikada bir sorgu (pollKargonomi; cron) +
//      siparişte "Şimdi sorgula"
//   4) Kod gelince: kod + firma kaydedilir (Kargoda YAPILMAZ — etiket → "Paket hazır" → kurye alınca "Kurye aldı")
//   Firma gönderiyi oluşturamazsa (webservice_order_failed) hata siparişte görünür → "İptal et" → yeniden teklif.
// Kod gelmeden sipariş kargolanmış sayılmaz (stok / iptal kuralları değişmez).

import { createAdminClient } from "@/lib/supabase-admin";
import {
  KargonomiError, createShipment, getOffers, confirmProvider, getShipment, cancelShipment,
  findStateId, findCityId, trackingOf, phone10, FAILED_STATUSES, type KargonomiOffer,
} from "@/lib/kargonomi";

type Sb = ReturnType<typeof createAdminClient>;
const SHIPPED = ["shipped", "delivered", "undelivered", "returned"];
const WAIT_DAYS = 3; // bu süreden sonra otomatik sorgu durur (siparişte "Şimdi sorgula" çalışır)

export async function kargonomiConfig(sb: Sb) {
  const { data } = await (sb as any).from("settings")
    .select("kargonomi_enabled, kargonomi_api_token, kargonomi_warehouse_id").order("id").limit(1).maybeSingle();
  return {
    enabled: data?.kargonomi_enabled !== false,
    token: String(data?.kargonomi_api_token || process.env.KARGONOMI_API_TOKEN || "").trim(),
    warehouseId: Number(String(data?.kargonomi_warehouse_id || process.env.KARGONOMI_WAREHOUSE_ID || "").trim()) || 0,
  };
}

async function readyConfig(sb: Sb) {
  const c = await kargonomiConfig(sb);
  if (!c.enabled) throw new KargonomiError(400, "Kargonomi kapalı (Ayarlar › Entegrasyonlar).");
  if (!c.token) throw new KargonomiError(400, "Kargonomi API token girilmemiş (Ayarlar › Entegrasyonlar › Kargonomi).");
  if (!c.warehouseId) throw new KargonomiError(400, "Kargonomi Depo ID girilmemiş (Ayarlar › Entegrasyonlar › Kargonomi).");
  return c;
}

const ORDER_COLS = "id, order_number, user_id, channel, status, payment_status, shipment_status, shipping_address, customer_name, customer_phone, customer_email, kargonomi_shipment_id, kargonomi_tracking_code, kargonomi_status, kargonomi_desi, kargonomi_confirmed_at, profiles(first_name, last_name, phone, email)";

async function loadOrder(sb: Sb, orderId: string) {
  const { data, error } = await (sb as any).from("orders").select(ORDER_COLS).eq("id", orderId).maybeSingle();
  if (error || !data) throw new KargonomiError(404, "Sipariş bulunamadı.");
  return data;
}

const update = (sb: Sb, id: string, fields: Record<string, unknown>) => (sb as any).from("orders").update(fields).eq("id", id);

/** 1) Taslak gönderi + teklifler. Aynı desiyle açık taslak varsa yeniden kullanılır. */
export async function quoteOrder(sb: Sb, orderId: string, desi: number): Promise<{ offers: KargonomiOffer[]; shipmentId: string }> {
  if (!(desi > 0 && desi <= 1000)) throw new KargonomiError(400, "Geçerli bir desi gir.");
  const c = await readyConfig(sb);
  const o = await loadOrder(sb, orderId);
  if (o.kargonomi_tracking_code) throw new KargonomiError(409, "Bu sipariş zaten kargoda.");
  if (o.kargonomi_confirmed_at) throw new KargonomiError(409, "Kargo firması seçildi, kod bekleniyor — önce iptal et.");
  if (o.status === "cancelled" || SHIPPED.includes(o.shipment_status || "")) throw new KargonomiError(409, "Bu sipariş kargoya verilemez (iptal ya da zaten kargolanmış).");
  if (o.payment_status !== "paid") throw new KargonomiError(409, "Ödemesi alınmamış sipariş kargoya verilemez.");

  let shipmentId = o.kargonomi_shipment_id as string | null;
  // Desi değiştiyse eski taslağı sil, yenisini aç
  if (shipmentId && Number(o.kargonomi_desi) !== desi) {
    await cancelShipment(c.token, shipmentId, true).catch(() => {});
    shipmentId = null;
  }
  if (!shipmentId) {
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
    const stateId = await findStateId(c.token, addr.city);
    const cityId = await findCityId(c.token, stateId, addr.district);
    const sh = await createShipment(c.token, {
      buyer_name: name.slice(0, 255), buyer_phone: phone, buyer_address: address.slice(0, 512),
      ...(o.customer_email || p.email ? { buyer_email: o.customer_email || p.email } : {}),
      buyer_state_id: stateId, buyer_city_id: cityId, warehouse_id: c.warehouseId, desi,
      content: o.order_number ? `YH${o.order_number}` : undefined,
    });
    shipmentId = String(sh.id);
    await update(sb, orderId, { kargonomi_shipment_id: shipmentId, kargonomi_status: sh.status || "draft", kargonomi_desi: desi, kargonomi_error: null });
  }
  const offers = await getOffers(c.token, shipmentId);
  await update(sb, orderId, { kargonomi_offers: offers, kargonomi_checked_at: new Date().toISOString() });
  return { offers, shipmentId };
}

/** 2) Seçilen firmayla onayla → kod beklenir (hemen bir kez sorgulanır) */
export async function confirmOrder(sb: Sb, orderId: string, providerId: string) {
  const c = await readyConfig(sb);
  const o = await loadOrder(sb, orderId);
  if (!o.kargonomi_shipment_id) throw new KargonomiError(409, "Önce teklif al.");
  if (o.kargonomi_confirmed_at) throw new KargonomiError(409, "Kargo firması zaten seçildi.");
  const { data: cur } = await (sb as any).from("orders").select("kargonomi_offers").eq("id", orderId).maybeSingle();
  const offer = ((cur?.kargonomi_offers as KargonomiOffer[]) || []).find((x) => x.id === String(providerId));
  if (!offer) throw new KargonomiError(400, "Seçilen firma tekliflerde yok — teklifleri yenile.");
  if (offer.id !== "-1" && offer.amount == null) throw new KargonomiError(400, `${offer.name} bu adrese hizmet vermiyor.`);
  const sh = await confirmProvider(c.token, o.kargonomi_shipment_id, offer.id);
  await update(sb, orderId, {
    kargonomi_confirmed_at: new Date().toISOString(), kargonomi_status: sh?.status || "ready",
    kargonomi_provider: sh?.shipping_provider_name || (offer.id === "-1" ? null : offer.name), kargonomi_error: null,
  });
  return checkOrder(sb, orderId, c.token);
}

/** Taslağı sil / onaylanmış gönderiyi iptal et → sipariş yeniden teklif alabilir */
export async function cancelOrderShipment(sb: Sb, orderId: string) {
  const c = await readyConfig(sb);
  const o = await loadOrder(sb, orderId);
  if (!o.kargonomi_shipment_id) return { ok: true };
  if (o.kargonomi_tracking_code) throw new KargonomiError(409, "Kargo kodu gelmiş — sipariş kargoda; iptal Kargonomi panelinden.");
  const draft = !o.kargonomi_confirmed_at;
  try { await cancelShipment(c.token, o.kargonomi_shipment_id, draft); }
  catch (e: any) { if (!(e instanceof KargonomiError && e.status === 404)) throw e; } // Kargonomi'de zaten yok
  await update(sb, orderId, {
    kargonomi_shipment_id: null, kargonomi_status: null, kargonomi_provider: null, kargonomi_offers: null,
    kargonomi_desi: null, kargonomi_confirmed_at: null, kargonomi_error: null,
  });
  return { ok: true, cancelRequested: !draft };
}

/** 3) Tek siparişin gönderisini sorgula; kod geldiyse siparişi kargoya ver */
export async function checkOrder(sb: Sb, orderId: string, token?: string) {
  const tk = token || (await readyConfig(sb)).token;
  const o = await loadOrder(sb, orderId);
  if (!o.kargonomi_shipment_id || o.kargonomi_tracking_code) return { tracking: o.kargonomi_tracking_code ?? null, status: o.kargonomi_status };
  const sh = await getShipment(tk, o.kargonomi_shipment_id);
  const tracking = trackingOf(sh);
  const failed = FAILED_STATUSES.includes(String(sh.status || ""));
  const now = new Date().toISOString();
  await update(sb, orderId, {
    kargonomi_status: sh.status ?? o.kargonomi_status, kargonomi_checked_at: now,
    ...(sh.shipping_provider_name ? { kargonomi_provider: sh.shipping_provider_name } : {}),
    kargonomi_error: failed ? `${sh.status_label || sh.status} — iptal edip yeniden teklif al` : null,
  });
  if (tracking && !failed) await markShipped(sb, o, tracking, String(sh.shipping_provider_name || ""));
  return { tracking, status: sh.status ?? null, provider: sh.shipping_provider_name ?? null, failed };
}

/** Kod geldi: kod + firma siparişe yazılır (yalnız ilk kez — koşullu güncelleme). Sipariş "Kargoda" YAPILMAZ ve
 *  e-posta GİTMEZ ("Paket hazır" akışı, 2026-10-24): etiket basılır → "Paket hazır" → kurye alınca "Kurye aldı"
 *  (/api/admin/orders/ship-flow) → Kargoda + kargo e-postası o an. */
async function markShipped(sb: Sb, o: any, tracking: string, provider: string) {
  await (sb as any).from("orders")
    .update({ kargonomi_tracking_code: tracking, cargo_tracking_number: tracking, ...(provider ? { cargo_provider: provider } : {}) })
    .eq("id", o.id).is("kargonomi_tracking_code", null);
}

/** Cron (dakikada bir): firma seçilmiş, kodu gelmemiş siparişler */
export async function pollKargonomi(sb: Sb = createAdminClient()) {
  const since = new Date(Date.now() - WAIT_DAYS * 86400_000).toISOString();
  const { data } = await (sb as any).from("orders").select("id, kargonomi_status")
    .not("kargonomi_shipment_id", "is", null).is("kargonomi_tracking_code", null)
    .gte("kargonomi_confirmed_at", since).limit(30);
  const rows = ((data as any[]) || []).filter((r) => !FAILED_STATUSES.includes(r.kargonomi_status || ""));
  if (!rows.length) return { checked: 0, shipped: 0, errors: [] as string[] };
  const c = await kargonomiConfig(sb);
  if (!c.enabled || !c.token) return { checked: 0, shipped: 0, errors: [] as string[] };
  let shipped = 0;
  const errors: string[] = [];
  for (const r of rows) {
    try { if ((await checkOrder(sb, r.id, c.token)).tracking) shipped++; }
    catch (e: any) { errors.push(e?.message || String(e)); if (e instanceof KargonomiError && [0, 401].includes(e.status)) break; }
  }
  return { checked: rows.length, shipped, errors };
}
