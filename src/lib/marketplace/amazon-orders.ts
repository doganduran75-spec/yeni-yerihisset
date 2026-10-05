/* eslint-disable @typescript-eslint/no-explicit-any */
// Amazon (TR) SİPARİŞLERİNİ sitenin siparişlerine aktarır — Trendyol / Hepsiburada ile aynı kurallar:
// üye yapılmaz, e-posta gitmez, stok kalem bazında tek seferlik düşer (mp_apply_item_stock) ve
// iptalde geri eklenir (mp_restore_item_stock); iade admin onayıyla ("İadeyi stoğa ekle").
// Yalnız SATICI GÖNDERİMLİ (FBM) siparişler: Amazon deposundan (FBA) giden siparişin stoğu
// sitedeki depodan düşmez.
// Kaynak: Orders API v2026-01-01 searchOrders (kalemler yanıtın içinde). Kişisel veri (alıcı adı,
// adres) İSTENMEZ → Amazon'un "kısıtlı rol" denetimi gerekmez; kargo Seller Central'dan yapılır.
// İstek sınırı düşük (≈ 3 dakikada 1, birikimli 20) → en çok 5 dakikada bir çekilir.

import { createAdminClient } from "@/lib/supabase-admin";
import { getAmazonConfig, amzHasCredentials, amazonCall } from "@/lib/marketplace/amazon";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import type { OrderImportReport } from "@/lib/marketplace/orders";
import { marketplacePaymentPatch } from "@/lib/marketplace/payment-patch";

type AdminClient = ReturnType<typeof createAdminClient>;

const EVERY_MS = 5 * 60_000;
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

const CANCELLED = new Set(["CANCELLED", "UNFULFILLABLE"]);

function mapStatus(fs: string, pkgStatus: string | null): { status: string; shipment_status: string; payment_status: string } {
  if (CANCELLED.has(fs)) return { status: "cancelled", shipment_status: "cancelled", payment_status: "failed" };
  if (pkgStatus === "DELIVERED") return { status: "delivered", shipment_status: "delivered", payment_status: "paid" };
  if (pkgStatus === "UNDELIVERABLE") return { status: "shipped", shipment_status: "undelivered", payment_status: "paid" };
  if (fs === "SHIPPED" || fs === "PARTIALLY_SHIPPED") return { status: "shipped", shipment_status: "shipped", payment_status: "paid" };
  if (fs === "PENDING" || fs === "PENDING_AVAILABILITY") return { status: "processing", shipment_status: "preparing", payment_status: "pending" };
  return { status: "processing", shipment_status: "preparing", payment_status: "paid" }; // UNSHIPPED
}

// Satıcı SKU'su → sitedeki varyant (ayardaki alan önce, sonra diğeri)
function makeMatcher(sb: any, primary: "sku" | "barcode") {
  const cache = new Map<string, { variant_id: string; product_id: string } | null>();
  const byField = async (field: "sku" | "barcode", val: string) => {
    const { data } = await sb.from("product_variants").select("id, product_id").eq(field, val).limit(1).maybeSingle();
    return data ? { variant_id: data.id, product_id: data.product_id } : null;
  };
  return async (sku: string | null) => {
    if (!sku) return null;
    if (cache.has(sku)) return cache.get(sku)!;
    const m = (await byField(primary, sku)) ?? (await byField(primary === "sku" ? "barcode" : "sku", sku));
    cache.set(sku, m);
    return m;
  };
}
type Matcher = ReturnType<typeof makeMatcher>;

const itemCancelled = (it: any, fs: string) =>
  CANCELLED.has(fs) || !!it?.cancellation?.cancellationExecution || n(it?.quantityOrdered) === 0;

