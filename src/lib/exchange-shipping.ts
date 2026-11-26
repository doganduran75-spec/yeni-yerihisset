/* eslint-disable @typescript-eslint/no-explicit-any */
// DEĞİŞİM GÖNDERİSİ — KARGO ENTEGRASYONU (kullanıcı 2026-11-26: müşteri adına açılan değişimde kargo kodu yoktu, elle
// girilmesi gerekiyordu). Akış siparişin ilk gönderisiyle aynı pencere (kullanıcı: "başka kargo firmasıyla çalışmak
// isteyebilirim"): "Kargo kodu oluştur" → desi (ilk gönderininki gelir) → "Teklifleri getir" → firma seç (ilk gönderinin
// firması önerilir) → "Bu firmayla gönder" → kod (Basit Kargo hemen; Kargonomi'de birkaç sn – 10+ dk, 5 dakikada bir sorgu + "Şimdi sorgula")
//   → "Etiketi yazdır" (ortak etiket tasarımı, değişim ürünleriyle) → "Alternatifi gönder" (ürün siparişe eklenir, stok düşer,
//   müşteriye "yeni numaran yola çıktı" e-postası takip numarasıyla) → kargo "teslim edildi" deyince talep "alternatif teslim
//   edildi" + müşteriye "hangisi oldu?" e-postası (elle düğmeye gerek kalmaz).
// Gönderi talepte (order_cases.alt_*) tutulur, siparişin kendi gönderisine (orders.kargonomi_*) DOKUNMAZ (MIG 20261203).
// Elle kod girmek yine mümkün (entegrasyon dışı gönderi).
import { createAdminClient } from "@/lib/supabase-admin";
import {
  KargonomiError, createShipment, getOffers, confirmProvider, getShipment, cancelShipment, findStateId, findCityId,
  trackingOf, carrierTrackingOf, FAILED_STATUSES, DELIVERED_STATUS, PROBLEM_STATUSES,
} from "@/lib/kargonomi";
import * as bk from "@/lib/basitkargo";
import { cargoConfig, cargoReady, cargoRecipient, PROVIDER_NAME } from "@/lib/kargonomi-flow";
import { sendAltDeliveredEmail } from "@/lib/after-sale-mail";
import { pickOffer } from "@/lib/exchange-ship-rules";

type Sb = ReturnType<typeof createAdminClient>;
type Provider = "kargonomi" | "basitkargo";
const OPEN = ["requested", "reserved"];            // kod alınabilir (gönderilmeden önce)
const TRACKED = ["requested", "reserved", "alt_shipped"]; // durumu izlenir
const TRACK_DAYS = 30;

async function load(sb: Sb, orderId: string) {
  const s = sb as any;
  const { data: o } = await s.from("orders")
    .select("id, order_number, total_amount, payment_method, shipping_address, customer_name, customer_phone, customer_email, kargo_api, kargonomi_desi, kargonomi_provider, profiles(first_name, last_name, phone, email)")
    .eq("id", orderId).maybeSingle();
  if (!o) throw new KargonomiError(404, "Sipariş bulunamadı.");
  const { data: c } = await s.from("order_cases").select("*").eq("order_id", orderId).is("closed_at", null).maybeSingle();
  if (!c || c.kind !== "exchange") throw new KargonomiError(409, "Açık değişim talebi yok.");
  return { o, c };
}
const saveCase = (sb: Sb, id: string, f: Record<string, unknown>) => (sb as any).from("order_cases").update({ ...f, updated_at: new Date().toISOString() }).eq("id", id);
const note = (sb: Sb, orderId: string, t: string) => (sb as any).from("order_events").insert({ order_id: orderId, type: "note", note: t.slice(0, 400) });

/** Pencere için: sağlayıcılar + desi (taslakta yoksa ilk gönderininki) + ilk gönderinin firması (teklif önerisi) */
export async function altShipmentInfo(sb: Sb, orderId: string) {
  const { o, c } = await load(sb, orderId);
  const desi = Number(c.alt_desi) > 0 ? Number(c.alt_desi) : Number(o.kargonomi_desi) > 0 ? Number(o.kargonomi_desi) : 2;
  const offers = (c.alt_offers as any[]) || [];
  return { desi, firstCarrier: o.kargonomi_provider || null, suggested: offers.length ? pickOffer(offers, o.kargonomi_provider)?.id ?? null : null };
}

