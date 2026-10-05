/* eslint-disable @typescript-eslint/no-explicit-any */
// Pazaryeri SİPARİŞLERİNİ sitenin siparişlerine aktarır (Trendyol burada; Hepsiburada: hb-orders.ts).
// Akış (dakikalık cron + "Şimdi çek"): pazaryerinden son değişen paketleri al →
//   yeni paket: sipariş + kalemler oluştur (ürünü barkod / stok koduyla eşleştir) →
//     iptal olmayan kalemlerin stoğunu düş (mp_apply_item_stock, tek seferlik)
//   bilinen paket: durum/kargo bilgisini güncelle → iptal edilen kalem/paket stoğunu
//     geri ekle (mp_restore_item_stock, tek seferlik)
// Stok değişince mevcut senkron (tetikleyici + kuyruk) yeni stoğu TÜM pazaryerlerine gönderir.
// Kurallar: müşteri üye yapılmaz, e-posta gitmez, iadede stok admin onayıyla eklenir.

import { createAdminClient } from "@/lib/supabase-admin";
import { getTrendyolConfig, hasCredentials, type TrendyolConfig } from "@/lib/marketplace/trendyol";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import { importHepsiburadaOrders } from "@/lib/marketplace/hb-orders";
import { marketplacePaymentPatch } from "@/lib/marketplace/payment-patch";

type AdminClient = ReturnType<typeof createAdminClient>;
export type OrderChannel = "trendyol" | "hepsiburada";

export type OrderImportReport = {
  channel: OrderChannel;
  skipped?: "disabled" | "no_credentials";
  fetched: number;
  imported: number;
  updated: number;
  stockChanges: number;
  warnings: string[];
  errors: string[];
};

// ── Trendyol durum → sitenin sipariş durumu ──
const TY_CANCELLED = new Set(["Cancelled", "UnSupplied"]);
function mapTrendyolStatus(s: string): { status: string; shipment_status: string } {
  switch (s) {
    case "Shipped": return { status: "shipped", shipment_status: "shipped" };
    case "Delivered":
    case "AtCollectionPoint": return { status: "delivered", shipment_status: "delivered" };
    case "UnDelivered": return { status: "shipped", shipment_status: "undelivered" };
    case "Returned": return { status: "refunded", shipment_status: "returned" };
    case "Cancelled":
    case "UnSupplied": return { status: "cancelled", shipment_status: "cancelled" };
    default: return { status: "processing", shipment_status: "preparing" }; // Created, Awaiting, Picking, Invoiced, Repack...
  }
}

const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const round2 = (v: number) => Math.round(v * 100) / 100;