export async function importAmazonOrders(supabase: AdminClient = createAdminClient(), opts: { force?: boolean } = {}): Promise<OrderImportReport> {
  const report: OrderImportReport = { channel: "amazon", fetched: 0, imported: 0, updated: 0, stockChanges: 0, warnings: [], errors: [] };
  const sb = supabase as any;

  const { data: st } = await sb.from("settings").select("amazon_orders_enabled, amazon_orders_since").order("id").limit(1).maybeSingle();
  if (!st?.amazon_orders_enabled) return { ...report, skipped: "disabled" };
  const cfg = await getAmazonConfig(supabase);
  if (!amzHasCredentials(cfg)) return { ...report, skipped: "no_credentials" };

  const { data: state } = await sb.from("marketplace_order_sync").select("*").eq("channel", "amazon").maybeSingle();
  if (!opts.force && state?.last_run_at && Date.now() - new Date(state.last_run_at).getTime() < EVERY_MS - 15_000) return report;

  const since = st.amazon_orders_since ? new Date(st.amazon_orders_since).getTime() : Date.now();
  const runStarted = Date.now();
  const cursor = state?.cursor_at ? new Date(state.cursor_at).getTime() : since;
  // 10 dk geriye taşma payı (geç yansıyan değişiklikler); Amazon "en az 2 dk önce" ister
  const after = Math.max(since - 60_000, cursor - 10 * 60_000);
  const match = makeMatcher(sb, cfg.matchField);
  let maxSeen = cursor;

  try {
    let token = "";
    for (let page = 0; page < 5; page++) {
      const q: Record<string, string> = {
        lastUpdatedAfter: new Date(after).toISOString(),
        marketplaceIds: cfg.marketplaceId,
        fulfilledBy: "MERCHANT",
        maxResultsPerPage: "100",
        includedData: "FULFILLMENT,PACKAGES,CANCELLATION",
      };
      if (token) q.paginationToken = token;
      const j = await amazonCall(cfg, "GET", "/orders/2026-01-01/orders", q);
      const orders: any[] = j?.orders ?? [];
      report.fetched += orders.length;
      for (const o of orders) {
        maxSeen = Math.max(maxSeen, new Date(o.lastUpdatedTime ?? o.createdTime ?? 0).getTime() || 0);
        try {
          const r = await upsertAmazonOrder(sb, o, since, match);
          if (r.imported) report.imported++;
          else if (r.changed) report.updated++;
          report.warnings.push(...r.warnings);
        } catch (e: any) {
          report.errors.push(`Sipariş ${o.orderId}: ${e?.message || e}`);
        }
      }
      token = j?.pagination?.nextToken ?? "";
      if (!token) break;
    }

    const { count } = await sb.from("stock_events").select("id", { count: "exact", head: true })
      .in("source", ["amazon_order", "amazon_cancel"]).gte("created_at", new Date(runStarted).toISOString());
    report.stockChanges = count ?? 0;
    if (report.stockChanges > 0) kickMarketplaceSync(500);

    await sb.from("marketplace_order_sync").upsert({
      channel: "amazon",
      cursor_at: new Date(report.errors.length ? cursor : Math.max(maxSeen, cursor)).toISOString(),
      last_run_at: new Date().toISOString(),
      last_ok_at: report.errors.length ? state?.last_ok_at ?? null : new Date().toISOString(),
      last_error: report.errors[0] ?? null,
      imported_total: (state?.imported_total ?? 0) + report.imported,
      updated_total: (state?.updated_total ?? 0) + report.updated,
    });
  } catch (e: any) {
    report.errors.push(e?.message || String(e));
    await sb.from("marketplace_order_sync").upsert({
      channel: "amazon", cursor_at: state?.cursor_at ?? new Date(since).toISOString(),
      last_run_at: new Date().toISOString(), last_ok_at: state?.last_ok_at ?? null, last_error: report.errors[0],
      imported_total: state?.imported_total ?? 0, updated_total: state?.updated_total ?? 0,
    });
  }
  return report;
}