/** 1) "Teklifleri getir" — taslak gönderi (desi + sağlayıcı) + firma teklifleri. Desi / sağlayıcı değiştiyse eski taslak silinir. */
export async function quoteAltShipment(sb: Sb, orderId: string, desi: number, want?: string) {
  if (!(desi > 0 && desi <= 1000)) throw new KargonomiError(400, "Geçerli bir desi gir.");
  const { o, c } = await load(sb, orderId);
  if (!OPEN.includes(c.status)) throw new KargonomiError(409, "Bu aşamada değişim gönderisi açılamaz (yalnız gönderilmeden önce).");
  if (c.alt_label_code) throw new KargonomiError(409, "Değişim gönderisinin kargo kodu zaten var.");
  if (c.alt_confirmed_at) throw new KargonomiError(409, "Kargo firması seçildi — önce iptal et.");
  const cfg = await cargoConfig(sb);
  // Pencerede seçilen; seçilmediyse ilk gönderinin sağlayıcısı (hazırsa), değilse varsayılan
  let p: Provider = cfg.active as Provider;
  if (want === "basitkargo" || want === "kargonomi") p = want;
  else { const first: Provider = o.kargo_api === "basitkargo" ? "basitkargo" : "kargonomi"; try { cargoReady(cfg, first); p = first; } catch { /* varsayılan */ } }
  cargoReady(cfg, p);

  let shipmentId = c.alt_shipment_id as string | null;
  if (shipmentId && (Number(c.alt_desi) !== desi || c.alt_kargo_api !== p)) {
    if (c.alt_kargo_api === "basitkargo") await bk.deleteOrder(cfg.basit.token, shipmentId).catch(() => {});
    else await cancelShipment(cfg.kargonomi.token, shipmentId, true).catch(() => {});
    shipmentId = null;
  }
  if (shipmentId && p === "kargonomi") { // Kargonomi'de taslak silinmiş / süresi dolmuş olabilir
    const cur = await getShipment(cfg.kargonomi.token, shipmentId).catch(() => null);
    if (!cur || cur.status !== "draft") shipmentId = null;
  }
  if (!shipmentId) {
    const r = cargoRecipient(o);
    const ref = `${o.order_number ? `YH${o.order_number}` : String(o.id).slice(0, 8)}-D`; // D = değişim
    const items = ((c.items as any[]) || []).map((x) => ({ name: String(x.want_label || "Değişim ürünü").slice(0, 120), quantity: 1 }));
    if (p === "basitkargo") {
      const created = await bk.createOrder(cfg.basit.token, {
        orderTotal: Number(o.total_amount) || 0, orderPaymentType: "OTHER",
        ...(cfg.basit.addressId ? { addressId: cfg.basit.addressId } : {}),
        content: { name: ref, code: ref, items: items.length ? items : [{ name: ref, quantity: 1 }], packages: [bk.packageOf(desi)] },
        client: { name: r.name.slice(0, 255), phone: r.phone, ...(r.email ? { email: r.email } : {}), city: r.city, town: r.district, address: r.address.slice(0, 500) },
      });
      shipmentId = created.id;
      await saveCase(sb, c.id, { alt_shipment_id: shipmentId, alt_kargo_api: p, alt_desi: desi, alt_kargo_status: created.status || "NEW", alt_kargo_error: null });
    } else {
      const stateId = await findStateId(cfg.kargonomi.token, r.city);
      const cityId = await findCityId(cfg.kargonomi.token, stateId, r.district);
      const sh = await createShipment(cfg.kargonomi.token, {
        buyer_name: r.name.slice(0, 255), buyer_phone: r.phone, buyer_address: r.address.slice(0, 512), ...(r.email ? { buyer_email: r.email } : {}),
        buyer_state_id: stateId, buyer_city_id: cityId, warehouse_id: cfg.kargonomi.warehouseId, desi, content: ref,
      });
      shipmentId = String(sh.id);
      await saveCase(sb, c.id, { alt_shipment_id: shipmentId, alt_kargo_api: p, alt_desi: desi, alt_kargo_status: sh.status || "draft", alt_kargo_error: null });
    }
  }
  const offers = p === "basitkargo" ? await bk.getFees(cfg.basit.token, shipmentId) : await getOffers(cfg.kargonomi.token, shipmentId);
  await saveCase(sb, c.id, { alt_offers: offers, alt_checked_at: new Date().toISOString() });
  return { offers, shipmentId, provider: p, suggested: pickOffer(offers, o.kargonomi_provider)?.id ?? null };
}

