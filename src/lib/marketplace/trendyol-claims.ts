/* eslint-disable @typescript-eslint/no-explicit-any */
// Trendyol İADE talepleri (Claims servisi) — sipariş servisinde kısmi iade görünmüyor (paket "Delivered" kalır),
// iadeler ayrı serviste. Dakikalık cron talepleri çeker, sipariş satırıyla eşleştirir (mp_claim_items, birim başına
// bir kayıt) ve siparişe özet yazar (orders.mp_claim_state / mp_claim_note → sıradaki adım + pano).
// Talep durumları: Created (talep açıldı, ürün yolda) → WaitingInAction (depoya ulaştı, satıcı onayı bekliyor; 48 saat
// içinde onaylanmazsa Trendyol kendiliğinden onaylar) → Accepted (onaylanınca önce WaitingFraudCheck olabilir) /
// Rejected / Cancelled; itirazda Unresolved / InAnalysis.
// Kullanıcı kararı 2026-10-31 (B): iade SİTEDEN onaylanır — "İadeyi onayla" Trendyol'a onay gönderir, iade gelen
// satır(lar) işlenir (order_receive_return; stok isteğe bağlı) ve tutarı cirodan düşer (order_record_refund, kısmi
// iade). Trendyol panelinden onaylanmışsa (Accepted) aynı düğme onay göndermeden işler. Ret Trendyol panelinde kalır.

import { createAdminClient } from "@/lib/supabase-admin";
import { getTrendyolConfig, hasCredentials, getClaims, approveClaimItems } from "@/lib/marketplace/trendyol";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";

type AdminClient = ReturnType<typeof createAdminClient>;
export type ClaimState = "in_transit" | "arrived" | "accepted" | "disputed" | "done";

const ACCEPTED = ["Accepted", "WaitingFraudCheck"];
const DISPUTED = ["Unresolved", "InAnalysis"];
const ms = (v: any) => (Number(v) > 0 ? new Date(Number(v)).toISOString() : null);

/** Dakikalık cron: son değişen iade talepleri (Trendyol en çok 2 hafta geriye; imleç 10 dk taşmalı). */
export async function syncTrendyolClaims(supabase: AdminClient = createAdminClient()) {
  const sb = supabase as any;
  const report = { fetched: 0, orders: 0, errors: [] as string[] };
  const { data: st } = await sb.from("settings").select("trendyol_orders_enabled").order("id").limit(1).maybeSingle();
  if (!st?.trendyol_orders_enabled) return report;
  const cfg = await getTrendyolConfig(supabase);
  if (!hasCredentials(cfg)) return report;

  const { data: state } = await sb.from("marketplace_order_sync").select("cursor_at").eq("channel", "trendyol_claims").maybeSingle();
  const now = Date.now();
  const cursor = state?.cursor_at ? new Date(state.cursor_at).getTime() : 0;
  const startDate = Math.max(cursor - 10 * 60_000, now - 14 * 86400_000 + 60_000);
  let maxSeen = cursor;
  const touched = new Set<string>();
  try {
    for (let page = 0; page < 10; page++) {
      const j = await getClaims(cfg, { startDate: String(startDate), endDate: String(now), page: String(page), size: "200" });
      const content: any[] = j?.content ?? [];
      report.fetched += content.length;
      for (const c of content) {
        const orderId = await saveClaim(sb, c);
        if (orderId) touched.add(orderId);
        maxSeen = Math.max(maxSeen, Number(c.lastModifiedDate) || 0);
      }
      if (!content.length || page + 1 >= Number(j?.totalPages ?? 0)) break;
    }
  } catch (e: any) {
    report.errors.push(`Trendyol iade talepleri: ${e?.message || e}`);
  }
  for (const id of touched) await refreshClaimState(sb, id);
  report.orders = touched.size;
  await sb.from("marketplace_order_sync").upsert({
    channel: "trendyol_claims", last_run_at: new Date().toISOString(),
    ...(report.errors.length ? { last_error: report.errors[0].slice(0, 500) }
      : { cursor_at: new Date(Math.min(maxSeen || now, now)).toISOString(), last_ok_at: new Date().toISOString(), last_error: null }),
  });
  return report;
}