async function upsertAmazonOrder(sb: any, o: any, since: number, match: Matcher) {
  const out = { imported: false, changed: false, warnings: [] as string[] };
  const orderId = String(o.orderId);
  const fs = String(o.fulfillment?.fulfillmentStatus ?? "PENDING");
  const pkgs: any[] = o.packages ?? [];
  const lastPkg = pkgs[pkgs.length - 1] ?? null;
  const pkgStatus = lastPkg?.packageStatus?.status ?? null;
  const mapped = mapStatus(fs, pkgStatus);
  const updatedAt = new Date(o.lastUpdatedTime ?? o.createdTime ?? Date.now()).toISOString();
  const items: any[] = o.orderItems ?? [];
  const cargo = {
    cargo_provider: lastPkg?.carrier ?? null,
    cargo_tracking_number: lastPkg?.trackingNumber ?? null,
  };
  const externalStatus = pkgStatus && pkgStatus !== "PENDING" ? `${fs} / ${pkgStatus}` : fs;

  let { data: order } = await sb.from("orders").select("id, external_updated_at, total_amount, invoice_status, status")
    .eq("channel", "amazon").eq("external_package_id", orderId).maybeSingle();

  // ── Yeni sipariş ──
  if (!order) {
    if (o.createdTime && new Date(o.createdTime).getTime() < since) return out; // entegrasyon açılmadan önceki sipariş
    const { data, error } = await sb.from("orders").insert({
      channel: "amazon", user_id: null,
      external_order_number: orderId, external_package_id: orderId,
      external_status: externalStatus, external_updated_at: updatedAt,
      created_at: o.createdTime ?? new Date().toISOString(),
      status: mapped.status, payment_status: mapped.payment_status, shipment_status: mapped.shipment_status,
      invoice_status: "pending",
      ...marketplacePaymentPatch(mapped.status, 0, "pending"),
      payment_method: "marketplace", total_amount: 0, shipping_cost: 0,
      shipping_method: cargo.cargo_provider, shipping_address: null, billing_address: null,
      customer_name: "Amazon Müşterisi", customer_email: null, customer_phone: null,
      ...cargo,
      external_raw: o,
    }).select("id, external_updated_at, total_amount, invoice_status, status").single();
    if (error) {
      if (String(error.code) === "23505") return out; // eşzamanlı başka tur ekledi
      throw new Error(error.message);
    }
    order = data;
    out.imported = true;
  } else {
    if (order.external_updated_at && new Date(order.external_updated_at) >= new Date(updatedAt)) return out; // değişmedi
    await sb.from("orders").update({
      external_status: externalStatus, external_updated_at: updatedAt,
      status: mapped.status, shipment_status: mapped.shipment_status,
      ...(mapped.status === "cancelled" ? {} : { payment_status: mapped.payment_status }),
      ...marketplacePaymentPatch(mapped.status, Number(order.total_amount || 0), order.invoice_status),
      ...(cargo.cargo_tracking_number ? cargo : {}),
      external_raw: o,
    }).eq("id", order.id);
    out.changed = true;
  }

  // ── Kalemler: yeni kalem → ekle + stok düş; iptal edilen kalem → stoğu geri ekle ──
  const { data: existing } = await sb.from("order_items").select("id, external_line_id, unit_price, external_status").eq("order_id", order.id);
  const byLine = new Map(((existing as any[]) || []).map((i) => [String(i.external_line_id), i]));
  for (const it of items) {
    const lineId = String(it.orderItemId);
    const sku = it.product?.sellerSku ? String(it.product.sellerSku) : null;
    const qty = Math.max(1, n(it.quantityOrdered) || n(it.fulfillment?.quantityUnfulfilled) + n(it.fulfillment?.quantityFulfilled) || 1);
    const unit = n(it.product?.price?.unitPrice?.amount);
    const cancelled = itemCancelled(it, fs);
    const prev = byLine.get(lineId);

    if (!prev) {
      const m = await match(sku);
      if (!m) out.warnings.push(`Eşleşmeyen ürün: ${it.product?.title ?? ""} (SKU ${sku ?? "—"}, ASIN ${it.product?.asin ?? "—"})`);
      const { data: row, error } = await sb.from("order_items").insert({
        order_id: order.id, product_id: m?.product_id ?? null, variant_id: m?.variant_id ?? null,
        quantity: qty, unit_price: round2(unit), sku, variant_name: null,
        title: it.product?.title ?? null, barcode: null,
        external_line_id: lineId, external_status: cancelled ? "CANCELLED" : fs,
      }).select("id").single();
      if (error) { if (String(error.code) === "23505") continue; throw new Error(error.message); }
      out.changed = true;
      if (m && !cancelled) {
        const { data: r } = await sb.rpc("mp_apply_item_stock", { p_item_id: row.id, p_source: "amazon_order" });
        if (r?.shortage) out.warnings.push(`Yetersiz stok (fazla satış): ${it.product?.title ?? sku} — gereken ${r.needed}, sitede ${r.available}`);
      }
      continue;
    }

    const wasCancelled = prev.external_status === "CANCELLED";
    const patch: Record<string, unknown> = { external_status: cancelled ? "CANCELLED" : fs };
    if (!Number(prev.unit_price) && unit > 0) patch.unit_price = round2(unit); // bekleyen siparişte fiyat sonradan gelir
    await sb.from("order_items").update(patch).eq("id", prev.id);
    if (cancelled && !wasCancelled) {
      await sb.rpc("mp_restore_item_stock", { p_item_id: prev.id, p_source: "amazon_cancel" });
    }
  }

  // Toplam tutar (iptal edilmeyen kalemler)
  const { data: its } = await sb.from("order_items").select("quantity, unit_price, external_status").eq("order_id", order.id);
  const total = round2(((its as any[]) || []).filter((i) => i.external_status !== "CANCELLED").reduce((s, i) => s + n(i.unit_price) * n(i.quantity), 0));
  if (total !== Number(order.total_amount || 0) && mapped.status !== "cancelled") {
    await sb.from("orders").update({ total_amount: total }).eq("id", order.id);
  }

  if (out.warnings.length) {
    const { data: cur } = await sb.from("orders").select("mp_warning").eq("id", order.id).maybeSingle();
    await sb.from("orders").update({ mp_warning: [cur?.mp_warning, ...out.warnings].filter(Boolean).join("\n"), mp_warning_ack: false }).eq("id", order.id);
  }
  return out;
}