/** 2) "Bu firmayla gönder" — seçilen firmayla onay → kod (Basit Kargo hemen; Kargonomi'de beklenir) */
export async function confirmAltShipment(sb: Sb, orderId: string, providerId: string) {
  const { c } = await load(sb, orderId);
  if (!c.alt_shipment_id) throw new KargonomiError(409, "Önce teklif al.");
  if (c.alt_confirmed_at) throw new KargonomiError(409, "Kargo firması zaten seçildi.");
  const offer = ((c.alt_offers as any[]) || []).find((x) => x.id === String(providerId));
  if (!offer) throw new KargonomiError(400, "Seçilen firma tekliflerde yok — teklifleri yenile.");
  if (offer.id !== "-1" && offer.amount == null) throw new KargonomiError(400, `${offer.name} bu adrese hizmet vermiyor.`);
  const cfg = await cargoConfig(sb);
  const p: Provider = c.alt_kargo_api === "basitkargo" ? "basitkargo" : "kargonomi";
  cargoReady(cfg, p);
  // Kilit: iki tık / iki istek aynı taslağı iki kez onaylamasın; olmazsa geri alınır
  const { data: claimed } = await (sb as any).from("order_cases").update({ alt_confirmed_at: new Date().toISOString(), alt_kargo_error: null })
    .eq("id", c.id).is("alt_confirmed_at", null).select("id");
  if (!claimed?.length) throw new KargonomiError(409, "Kargo firması zaten seçildi.");
  try {
    if (p === "basitkargo") {
      const res = await bk.createBarcode(cfg.basit.token, c.alt_shipment_id, offer.id, crypto.randomUUID());
      await saveCase(sb, c.id, { alt_kargo_status: res?.status || "READY_TO_SHIP", alt_kargo_provider: bk.providerOf(res) || offer.name });
    } else {
      let done: any;
      try { done = await confirmProvider(cfg.kargonomi.token, c.alt_shipment_id, offer.id); }
      catch (e) {
        // Kargonomi onayı kabul edip hata dönebiliyor (2026-11-04) → gerçek durumu oku
        const cur = await getShipment(cfg.kargonomi.token, c.alt_shipment_id).catch(() => null);
        if (!(cur?.status && cur.status !== "draft" && !FAILED_STATUSES.includes(cur.status) && cur.status !== "cancelled")) throw e;
        done = cur;
      }
      await saveCase(sb, c.id, { alt_kargo_status: done?.status || "ready", alt_kargo_provider: done?.shipping_provider_name || (offer.id === "-1" ? null : offer.name) });
    }
  } catch (e) {
    await saveCase(sb, c.id, { alt_confirmed_at: null });
    throw e;
  }
  await note(sb, orderId, `Değişim gönderisi: kargo firması seçildi (${PROVIDER_NAME[p]} #${c.alt_shipment_id}${offer.id === "-1" ? "" : ` · ${offer.name}`}) — kod bekleniyor`);
  return checkAltShipment(sb, orderId);
}

/** Değişim gönderisini sorgula: kod geldiyse yaz; teslim edildiyse talep "alternatif teslim edildi" + "hangisi oldu?" e-postası */
export async function checkAltShipment(sb: Sb, orderId: string) {
  const s = sb as any;
  const { data: c } = await s.from("order_cases").select("*").eq("order_id", orderId).is("closed_at", null).maybeSingle();
  if (!c?.alt_shipment_id) return { code: c?.alt_label_code ?? null, status: c?.alt_kargo_status ?? null };
  const cfg = await cargoConfig(sb);
  let code: string | null = null, carrier: string | null = null, status = "", label = "", delivered = false, problem = false, provider: string | null = null;
  if (c.alt_kargo_api === "basitkargo") {
    const cur = await bk.getOrder(cfg.basit.token, c.alt_shipment_id);
    status = String(cur.status || ""); label = bk.STATUS_LABEL[status] || status;
    code = bk.trackingOf(cur); provider = bk.providerOf(cur);
    delivered = status === "DELIVERED"; problem = bk.PROBLEM_STATUSES.includes(status);
  } else {
    const sh = await getShipment(cfg.kargonomi.token, c.alt_shipment_id);
    status = String(sh.status || ""); label = String(sh.status_label || status);
    code = trackingOf(sh); carrier = carrierTrackingOf(sh); provider = sh.shipping_provider_name ? String(sh.shipping_provider_name) : null;
    delivered = status === DELIVERED_STATUS; problem = PROBLEM_STATUSES.includes(status) || FAILED_STATUSES.includes(status);
  }
  const f: Record<string, unknown> = {
    alt_kargo_status: status || c.alt_kargo_status, alt_checked_at: new Date().toISOString(),
    alt_kargo_error: problem ? `${c.alt_kargo_api === "basitkargo" ? "Basit Kargo" : "Kargonomi"}: ${label} — kargo panelinden kontrol et` : null,
    ...(provider ? { alt_kargo_provider: provider } : {}),
  };
  if (code && !c.alt_label_code) {
    f.alt_label_code = code;
    if (!c.alt_tracking) f.alt_tracking = code;
    await note(sb, orderId, `Değişim gönderisinin kargo kodu geldi: ${code}`);
  }
  // Firmanın kendi takip kodu gelince müşteriye giden takip no o olur (etiketteki entegrasyon kodu değişmez)
  if (carrier && carrier !== (c.alt_tracking || code) && (!c.alt_tracking || c.alt_tracking === (c.alt_label_code || code))) f.alt_tracking = carrier;
  await saveCase(sb, c.id, f);
  if (problem && c.alt_kargo_status !== status) await note(sb, orderId, `Değişim gönderisi: ${label}`);
  if (delivered && c.status === "alt_shipped") {
    const { data: moved } = await s.from("order_cases").update({ status: "alt_delivered", updated_at: new Date().toISOString() }).eq("id", c.id).eq("status", "alt_shipped").select("id");
    if (moved?.length) {
      const r = await sendAltDeliveredEmail(orderId).catch((e: any) => ({ status: "failed", error: e?.message }));
      await note(sb, orderId, `Değişim: alternatif teslim edildi (kargo bildirdi) — "hangisi oldu?" e-postası ${r.status === "sent" ? "gönderildi" : "gönderilemedi"}`);
    }
  }
  return { code: (f.alt_label_code as string) ?? c.alt_label_code ?? null, status, provider, delivered, problem };
}

