/* eslint-disable @typescript-eslint/no-explicit-any */
// Hepsiburada SİPARİŞLERİNİ sitenin siparişlerine aktarır (Trendyol ile aynı kurallar:
// üye yapılmaz, e-posta gitmez, stok kalem bazında tek seferlik düşer/iade olur).
// Hepsiburada'da sipariş KALEM bazlıdır ve birkaç listeden okunur:
//   1) Ödemesi tamamlanmış kalemler (Open)      → yeni kalem: sipariş + stok düş
//   2) Paketler (son 24 saat; otomatik paketleme) → aynı kalemler (adres/fatura/satıcı kodu ile)
//   3) İptal edilen kalemler (son 2 gün)         → stoğu geri ekle
//   4) Kargoya verilen / teslim edilen / edilemeyen paketler → durum + kargo takip no
// Sitedeki sipariş = Hepsiburada SİPARİŞ NUMARASI (external_package_id = orderNumber);
// kalem = lineItemId (external_line_id). İade (talep entegrasyonu) şimdilik yok → admin
// sipariş detayından "İadeyi stoğa ekle" kullanır.

import { createAdminClient } from "@/lib/supabase-admin";
import { getHepsiburadaConfig, hbHasCredentials, type HepsiburadaConfig } from "@/lib/marketplace/hepsiburada";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import type { OrderImportReport } from "@/lib/marketplace/orders";
import { marketplacePaymentPatch } from "@/lib/marketplace/payment-patch";

type AdminClient = ReturnType<typeof createAdminClient>;

const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;
const pick = (o: any, ...keys: string[]) => { for (const k of keys) if (o && o[k] != null && o[k] !== "") return o[k]; return undefined; };
const amount = (v: any) => (v && typeof v === "object" ? n(v.amount ?? v.Amount) : n(v));
const listOf = (j: any): any[] => (Array.isArray(j) ? j : (pick(j, "items", "Items", "data", "Data", "packages", "Packages") ?? []));
const iso = (v: any) => { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d.toISOString() : null; };

function host(c: HepsiburadaConfig, svc: "oms" | "listing") {
  const sit = c.stage ? "-sit" : "";
  return svc === "oms" ? `https://oms-external${sit}.hepsiburada.com` : `https://listing-external${sit}.hepsiburada.com`;
}