/** Talebi siparişe bağla, kalemlerini kaydet (birim başına bir satır). Sipariş sitede yoksa (entegrasyondan önce) atlar. */
async function saveClaim(sb: any, c: any): Promise<string | null> {
  const pkg = String(c.orderShipmentPackageId ?? "");
  let order: any = null;
  if (pkg) ({ data: order } = await sb.from("orders").select("id").eq("channel", "trendyol").eq("external_package_id", pkg).maybeSingle());
  if (!order && c.orderNumber) {
    const { data } = await sb.from("orders").select("id").eq("channel", "trendyol").eq("external_order_number", String(c.orderNumber)).order("created_at").limit(1);
    order = data?.[0] ?? null;
  }
  if (!order) return null;
  const { data: items } = await sb.from("order_items").select("id, external_line_id, barcode").eq("order_id", order.id);
  const claimId = String(c.claimId ?? c.id ?? "");
  const rows: any[] = [];
  for (const it of c.items ?? []) {
    const ol = it.orderLine ?? {};
    const item = ((items as any[]) || []).find((i) => ol.id != null && String(i.external_line_id) === String(ol.id))
      ?? ((items as any[]) || []).find((i) => ol.barcode && String(i.barcode) === String(ol.barcode));
    for (const ci of it.claimItems ?? []) {
      if (!ci?.id) continue;
      rows.push({
        id: String(ci.id), claim_id: claimId, claim_ref: String(c.id ?? claimId), order_id: order.id, order_item_id: item?.id ?? null,
        status: ci.claimItemStatus?.name ?? null, reason: ci.customerClaimItemReason?.name ?? null, customer_note: ci.customerNote || null,
        claim_date: ms(c.claimDate), cargo_tracking: c.cargoTrackingNumber ? String(c.cargoTrackingNumber) : null,
        cargo_provider: c.cargoProviderName ?? null, last_modified: ms(c.lastModifiedDate), updated_at: new Date().toISOString(),
      });
    }
  }
  if (rows.length) {
    const { error } = await sb.from("mp_claim_items").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  return order.id;
}

/** Siparişin iade özetini yenile: en acil durum + "1 × ürün (beden) — sebep" notu. */
export async function refreshClaimState(sb: any, orderId: string) {
  // Tam iadesi eski yolla ("İade geldi, stoğa ekle") işlenmiş sipariş: onaylı talepler işlenmiş sayılır (iş olarak dönmesin)
  const { data: ord } = await sb.from("orders").select("mp_restocked_at").eq("id", orderId).maybeSingle();
  if (ord?.mp_restocked_at) {
    await sb.from("mp_claim_items").update({ received_at: ord.mp_restocked_at, auto_closed: true }).eq("order_id", orderId).is("received_at", null).in("status", ACCEPTED);
  }
  const { data } = await sb.from("mp_claim_items").select("status, reason, received_at, auto_closed, order_items(title, variant_name, sku)").eq("order_id", orderId);
  const rows = (data as any[]) || [];
  const pend = rows.filter((r) => !r.received_at && !["Rejected", "Cancelled"].includes(r.status));
  const has = (s: string[]) => pend.some((r) => s.includes(r.status));
  const state: ClaimState | null = has(["WaitingInAction"]) ? "arrived" : has(ACCEPTED) ? "accepted" : has(["Created"]) ? "in_transit"
    : has(DISPUTED) ? "disputed" : rows.some((r) => r.received_at && !r.auto_closed) ? "done" : null;
  const show = pend.length ? pend : rows.filter((r) => r.received_at && !r.auto_closed);
  const groups = new Map<string, number>();
  for (const r of show) {
    const oi = r.order_items;
    const name = oi ? `${oi.title || oi.sku || "ürün"}${oi.variant_name ? ` (${oi.variant_name})` : ""}` : "eşleşmeyen ürün";
    const key = `${name}${r.reason ? ` — ${r.reason}` : ""}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const note = [...groups].map(([k, n]) => `${n} × ${k}`).join("; ") || null;
  await sb.from("orders").update({ mp_claim_state: state, mp_claim_note: note }).eq("id", orderId);
  return state;
}

/** "İadeyi onayla" (sipariş ekranı): depoya ulaşanları Trendyol'da onayla → satırları iade geldi say (stok isteğe bağlı)
 *  → tutarı cirodan düş (kısmi iade). Onay başarısızsa sitede hiçbir şey değişmez; işleme hatası olursa yeniden
 *  denenebilir (onaylananlar Accepted kalır, ikinci kez onay gönderilmez). */
export async function receiveTrendyolClaim(supabase: AdminClient, orderId: string, restock: boolean, actor: string | null) {
  const sb = supabase as any;
  const { data: o } = await sb.from("orders").select("id, channel, total_amount, refunded_amount, payment_status").eq("id", orderId).maybeSingle();
  if (!o || o.channel !== "trendyol") throw new Error("Trendyol siparişi bulunamadı.");
  const { data: pend } = await sb.from("mp_claim_items").select("id, claim_id, claim_ref, status, order_item_id")
    .eq("order_id", orderId).is("received_at", null).in("status", ["WaitingInAction", ...ACCEPTED]);
  const rows = (pend as any[]) || [];
  if (!rows.length) throw new Error("İşlenecek iade yok — ürün depoya ulaşınca (ya da Trendyol'da onaylanınca) görünür.");

  // 1) Trendyol'a onay (yalnız depoya ulaşmış, onay bekleyenler)
  const waiting = rows.filter((r) => r.status === "WaitingInAction");
  if (waiting.length) {
    const cfg = await getTrendyolConfig(supabase);
    if (!hasCredentials(cfg)) throw new Error("Trendyol bağlantı bilgileri eksik (Ayarlar › Entegrasyonlar).");
    const byClaim = new Map<string, any[]>();
    for (const r of waiting) byClaim.set(r.claim_id, [...(byClaim.get(r.claim_id) || []), r]);
    for (const [claimId, list] of byClaim) {
      const ids = list.map((r) => r.id);
      try {
        try { await approveClaimItems(cfg, claimId, ids); }
        catch (e: any) {
          // Talep kimliği belgede net değil (content[].claimId / id) — diğeriyle bir kez daha dene
          const alt = list[0].claim_ref;
          if (!alt || alt === claimId || ![400, 404].includes(Number(e?.status))) throw e;
          await approveClaimItems(cfg, alt, ids);
        }
      } catch (e: any) {
        const msg = `Trendyol'da iade onaylanamadı: ${e?.message || e}`.slice(0, 500);
        await sb.from("mp_claim_items").update({ approve_error: msg }).in("id", ids);
        throw new Error(msg);
      }
      await sb.from("mp_claim_items").update({ status: "Accepted", approved_at: new Date().toISOString(), approve_error: null }).in("id", ids);
    }
  }

  // 2) Satırlar: iade geldi (stok: yalnız stoğu düşülmüş satıra)
  const qty = new Map<string, number>();
  for (const r of rows) if (r.order_item_id) qty.set(r.order_item_id, (qty.get(r.order_item_id) || 0) + 1);
  const { data: its } = qty.size
    ? await sb.from("order_items").select("id, quantity, returned_qty, unit_price, stock_applied_at").in("id", [...qty.keys()])
    : { data: [] };
  const lines = ((its as any[]) || []).map((i) => ({ ...i, q: Math.min(qty.get(i.id) || 0, Number(i.quantity) - Number(i.returned_qty || 0)) }))
    .filter((i) => i.q > 0);
  let restocked = 0;
  if (lines.length) {
    const { data: rr, error } = await sb.rpc("order_receive_return", {
      p_order: orderId, p_items: lines.map((i) => ({ item_id: i.id, qty: i.q, restock: restock && !!i.stock_applied_at })),
      p_note: "Trendyol iadesi", p_actor: actor,
    });
    if (error) throw new Error(error.message);
    restocked = Number(rr?.restocked || 0);
  }

  // 3) Ciro: iade gelen satırların tutarı (parayı müşteriye Trendyol iade eder)
  const remaining = Math.round((Number(o.total_amount || 0) - Number(o.refunded_amount || 0)) * 100) / 100;
  const amount = Math.min(remaining, Math.round(lines.reduce((s, i) => s + Number(i.unit_price || 0) * i.q, 0) * 100) / 100);
  if (amount > 0 && ["paid", "partial_refund"].includes(o.payment_status || "")) {
    const { error } = await sb.rpc("order_record_refund", { p_order: orderId, p_amount: amount, p_method: "marketplace", p_note: "Trendyol iadesi — parayı Trendyol iade etti", p_actor: actor });
    if (error) throw new Error(error.message);
  }

  await sb.from("mp_claim_items").update({ received_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
  const { data: all } = await sb.from("order_items").select("quantity, returned_qty").eq("order_id", orderId);
  if (((all as any[]) || []).every((i) => Number(i.returned_qty || 0) >= Number(i.quantity))) {
    await sb.from("orders").update({ mp_restocked_at: new Date().toISOString() }).eq("id", orderId); // eski "tam iade" adımı tekrar çıkmasın
  }
  if (restocked > 0) kickMarketplaceSync(500);
  await refreshClaimState(sb, orderId);
  return { approved: waiting.length, items: lines.reduce((s, i) => s + i.q, 0), restocked, amount, unmatched: rows.filter((r) => !r.order_item_id).length };
}