/** Değişim gönderisini iptal et (kurye almadıysa). Kargonomi'de kod gelmişse iptal panelden. */
export async function cancelAltShipment(sb: Sb, orderId: string) {
  const { c } = await load(sb, orderId);
  if (!c.alt_shipment_id) return { ok: true };
  if (c.status === "alt_shipped" || c.status === "alt_delivered") throw new KargonomiError(409, "Alternatif gönderildi — iptal kargo panelinden.");
  const cfg = await cargoConfig(sb);
  if (c.alt_kargo_api === "basitkargo") {
    const cur = await bk.getOrder(cfg.basit.token, c.alt_shipment_id).catch((e) => { if (e instanceof bk.BasitKargoError && e.status === 404) return null; throw e; });
    if (cur && !["NEW", "READY_TO_SHIP"].includes(String(cur.status))) throw new KargonomiError(409, `Gönderi ${bk.STATUS_LABEL[String(cur.status)] || cur.status} — iptal Basit Kargo panelinden.`);
    if (cur?.barcode && cur.status === "READY_TO_SHIP") await bk.cancelBarcode(cfg.basit.token, cur.barcode);
    await bk.deleteOrder(cfg.basit.token, c.alt_shipment_id).catch((e) => { if (!(e instanceof bk.BasitKargoError && e.status === 404)) throw e; });
  } else {
    if (c.alt_label_code) throw new KargonomiError(409, "Kargo kodu gelmiş — iptal Kargonomi panelinden.");
    try { await cancelShipment(cfg.kargonomi.token, c.alt_shipment_id, !c.alt_confirmed_at); }
    catch (e: any) { if (!(e instanceof KargonomiError && e.status === 404)) throw e; }
  }
  await saveCase(sb, c.id, {
    alt_shipment_id: null, alt_kargo_api: null, alt_label_code: null, alt_kargo_provider: null, alt_kargo_status: null,
    alt_kargo_error: null, alt_confirmed_at: null, alt_label_printed_at: null, alt_offers: null, alt_desi: null,
    ...(c.alt_tracking && c.alt_tracking === c.alt_label_code ? { alt_tracking: null } : {}),
  });
  await note(sb, orderId, `Değişim gönderisi iptal edildi (#${c.alt_shipment_id})`);
  return { ok: true };
}

/** Cron (5 dakikada bir, pollKargonomi ile): kodu beklenen + kargodaki değişim gönderileri (kodu gelmişler saatte bir) */
export async function pollAltShipments(sb: Sb = createAdminClient()) {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data } = await (sb as any).from("order_cases").select("order_id, alt_label_code, alt_checked_at")
    .not("alt_shipment_id", "is", null).is("closed_at", null).in("status", TRACKED)
    .gte("alt_confirmed_at", new Date(Date.now() - TRACK_DAYS * 86400_000).toISOString()).limit(30);
  const rows = ((data as any[]) || []).filter((r) => !r.alt_label_code || !r.alt_checked_at || r.alt_checked_at < hourAgo);
  const errors: string[] = [];
  for (const r of rows) {
    try { await checkAltShipment(sb, r.order_id); }
    catch (e: any) { errors.push(e?.message || String(e)); if ((e instanceof KargonomiError || e instanceof bk.BasitKargoError) && [0, 400, 401].includes(e.status)) break; }
  }
  return { checked: rows.length, errors };
}