// Trendyol Order V2 (eski /orders ucu 15.10.2026'da kapanıyor; yeni hesaplara erişim vermiyor)
async function trendyolPage(c: TrendyolConfig, params: Record<string, string>) {
  const base = c.stage ? "https://stageapigw.trendyol.com" : "https://apigw.trendyol.com";
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base}/integration/order/sellers/${encodeURIComponent(c.sellerId)}/v2/orders?${qs}`, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString("base64"),
      "User-Agent": `${c.sellerId} - SelfIntegration`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) throw new Error(`Trendyol sipariş ${res.status}: ${json?.errors?.[0]?.message || json?.message || text.slice(0, 200)}`);
  return json;
}

// Barkod / stok kodu → varyant (önbellekli)
async function makeMatcher(sb: any) {
  const cache = new Map<string, { variant_id: string; product_id: string; title: string } | null>();
  return async (barcode: string | null, stockCode: string | null) => {
    const key = `${barcode || ""}|${stockCode || ""}`;
    if (cache.has(key)) return cache.get(key)!;
    let row: any = null;
    if (barcode) {
      const { data } = await sb.from("product_variants").select("id, product_id, products(title)").eq("barcode", barcode).limit(1).maybeSingle();
      row = data;
    }
    if (!row && stockCode) {
      const { data } = await sb.from("product_variants").select("id, product_id, products(title)").eq("sku", stockCode).limit(1).maybeSingle();
      row = data;
    }
    const out = row ? { variant_id: row.id, product_id: row.product_id, title: row.products?.title ?? "" } : null;
    cache.set(key, out);
    return out;
  };
}

function addressJson(a: any) {
  if (!a) return null;
  return JSON.stringify({
    name: a.fullName || [a.firstName, a.lastName].filter(Boolean).join(" "),
    phone: a.phone ?? "",
    address: a.fullAddress || [a.address1, a.address2, a.neighborhood].filter(Boolean).join(" "),
    district: a.district ?? "",
    city: a.city ?? "",
    ...(a.company ? { company: a.company } : {}),
    ...(a.taxOffice ? { tax_office: a.taxOffice } : {}),
    ...(a.taxNumber ? { tax_number: a.taxNumber } : {}),
  });
}

/** Trendyol siparişlerini al ve sitedeki siparişlere işle. */
export async function importTrendyolOrders(supabase: AdminClient = createAdminClient()): Promise<OrderImportReport> {
  const report: OrderImportReport = { channel: "trendyol", fetched: 0, imported: 0, updated: 0, stockChanges: 0, warnings: [], errors: [] };
  const sb = supabase as any;

  const { data: st } = await sb.from("settings").select("trendyol_orders_enabled, trendyol_orders_since").order("id").limit(1).maybeSingle();
  if (!st?.trendyol_orders_enabled) return { ...report, skipped: "disabled" };
  const cfg = await getTrendyolConfig(supabase);
  if (!hasCredentials(cfg)) return { ...report, skipped: "no_credentials" };

  const since = st.trendyol_orders_since ? new Date(st.trendyol_orders_since).getTime() : Date.now();
  const { data: state } = await sb.from("marketplace_order_sync").select("*").eq("channel", "trendyol").maybeSingle();
  const runStarted = Date.now();
  const cursor = state?.cursor_at ? new Date(state.cursor_at).getTime() : since;
  const stopBefore = cursor - 10 * 60_000; // 10 dk geriye taşma payı (geç yansıyan değişiklikler)
  const startDate = Math.max(since - 60_000, runStarted - 14 * 86400_000 + 60_000); // Trendyol en çok 2 hafta
  let maxSeen = cursor;

  const match = await makeMatcher(sb);
  const touched: string[] = [];

  try {
    for (let page = 0; page < 20; page++) {
      const j = await trendyolPage(cfg, {
        startDate: String(startDate), endDate: String(runStarted), page: String(page), size: "200",
        orderByField: "PackageLastModifiedDate", orderByDirection: "DESC",
      });
      const content: any[] = j?.content ?? [];
      report.fetched += content.length;
      let reachedOld = false;

      for (const pkg of content) {
        const lastMod = n(pkg.lastModifiedDate) || n(pkg.orderDate);
        if (lastMod < stopBefore) { reachedOld = true; break; }
        maxSeen = Math.max(maxSeen, lastMod);
        try {
          const r = await upsertTrendyolPackage(sb, pkg, since, match);
          if (r === "imported" || r.startsWith("warn:")) report.imported++;
          else if (r === "updated") report.updated++;
          if (r.startsWith("warn:")) report.warnings.push(r.slice(5));
          if (r !== "skipped" && r !== "unchanged") touched.push(String(pkg.shipmentPackageId ?? pkg.id));
        } catch (e: any) {
          report.errors.push(`Paket ${pkg.shipmentPackageId ?? pkg.id}: ${e?.message || e}`);
        }
      }
      if (reachedOld || content.length < 200 || page + 1 >= n(j?.totalPages)) break;
    }

    // Stok değişen kalem sayısı (bu turda)
    if (touched.length) {
      const { count } = await sb.from("stock_events").select("id", { count: "exact", head: true })
        .in("source", ["trendyol_order", "trendyol_cancel"]).gte("created_at", new Date(runStarted).toISOString());
      report.stockChanges = count ?? 0;
      if (report.stockChanges > 0) kickMarketplaceSync(500);
    }

    await sb.from("marketplace_order_sync").upsert({
      channel: "trendyol",
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
      channel: "trendyol", cursor_at: state?.cursor_at ?? new Date(since).toISOString(),
      last_run_at: new Date().toISOString(), last_ok_at: state?.last_ok_at ?? null, last_error: report.errors[0],
      imported_total: state?.imported_total ?? 0, updated_total: state?.updated_total ?? 0,
    });
  }
  return report;
}

type Matcher = Awaited<ReturnType<typeof makeMatcher>>;

async function upsertTrendyolPackage(sb: any, pkg: any, since: number, match: Matcher): Promise<string> {
  const packageId = String(pkg.shipmentPackageId ?? pkg.id);
  const tyStatus = String(pkg.shipmentPackageStatus ?? pkg.status ?? "Created");
  const lastMod = new Date(n(pkg.lastModifiedDate) || n(pkg.orderDate) || Date.now()).toISOString();
  const mapped = mapTrendyolStatus(tyStatus);
  const lines: any[] = pkg.lines ?? [];
  const cargo = {
    cargo_provider: pkg.cargoProviderName ?? null,
    cargo_tracking_number: pkg.cargoTrackingNumber != null ? String(pkg.cargoTrackingNumber) : null,
    cargo_tracking_url: pkg.cargoTrackingLink ?? null,
  };

  const { data: existing } = await sb.from("orders").select("id, external_updated_at, status, total_amount, invoice_status")
    .eq("channel", "trendyol").eq("external_package_id", packageId).maybeSingle();

  // ── Yeni paket ──
  if (!existing) {
    if (n(pkg.orderDate) && n(pkg.orderDate) < since) return "skipped"; // entegrasyon açılmadan önceki sipariş
    const total = n(pkg.packageTotalPrice ?? pkg.totalPrice);
    const name = [pkg.customerFirstName, pkg.customerLastName].filter(Boolean).join(" ") || pkg.shipmentAddress?.fullName || "Trendyol Müşterisi";

    const { data: order, error } = await sb.from("orders").insert({
      channel: "trendyol",
      user_id: null,
      external_order_number: String(pkg.orderNumber ?? ""),
      external_package_id: packageId,
      external_status: tyStatus,
      external_updated_at: lastMod,
      created_at: new Date(n(pkg.orderDate) || Date.now()).toISOString(),
      status: mapped.status,
      payment_status: "paid",
      shipment_status: mapped.shipment_status,
      invoice_status: "pending",
      ...marketplacePaymentPatch(mapped.status, round2(total), "pending"),
      payment_method: "marketplace",
      total_amount: round2(total),
      shipping_cost: 0,
      shipping_method: cargo.cargo_provider,
      shipping_address: addressJson(pkg.shipmentAddress),
      billing_address: addressJson(pkg.invoiceAddress),
      customer_name: name,
      customer_email: pkg.customerEmail ?? null,
      customer_phone: pkg.shipmentAddress?.phone ?? null,
      ...cargo,
      external_raw: pkg,
    }).select("id").single();
    if (error) {
      if (String(error.code) === "23505") return "unchanged"; // eşzamanlı başka tur ekledi
      throw new Error(error.message);
    }

    const warnings: string[] = [];
    for (const l of lines) {
      const qty = Math.max(1, n(l.quantity));
      const gross = n(l.lineGrossAmount ?? l.amount ?? n(l.lineUnitPrice ?? l.price) * qty);
      const disc = n(l.lineTotalDiscount ?? l.discount);
      const barcode = l.barcode ? String(l.barcode) : null;
      const stockCode = l.stockCode ?? l.merchantSku ?? null;
      const m = await match(barcode, stockCode ? String(stockCode) : null);
      if (!m) warnings.push(`Eşleşmeyen ürün: ${l.productName ?? ""} (barkod ${barcode ?? "—"})`);
      const { data: item, error: iErr } = await sb.from("order_items").insert({
        order_id: order.id,
        product_id: m?.product_id ?? null,
        variant_id: m?.variant_id ?? null,
        quantity: qty,
        unit_price: round2((gross - disc) / qty),
        sku: stockCode ? String(stockCode) : null,
        variant_name: [l.productSize, l.productColor].filter(Boolean).join(" / ") || null,
        title: l.productName ?? null,
        barcode,
        external_line_id: String(l.lineId ?? l.id ?? ""),
        external_status: l.orderLineItemStatusName ?? null,
      }).select("id").single();
      if (iErr) throw new Error(iErr.message);

      const lineCancelled = TY_CANCELLED.has(String(l.orderLineItemStatusName)) || TY_CANCELLED.has(tyStatus);
      if (m && !lineCancelled) {
        const { data: r } = await sb.rpc("mp_apply_item_stock", { p_item_id: item.id, p_source: "trendyol_order" });
        if (r?.shortage) warnings.push(`Yetersiz stok (fazla satış): ${l.productName ?? barcode} — gereken ${r.needed}, sitede ${r.available}`);
      }
    }
    if (warnings.length) await sb.from("orders").update({ mp_warning: warnings.join("\n") }).eq("id", order.id);
    return warnings.length ? `warn:${warnings[0]}` : "imported";
  }

  // ── Bilinen paket: değişmediyse dokunma ──
  if (existing.external_updated_at && new Date(existing.external_updated_at) >= new Date(lastMod)) return "unchanged";

  await sb.from("orders").update({
    external_status: tyStatus,
    external_updated_at: lastMod,
    status: mapped.status,
    shipment_status: mapped.shipment_status,
    ...marketplacePaymentPatch(mapped.status, Number(existing.total_amount || 0), existing.invoice_status),
    ...cargo,
    external_raw: pkg,
  }).eq("id", existing.id);

  // İptal edilen kalem / paket → stoğu geri ekle (iade = Returned için OTOMATİK DEĞİL)
  const { data: items } = await sb.from("order_items").select("id, external_line_id").eq("order_id", existing.id);
  const byLine = new Map(((items as any[]) || []).map((i) => [String(i.external_line_id), i.id]));
  for (const l of lines) {
    const itemId = byLine.get(String(l.lineId ?? l.id ?? ""));
    if (!itemId) continue;
    await sb.from("order_items").update({ external_status: l.orderLineItemStatusName ?? null }).eq("id", itemId);
    if (TY_CANCELLED.has(String(l.orderLineItemStatusName)) || TY_CANCELLED.has(tyStatus)) {
      await sb.rpc("mp_restore_item_stock", { p_item_id: itemId, p_source: "trendyol_cancel" });
    }
  }
  return "updated";
}

/** Tüm kanalların sipariş aktarımı (cron). */
export async function importMarketplaceOrders(supabase: AdminClient = createAdminClient()): Promise<OrderImportReport[]> {
  const out: OrderImportReport[] = [];
  for (const [channel, fn] of [["trendyol", importTrendyolOrders], ["hepsiburada", importHepsiburadaOrders]] as const) {
    try {
      out.push(await fn(supabase));
    } catch (e: any) {
      out.push({ channel, fetched: 0, imported: 0, updated: 0, stockChanges: 0, warnings: [], errors: [e?.message || String(e)] });
    }
  }
  return out;
}

/** İade gelen (pazaryerinde "Returned") siparişin stoğunu admin onayıyla geri ekle. */
export async function restockReturnedOrder(orderId: string, supabase: AdminClient = createAdminClient()) {
  const sb = supabase as any;
  const { data: items } = await sb.from("order_items").select("id").eq("order_id", orderId);
  let restored = 0;
  for (const it of (items as any[]) || []) {
    const { data: r } = await sb.rpc("mp_restore_item_stock", { p_item_id: it.id, p_source: "marketplace_return" });
    if (r?.restored) restored += Number(r.restored);
  }
  if (restored > 0) kickMarketplaceSync(500);
  // Pazaryeri iadesi depoya geldi → kargo "İade geldi", ödeme "İade edildi" (pazaryeri müşteriye iade etti; ciroda 0)
  const { data: o } = await sb.from("orders").select("total_amount, invoice_status, payment_status").eq("id", orderId).maybeSingle();
  if (o && o.payment_status !== "refunded") {
    await sb.from("orders").update({
      shipment_status: "returned", status: "refunded",
      ...marketplacePaymentPatch("refunded", Number(o.total_amount || 0), o.invoice_status),
    }).eq("id", orderId);
    await sb.from("order_events").insert({ order_id: orderId, type: "return_received", note: `Pazaryeri iadesi depoya geldi; ${restored} adet stoğa eklendi` });
  }
  return restored;
}