async function hbGet(c: HepsiburadaConfig, svc: "oms" | "listing", path: string) {
  const res = await fetch(host(c, svc) + path, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${c.merchantId}:${c.serviceKey}`).toString("base64"),
      "User-Agent": c.username,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (res.status === 404) return null; // boş liste bazı uçlarda 404 dönebiliyor
  if (!res.ok) throw new Error(`Hepsiburada ${res.status} (${path.split("?")[0]}): ${json?.message || json?.title || text.slice(0, 200)}`);
  return json;
}

// Tarihli uçlar (iptal / kargolanan / teslim edilen): Hepsiburada tarih biçimini uçtan uca farklı
// bekleyebiliyor ("WrongDateFormat"). Biçimler sırayla denenir, çalışan hatırlanır (Türkiye saati).
const trTime = (t: number) => new Date(t + 3 * 3600_000).toISOString();
const DATE_FORMATS: { name: string; fmt: (t: number, isEnd: boolean) => string }[] = [
  { name: "yyyy-MM-dd HH:mm", fmt: (t) => trTime(t).slice(0, 16).replace("T", " ") },
  { name: "yyyy-MM-dd", fmt: (t, isEnd) => trTime(isEnd ? t + 86400_000 : t).slice(0, 10) },
  { name: "yyyy-MM-ddTHH:mm:ss", fmt: (t) => trTime(t).slice(0, 19) },
];
let workingDateFormat = 0;
async function hbGetDated(c: HepsiburadaConfig, svc: "oms" | "listing", path: string, begin: number, end: number) {
  let last: unknown = null;
  for (let i = 0; i < DATE_FORMATS.length; i++) {
    const idx = (workingDateFormat + i) % DATE_FORMATS.length;
    const f = DATE_FORMATS[idx];
    const sep = path.includes("?") ? "&" : "?";
    try {
      const j = await hbGet(c, svc, `${path}${sep}begindate=${encodeURIComponent(f.fmt(begin, false))}&enddate=${encodeURIComponent(f.fmt(end, true))}`);
      workingDateFormat = idx;
      return j;
    } catch (e: any) {
      if (!/WrongDateFormat|date ?format/i.test(String(e?.message))) throw e;
      last = e;
    }
  }
  throw last;
}

// Satıcı stok kodu (veya HBSKU → listing'den satıcı kodu) → sitedeki varyant
function makeMatcher(sb: any, c: HepsiburadaConfig) {
  const cache = new Map<string, { variant_id: string; product_id: string } | null>();
  const hbToMerchant = new Map<string, string | null>();
  const byField = async (field: "sku" | "barcode", val: string) => {
    const { data } = await sb.from("product_variants").select("id, product_id").eq(field, val).limit(1).maybeSingle();
    return data ? { variant_id: data.id, product_id: data.product_id } : null;
  };
  return async (merchantSku: string | null, hbSku: string | null) => {
    let ms = merchantSku;
    if (!ms && hbSku) {
      if (!hbToMerchant.has(hbSku)) {
        try {
          const j = await hbGet(c, "listing", `/listings/merchantid/${encodeURIComponent(c.merchantId)}?offset=0&limit=1&hbSkuList=${encodeURIComponent(hbSku)}`);
          const l = listOf(j?.listings ? { items: j.listings } : j)[0];
          hbToMerchant.set(hbSku, l ? String(pick(l, "merchantSku", "MerchantSku") ?? "") || null : null);
        } catch { hbToMerchant.set(hbSku, null); }
      }
      ms = hbToMerchant.get(hbSku) ?? null;
    }
    if (!ms) return null;
    if (cache.has(ms)) return cache.get(ms)!;
    const primary: "sku" | "barcode" = c.matchField === "sku" ? "sku" : "barcode";
    const m = (await byField(primary, ms)) ?? (await byField(primary === "sku" ? "barcode" : "sku", ms));
    cache.set(ms, m);
    return m;
  };
}

type Line = {
  lineId: string; orderNumber: string; orderDate: string | null;
  hbSku: string | null; merchantSku: string | null; name: string | null; variant: string | null;
  qty: number; unit: number; total: number;
  customerName: string | null; email: string | null; phone: string | null;
  shipping: string | null; billing: string | null;
  cargo: string | null; tracking: string | null; packageNumber: string | null;
  raw: any;
};

// Ödemesi tamamlanmış kalem (Open) → Line
function fromOpenItem(it: any): Line {
  const sa = it.shippingAddress ?? {};
  const inv = it.invoice ?? {};
  const ia = inv.address ?? {};
  const addr = (a: any, extra: Record<string, unknown> = {}) => a && Object.keys(a).length ? JSON.stringify({
    name: a.name ?? "", phone: a.phoneNumber ?? "", address: a.address ?? "",
    district: a.town ?? a.district ?? "", city: a.city ?? "", ...extra,
  }) : null;
  const qty = Math.max(1, n(it.quantity));
  return {
    lineId: String(it.id), orderNumber: String(it.orderNumber ?? it.OrderNumber ?? ""), orderDate: iso(it.orderDate),
    hbSku: it.sku ?? null, merchantSku: it.merchantSku ?? null, name: it.name ?? it.productName ?? null,
    variant: Array.isArray(it.properties) ? it.properties.map((p: any) => p?.value ?? p?.Value).filter(Boolean).join(" / ") || null : null,
    qty, unit: amount(it.unitPrice) || amount(it.totalPrice) / qty, total: amount(it.totalPrice) || amount(it.unitPrice) * qty,
    customerName: it.customerName ?? sa.name ?? null, email: sa.email ?? ia.email ?? null, phone: sa.phoneNumber ?? null,
    shipping: addr(sa),
    billing: addr(ia, {
      ...(inv.taxOffice ? { tax_office: inv.taxOffice } : {}), ...(inv.taxNumber ? { tax_number: inv.taxNumber } : {}),
      ...(inv.turkishIdentityNumber ? { identity_no: inv.turkishIdentityNumber } : {}),
    }),
    cargo: it.cargoCompanyModel?.name ?? it.cargoCompany ?? null, tracking: null, packageNumber: null, raw: it,
  };
}

// Paket + kalemi → Line
function fromPackageItem(pkg: any, it: any): Line {
  const qty = Math.max(1, n(it.quantity));
  const unit = amount(it.price) || n(it.merchantUnitPrice) || amount(it.totalPrice) / qty;
  return {
    lineId: String(it.lineItemId ?? it.id), orderNumber: String(it.orderNumber ?? pkg.orderNumber ?? ""),
    orderDate: iso(it.orderDate ?? pkg.orderDate),
    hbSku: it.hbSku ?? it.sku ?? null, merchantSku: it.merchantSku ?? null, name: it.productName ?? it.name ?? null,
    variant: Array.isArray(it.properties) ? it.properties.map((p: any) => p?.value ?? p?.Value).filter(Boolean).join(" / ") || null : null,
    qty, unit, total: amount(it.totalPrice) || n(it.merchantTotalPrice) || unit * qty,
    customerName: it.customerName ?? pkg.recipientName ?? null, email: pkg.email ?? null, phone: pkg.phoneNumber ?? null,
    shipping: JSON.stringify({
      name: pkg.recipientName ?? "", phone: pkg.phoneNumber ?? "", address: pkg.shippingAddressDetail ?? "",
      district: pkg.shippingTown ?? pkg.shippingDistrict ?? "", city: pkg.shippingCity ?? "",
    }),
    billing: JSON.stringify({
      name: pkg.companyName ?? pkg.recipientName ?? "", address: pkg.billingAddress ?? "",
      district: pkg.billingTown ?? pkg.billingDistrict ?? "", city: pkg.billingCity ?? "",
      ...(pkg.taxOffice ? { tax_office: pkg.taxOffice } : {}), ...(pkg.taxNumber ? { tax_number: pkg.taxNumber } : {}),
      ...(pkg.identityNo ? { identity_no: pkg.identityNo } : {}),
    }),
    cargo: pkg.cargoCompany ?? null, tracking: pkg.barcode ? String(pkg.barcode) : null,
    packageNumber: pkg.packageNumber ? String(pkg.packageNumber) : null, raw: { package: { ...pkg, items: undefined }, item: it },
  };
}

export async function importHepsiburadaOrders(supabase: AdminClient = createAdminClient()): Promise<OrderImportReport> {
  const report: OrderImportReport = { channel: "hepsiburada", fetched: 0, imported: 0, updated: 0, stockChanges: 0, warnings: [], errors: [] };
  const sb = supabase as any;

  const { data: st } = await sb.from("settings").select("hepsiburada_orders_enabled, hepsiburada_orders_since").order("id").limit(1).maybeSingle();
  if (!st?.hepsiburada_orders_enabled) return { ...report, skipped: "disabled" };
  const cfg = await getHepsiburadaConfig(supabase);
  if (!hbHasCredentials(cfg)) return { ...report, skipped: "no_credentials" };

  const since = st.hepsiburada_orders_since ? new Date(st.hepsiburada_orders_since).getTime() : Date.now();
  const { data: state } = await sb.from("marketplace_order_sync").select("*").eq("channel", "hepsiburada").maybeSingle();
  const runStarted = Date.now();
  const m = encodeURIComponent(cfg.merchantId);
  const match = makeMatcher(sb, cfg);
  const begin = Math.max(since, runStarted - 2 * 86400_000);
  const end = runStarted;

  try {
    // 1) Ödemesi tamamlanmış kalemler (paketlenmemiş)
    const lines: Line[] = [];
    for (let page = 0; page < 10; page++) {
      const j = await hbGet(cfg, "oms", `/orders/merchantid/${m}?offset=${page * 100}&limit=100`);
      const items = listOf(j);
      lines.push(...items.map(fromOpenItem));
      if (items.length < 100) break;
    }
    // 2) Paketler (son 24 saat) — otomatik paketlenenleri de yakala
    for (let page = 0; page < 30; page++) {
      const j = await hbGet(cfg, "oms", `/packages/merchantid/${m}?timespan=24&offset=${page * 10}&limit=10`);
      const pkgs = listOf(j);
      for (const p of pkgs) for (const it of (p.items ?? p.Items ?? [])) lines.push(fromPackageItem(p, it));
      if (pkgs.length < 10) break;
    }
    report.fetched = lines.length;

    // Siparişe göre grupla ve işle
    const byOrder = new Map<string, Line[]>();
    for (const l of lines) {
      if (!l.orderNumber || !l.lineId) continue;
      if (!byOrder.has(l.orderNumber)) byOrder.set(l.orderNumber, []);
      const arr = byOrder.get(l.orderNumber)!;
      const prev = arr.findIndex((x) => x.lineId === l.lineId);
      if (prev >= 0) arr[prev] = { ...arr[prev], ...Object.fromEntries(Object.entries(l).filter(([, v]) => v != null)) } as Line; // paket bilgisi (takip no vb.) ekle
      else arr.push(l);
    }
    for (const [orderNumber, ls] of byOrder) {
      try {
        const r = await upsertHbOrder(sb, orderNumber, ls, since, match);
        if (r.imported) report.imported++;
        else if (r.added || r.changed) report.updated++;
        report.warnings.push(...r.warnings);
      } catch (e: any) {
        report.errors.push(`Sipariş ${orderNumber}: ${e?.message || e}`);
      }
    }

    // 3) İptal edilen kalemler → stoğu geri ekle (hata diğer adımları durdurmaz)
    let cj: any = null;
    try {
      cj = await hbGetDated(cfg, "oms", `/orders/merchantid/${m}/cancelled`, begin, end);
    } catch (e: any) {
      report.errors.push(`İptal listesi: ${e?.message || e}`);
    }
    for (const c of listOf(cj)) {
      const lineId = String(pick(c, "lineItemId", "LineItemId", "id") ?? "");
      const orderNumber = String(pick(c, "orderNumber", "OrderNumber") ?? "");
      if (!lineId || !orderNumber) continue;
      const { data: order } = await sb.from("orders").select("id").eq("channel", "hepsiburada").eq("external_package_id", orderNumber).maybeSingle();
      if (!order) continue;
      const { data: item } = await sb.from("order_items").select("id, external_status").eq("order_id", order.id).eq("external_line_id", lineId).maybeSingle();
      if (!item || item.external_status === "Cancelled") continue;
      await sb.from("order_items").update({ external_status: "Cancelled" }).eq("id", item.id);
      await sb.rpc("mp_restore_item_stock", { p_item_id: item.id, p_source: "hepsiburada_cancel" });
      const { data: rest } = await sb.from("order_items").select("id").eq("order_id", order.id).neq("external_status", "Cancelled");
      if (!rest?.length) {
        const { data: cur } = await sb.from("orders").select("total_amount, invoice_status").eq("id", order.id).maybeSingle();
        await sb.from("orders").update({
          status: "cancelled", shipment_status: "cancelled", external_status: "Cancelled", external_updated_at: new Date().toISOString(),
          ...marketplacePaymentPatch("cancelled", Number(cur?.total_amount || 0), cur?.invoice_status),
        }).eq("id", order.id);
      }
      report.updated++;
    }

    // 4) Kargo / teslim durumları
    const statusLists: [string, { status: string; shipment_status: string; external: string }][] = [
      ["shipped", { status: "shipped", shipment_status: "shipped", external: "Shipped" }],
      ["delivered", { status: "delivered", shipment_status: "delivered", external: "Delivered" }],
      ["undelivered", { status: "shipped", shipment_status: "undelivered", external: "Undelivered" }],
    ];
    for (const [path, mapped] of statusLists) {
      let j: any = null;
      try {
        j = await hbGetDated(cfg, "oms", `/packages/merchantid/${m}/${path}`, begin, end);
      } catch (e: any) {
        report.errors.push(`${path} listesi: ${e?.message || e}`);
        continue;
      }
      for (const p of listOf(j)) {
        const orderNumber = String(pick(p, "orderNumber", "OrderNumber") ?? "");
        if (!orderNumber) continue;
        const tracking = pick(p, "barcode", "Barcode");
        const { data: order } = await sb.from("orders").select("id, external_status").eq("channel", "hepsiburada").eq("external_package_id", orderNumber).maybeSingle();
        if (!order || order.external_status === mapped.external || order.external_status === "Cancelled") continue;
        await sb.from("orders").update({
          status: mapped.status, shipment_status: mapped.shipment_status, external_status: mapped.external,
          external_updated_at: new Date().toISOString(),
          ...(tracking ? { cargo_tracking_number: String(tracking) } : {}),
        }).eq("id", order.id);
        report.updated++;
      }
    }

    const { count } = await sb.from("stock_events").select("id", { count: "exact", head: true })
      .in("source", ["hepsiburada_order", "hepsiburada_cancel"]).gte("created_at", new Date(runStarted).toISOString());
    report.stockChanges = count ?? 0;
    if (report.stockChanges > 0) kickMarketplaceSync(500);

    await sb.from("marketplace_order_sync").upsert({
      channel: "hepsiburada", cursor_at: new Date(runStarted).toISOString(), last_run_at: new Date().toISOString(),
      last_ok_at: report.errors.length ? state?.last_ok_at ?? null : new Date().toISOString(),
      last_error: report.errors[0] ?? null,
      imported_total: (state?.imported_total ?? 0) + report.imported,
      updated_total: (state?.updated_total ?? 0) + report.updated,
    });
  } catch (e: any) {
    report.errors.push(e?.message || String(e));
    await sb.from("marketplace_order_sync").upsert({
      channel: "hepsiburada", cursor_at: state?.cursor_at ?? null, last_run_at: new Date().toISOString(),
      last_ok_at: state?.last_ok_at ?? null, last_error: report.errors[0],
      imported_total: state?.imported_total ?? 0, updated_total: state?.updated_total ?? 0,
    });
  }
  return report;
}

type Matcher = ReturnType<typeof makeMatcher>;

async function upsertHbOrder(sb: any, orderNumber: string, lines: Line[], since: number, match: Matcher) {
  const out = { imported: false, added: 0, changed: false, warnings: [] as string[] };
  const first = lines[0];
  let { data: order } = await sb.from("orders").select("id, cargo_tracking_number, external_status").eq("channel", "hepsiburada").eq("external_package_id", orderNumber).maybeSingle();

  if (!order) {
    if (first.orderDate && new Date(first.orderDate).getTime() < since) return out; // entegrasyon açılmadan önceki sipariş
    const { data, error } = await sb.from("orders").insert({
      channel: "hepsiburada", user_id: null,
      external_order_number: orderNumber, external_package_id: orderNumber,
      external_status: first.packageNumber ? "Packaged" : "Open", external_updated_at: new Date().toISOString(),
      created_at: first.orderDate ?? new Date().toISOString(),
      status: "processing", payment_status: "paid", shipment_status: "preparing", invoice_status: "pending",
      payment_method: "marketplace", total_amount: 0, shipping_cost: 0,
      shipping_method: first.cargo, shipping_address: first.shipping, billing_address: first.billing ?? first.shipping,
      customer_name: first.customerName || "Hepsiburada Müşterisi", customer_email: first.email, customer_phone: first.phone,
      cargo_provider: first.cargo, cargo_tracking_number: first.tracking,
      external_raw: first.raw,
    }).select("id, cargo_tracking_number, external_status").single();
    if (error) {
      if (String(error.code) === "23505") return out;
      throw new Error(error.message);
    }
    order = data;
    out.imported = true;
  }

  const { data: existing } = await sb.from("order_items").select("external_line_id").eq("order_id", order.id);
  const known = new Set(((existing as any[]) || []).map((i) => String(i.external_line_id)));
  for (const l of lines) {
    if (known.has(l.lineId)) continue;
    const mt = await match(l.merchantSku, l.hbSku);
    if (!mt) out.warnings.push(`Eşleşmeyen ürün: ${l.name ?? ""} (satıcı kodu ${l.merchantSku ?? "—"}, HBSKU ${l.hbSku ?? "—"})`);
    const { data: item, error } = await sb.from("order_items").insert({
      order_id: order.id, product_id: mt?.product_id ?? null, variant_id: mt?.variant_id ?? null,
      quantity: l.qty, unit_price: round2(l.unit), sku: l.merchantSku, variant_name: l.variant,
      title: l.name, barcode: null, external_line_id: l.lineId, external_status: "Open",
    }).select("id").single();
    if (error) { if (String(error.code) === "23505") continue; throw new Error(error.message); }
    out.added++;
    if (mt) {
      const { data: r } = await sb.rpc("mp_apply_item_stock", { p_item_id: item.id, p_source: "hepsiburada_order" });
      if (r?.shortage) out.warnings.push(`Yetersiz stok (fazla satış): ${l.name ?? l.merchantSku} — gereken ${r.needed}, sitede ${r.available}`);
    }
  }

  // Toplam tutar + paket/takip bilgisi
  const tracking = lines.find((l) => l.tracking)?.tracking ?? null;
  const pkgNo = lines.find((l) => l.packageNumber)?.packageNumber ?? null;
  if (out.added || (tracking && tracking !== order.cargo_tracking_number)) {
    const { data: its } = await sb.from("order_items").select("quantity, unit_price, external_status").eq("order_id", order.id);
    const total = ((its as any[]) || []).filter((i) => i.external_status !== "Cancelled").reduce((s, i) => s + n(i.unit_price) * n(i.quantity), 0);
    await sb.from("orders").update({
      total_amount: round2(total),
      ...(tracking ? { cargo_tracking_number: tracking } : {}),
      ...(pkgNo && order.external_status === "Open" ? { external_status: "Packaged" } : {}),
    }).eq("id", order.id);
    out.changed = true;
  }
  if (out.warnings.length) {
    const { data: cur } = await sb.from("orders").select("mp_warning").eq("id", order.id).maybeSingle();
    await sb.from("orders").update({ mp_warning: [cur?.mp_warning, ...out.warnings].filter(Boolean).join("\n"), mp_warning_ack: false }).eq("id", order.id);
  }
  return out;
}
