/* eslint-disable @typescript-eslint/no-explicit-any */
// SİPARİŞ FATURASI — Paraşüt (kullanıcı kararları 2026-10-13):
//   * Şimdilik elle: siparişte "Faturayı kes (Paraşüt)". Adımlar kaldığı yerden devam eder (tekrar basılabilir).
//   * KDV: her kalemin Paraşüt ürün kaydındaki oran (ayakkabı %10, "Kargo" hizmeti %20). Site fiyatları KDV
//     dahil → KDV hariç birim fiyat = fiyat / (1 + oran), fatura kesildiği anda hesaplanır.
//   * Kupon indirimi + YeriHisset Kredisi ürün fiyatından düşer (3.500 − 300 kredi → 3.200 olarak gider);
//     kalemlere tutarlarıyla orantılı dağıtılır, kargoya dokunulmaz. Kargo ücreti varsa ayrı "Kargo" kalemi.
//   * Kanal ayarı (parasut_channel_settings): tahsilat hesabı + "tahsil edildi" (Trendyol → kasa "Trendyol").
//   * Alıcı e-Fatura kullanıcısıysa (VKN gelen kutusu) e-Fatura, değilse e-Arşiv (internet satışı + kargo
//     firması adı / VKN / tarih). İş arka planda → dakikada bir takip (cron) → PDF özel depoya → "Faturalandı".
// İade faturası şimdilik Paraşüt'te elle.

import { createAdminClient } from "@/lib/supabase-admin";
import { parasutCall, parasutConfig, ParasutError } from "@/lib/parasut";
import { pushInvoiceToMarketplace } from "@/lib/marketplace-invoice";
import { sendInvoiceEmail } from "@/lib/invoice-mail";
import { isTestOrder } from "@/lib/notifications";

type Sb = ReturnType<typeof createAdminClient>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const day = (d: Date | string = new Date()) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
// Sipariş / ödeme tarihi faturada bugünden ileri olamaz (Paraşüt reddeder) — eski Trendyol kayıtlarında saat +3 kaymıştı
const pastDay = (d: Date | string) => day(new Date(Math.min(new Date(d).getTime(), Date.now())));
const norm = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]/g, "");
const parse = (v: any) => { try { return typeof v === "string" ? JSON.parse(v) : v || {}; } catch { return {}; } };

const ORDER_COLS = `id, order_number, external_order_number, channel, status, created_at, payment_method, payment_status, invoice_status,
  total_amount, shipping_cost, coupon_discount, credit_used, import_source, billing_address, shipping_address, customer_name, customer_email, customer_phone,
  cargo_provider, kargonomi_provider, shipping_method, parasut_invoice_id, parasut_status, parasut_job_id, parasut_e_doc_id, parasut_e_doc_type,
  parasut_paid, parasut_diff_ok, refunded_amount, profiles(email, first_name, last_name, phone),
  order_items(id, quantity, returned_qty, unit_price, product_id, variant_id, variant_name, title, sku, barcode, products(title, parasut_product_id), product_variants(parasut_product_id))`;

async function loadOrder(sb: Sb, id: string) {
  const { data, error } = await (sb as any).from("orders").select(ORDER_COLS).eq("id", id).maybeSingle();
  if (error || !data) throw new ParasutError(404, "Sipariş bulunamadı.");
  return data;
}
const save = (sb: Sb, id: string, f: Record<string, unknown>) => (sb as any).from("orders").update(f).eq("id", id);

type Line = { productId: string; vat: number; qty: number; gross: number; title: string };

/** Faturadan önce her şeyi denetle (Paraşüt'e bir şey yazmadan): eşleşme, KDV, tutar, kargo firması, hesap */
async function prepare(sb: Sb, o: any) {
  const s = sb as any;
  const channel = o.channel || "site";
  const errs: string[] = [];
  if (o.status === "cancelled") errs.push("İptal edilmiş sipariş faturalanmaz.");
  if (!["paid", "partial_refund"].includes(o.payment_status)) errs.push("Ödemesi alınmamış sipariş faturalanmaz.");
  if (o.invoice_status && o.invoice_status !== "pending") errs.push(`Fatura durumu “${o.invoice_status}” — zaten faturalanmış.`);

  const items = (o.order_items as any[]) || [];
  const pids = [...new Set(items.map((i) => i.product_variants?.parasut_product_id || i.products?.parasut_product_id).filter(Boolean))];
  const { data: pps } = pids.length ? await s.from("parasut_products").select("parasut_id, vat_rate").in("parasut_id", pids) : { data: [] };
  const vat = new Map(((pps as any[]) || []).map((p) => [p.parasut_id, p.vat_rate == null ? null : Number(p.vat_rate)]));

  const lines: Line[] = [];
  for (const i of items) {
    // Geri gelen adet faturalanmaz (değişimde tutulmayan numara / kısmi iade — fatura karar netleşince kesilir)
    const qty = Number(i.quantity) - Number(i.returned_qty || 0);
    if (qty <= 0) continue;
    const title = `${i.products?.title ?? i.title ?? "Ürün"}${i.variant_name ? ` — ${i.variant_name}` : ""}`;
    // Pazaryeri satırı sitedeki ürüne hiç bağlanmamışsa (gelirken eşleşmedi) sorun Paraşüt'te değil, satırda
    if (!i.variant_id && !i.product_id) { errs.push(`Satır sitedeki ürüne bağlı değil: ${title} — siparişte o satırın SKU kutusuna sitedeki SKU'yu (ya da barkodu) gir, sonra yeniden dene.`); continue; }
    const pid = i.product_variants?.parasut_product_id || i.products?.parasut_product_id;
    if (!pid) { errs.push(`Paraşüt ürünüyle eşleşmemiş: ${title} (Paraşüt ürün eşleştirme sayfası)`); continue; }
    const v = vat.get(pid);
    if (v == null) { errs.push(`Paraşüt'te KDV oranı yok: ${title} — ürünleri yeniden çek`); continue; }
    lines.push({ productId: pid, vat: v, qty, gross: r2(Number(i.unit_price) * qty), title });
  }

  // Kupon + kredi (yalnız site) → ürün kalemlerine orantılı; kuruş farkı en büyük kaleme.
  // Eski siteden (WooCommerce) aktarılan siparişte satır fiyatı ZATEN kupon düşülmüş gelir → ikinci kez düşülmez
  // (2026-10-31: "Kalemler 2799.2 TL sipariş tutarıyla 3149.1 TL tutmuyor").
  const disc = channel === "site" && !o.import_source ? r2(Number(o.coupon_discount || 0) + Number(o.credit_used || 0)) : 0;
  const base = lines.reduce((a, l) => a + l.gross, 0);
  if (disc > 0 && base > 0) {
    let left = disc;
    const order = [...lines].sort((a, b) => b.gross - a.gross);
    for (const l of order.slice(1)) { const d = r2((disc * l.gross) / base); l.gross = r2(l.gross - d); left = r2(left - d); }
    order[0].gross = r2(order[0].gross - left);
    if (lines.some((l) => l.gross < 0)) errs.push("İndirim ürün tutarından büyük.");
  }

  // Kargo ücreti → ayrı kalem (Paraşüt "Kargo" hizmeti; KDV oranı onun kaydından, genelde %20)
  const ship = channel === "site" ? r2(Number(o.shipping_cost || 0)) : 0;
  if (ship > 0) {
    const { data: st } = await s.from("settings").select("parasut_shipping_product_id").order("id").limit(1).maybeSingle();
    const sp = String(st?.parasut_shipping_product_id || "");
    const { data: spp } = sp ? await s.from("parasut_products").select("vat_rate").eq("parasut_id", sp).maybeSingle() : { data: null };
    if (!sp) errs.push("Siparişte kargo ücreti var: Paraşüt'te “Kargo” hizmetini Ayarlar › Paraşüt'te seç.");
    else if (spp?.vat_rate == null) errs.push("“Kargo” hizmetinin KDV oranı Paraşüt'te yok — ürünleri yeniden çek.");
    else lines.push({ productId: sp, vat: Number(spp.vat_rate), qty: 1, gross: ship, title: "Kargo" });
  }

  const total = r2(lines.reduce((a, l) => a + l.gross, 0));
  const expected = r2(Number(o.total_amount) - Number(o.refunded_amount || 0));
  if (lines.length && Math.abs(total - expected) > 0.01)
    errs.push(`Kalemler (${total} TL) sipariş tutarıyla (${expected} TL${Number(o.refunded_amount || 0) > 0 ? ", iade düşülmüş" : ""}) tutmuyor.`);

  // Alıcı
  const bill = { ...parse(o.shipping_address), ...parse(o.billing_address) };
  const p = o.profiles || {};
  // Vergi kimliği: VKN (10, şirket) ya da TCKN (11, şahıs şirketi / kimlik numarasını veren kişi). Fatura adresinde yoksa
  // pazaryerinin gönderdiği TC kimlik (Hepsiburada identity_no); o da yoksa e-Arşiv'de 11111111111.
  const rawTax = String(bill.tax_number || "").replace(/\D/g, "");
  const rawId = String(bill.identity_no || "").replace(/\D/g, "");
  const taxNo = rawTax.length === 10 || rawTax.length === 11 ? rawTax : rawId.length === 11 && rawId !== "11111111111" ? rawId : "";
  const corporate = taxNo.length === 10;
  // Şahıs şirketi (TCKN + vergi dairesi / ünvan): fatura ünvanla kesilir; e-fatura mükellefiyse e-fatura gider
  const business = corporate || (taxNo.length === 11 && !!(bill.is_corporate || bill.company_name || bill.tax_office));
  const name = String((business ? bill.company_name || bill.company : null) || bill.name || o.customer_name || [p.first_name, p.last_name].filter(Boolean).join(" ")).trim();
  if (!name) errs.push("Alıcı adı yok (fatura adresi).");
  if (!bill.city || !bill.address) errs.push("Fatura adresinde il / açık adres eksik.");

  // Kanal ayarı + kargo firması (e-Arşiv internet satışı)
  const { data: ch } = await s.from("parasut_channel_settings").select("*").eq("channel", channel).maybeSingle();
  if (!ch) errs.push(`“${channel}” kanalı için Paraşüt ayarı yok.`);
  else if (ch.mark_paid && !ch.account_id) errs.push(`“${channel}” kanalının tahsilat hesabı seçilmemiş (Ayarlar › Paraşüt).`);
  const carrierName = o.kargonomi_provider || o.cargo_provider || null;
  let carrier: { name: string; vkn: string } | null = null;
  if (!corporate) {
    const { data: cs } = await s.from("cargo_carriers").select("name, vkn");
    const want = norm(carrierName);
    const c = ((cs as any[]) || []).find((x) => want && (want.startsWith(norm(x.name).slice(0, 4)) || norm(x.name).startsWith(want.slice(0, 4))));
    if (!carrierName) errs.push("Kargo firması belli değil — e-Arşiv için gerekli (önce kargoya ver).");
    else if (!c?.vkn) errs.push(`“${carrierName}” kargo firmasının VKN'si girilmemiş (Ayarlar › Paraşüt › Kargo firmaları).`);
    else carrier = { name: c.name, vkn: c.vkn };
  }

  return { errs, lines, total, bill, taxNo, corporate, business, name, email: o.customer_email || p.email || null, phone: bill.phone || o.customer_phone || p.phone || null, ch, carrier, channel };
}

async function findOrCreateContact(sb: Sb, x: Awaited<ReturnType<typeof prepare>>) {
  const filter = x.taxNo ? `filter[tax_number]=${encodeURIComponent(x.taxNo)}` : x.email ? `filter[email]=${encodeURIComponent(x.email)}` : null;
  if (filter) {
    const j = await parasutCall(sb, "GET", `/contacts?${filter}&page[size]=5`);
    const hit = ((j?.data as any[]) || []).find((c) => !c.attributes?.archived);
    if (hit) return String(hit.id);
  }
  const j = await parasutCall(sb, "POST", "/contacts", { data: { type: "contacts", attributes: {
    name: x.name, contact_type: x.corporate ? "company" : "person", account_type: "customer",
    ...(x.email ? { email: x.email } : {}), ...(x.taxNo ? { tax_number: x.taxNo } : {}), ...(x.bill.tax_office ? { tax_office: x.bill.tax_office } : {}),
    city: x.bill.city, district: x.bill.district || undefined, address: x.bill.address, ...(x.phone ? { phone: String(x.phone) } : {}),
  } } });
  return String(j?.data?.id);
}

/** Faturayı kes / kaldığı yerden devam et */
export async function invoiceOrder(sb: Sb, orderId: string, opts: { acceptDiff?: boolean; carrier?: string } = {}) {
  const c = await parasutConfig(sb);
  if (!c.enabled) throw new ParasutError(400, "Paraşüt kapalı (Ayarlar › Entegrasyonlar).");
  let o = await loadOrder(sb, orderId);
  // Pazaryerinden ürünsüz gelmiş satır (geldiği anda kod sitede yoktu, sonradan girildi): faturadan önce SKU / barkodla
  // sitedeki numaraya bağla (büyük / küçük harf yok sayılır). Stoğa DOKUNMAZ — not düşer.
  if (!o.parasut_invoice_id) {
    let linked = 0;
    for (const it of (o.order_items as any[]) || []) {
      if (it.variant_id || it.product_id) continue;
      const code = String(it.sku || it.barcode || "").trim().replace(/[%_,()]/g, "");
      if (!code) continue;
      const { data: v } = await (sb as any).from("product_variants").select("id, product_id")
        .or(`sku.ilike.${code},barcode.ilike.${code}`).limit(1).maybeSingle();
      if (!v) continue;
      await (sb as any).from("order_items").update({ variant_id: v.id, product_id: v.product_id }).eq("id", it.id).is("variant_id", null);
      await (sb as any).from("order_events").insert({ order_id: orderId, type: "note", note: `Satır "${code}" koduyla sitedeki ürüne bağlandı (fatura için; stok değişmedi)` });
      linked++;
    }
    if (linked) o = await loadOrder(sb, orderId);
  }
  if (o.parasut_status === "done") return { status: "done" };
  // Entegrasyon dışı gönderim: siparişte kargo firması yoksa panelde seçilen firma (Kargo firmaları listesinden) kaydedilir
  if (opts.carrier && !o.kargonomi_provider && !o.cargo_provider) {
    const { data: known } = await (sb as any).from("cargo_carriers").select("name").eq("name", opts.carrier).maybeSingle();
    if (!known) throw new ParasutError(400, `“${opts.carrier}” Kargo firmaları listesinde yok.`);
    await save(sb, orderId, { cargo_provider: known.name });
    o = { ...o, cargo_provider: known.name };
  }
  if (opts.acceptDiff) { await save(sb, orderId, { parasut_diff_ok: true }); o = { ...o, parasut_diff_ok: true }; }
  // Hatalı fatura Paraşüt'te silindiyse (işletme kuralı: e-belge oluşmadan hata → Paraşüt'te sil, "yeniden dene")
  // kaldığı yerden devam edilemez → kayıt sıfırlanır, fatura güncel bilgilerle BAŞTAN kesilir.
  if (o.parasut_invoice_id && !o.parasut_e_doc_id) {
    try { await parasutCall(sb, "GET", `/sales_invoices/${o.parasut_invoice_id}`); }
    catch (e: any) {
      if (!(e instanceof ParasutError && e.status === 404)) throw e;
      const reset = { parasut_invoice_id: null, parasut_status: null, parasut_job_id: null, parasut_paid: false, parasut_error: null };
      await save(sb, orderId, reset);
      await (sb as any).from("order_events").insert({ order_id: orderId, type: "note", note: `Paraşüt faturası (${o.parasut_invoice_id}) Paraşüt'te silinmiş — baştan kesiliyor` });
      o = { ...o, ...reset };
    }
  }
  const x = await prepare(sb, o);
  // Fatura açılmadıysa önce her şey tutmalı; açıldıysa (devam) yalnız tahsilat / e-belge adımları
  if (!o.parasut_invoice_id && x.errs.length) throw new ParasutError(422, x.errs.join("\n"));

  const fail = async (msg: string) => { await save(sb, orderId, { parasut_status: "error", parasut_error: msg }); throw new ParasutError(422, msg); };
  try {
    // 1) Satış faturası
    if (!o.parasut_invoice_id) {
      await save(sb, orderId, { parasut_status: "creating", parasut_error: null });
      const contactId = await findOrCreateContact(sb, x);
      const no = o.channel === "site" || !o.channel ? (o.order_number ? `YH${o.order_number}` : o.id.slice(0, 8)) : String(o.external_order_number || o.order_number || o.id.slice(0, 8));
      const j = await parasutCall(sb, "POST", "/sales_invoices", { data: { type: "sales_invoices", attributes: {
        item_type: "invoice", description: no, // fatura adı yalnız sipariş numarası (ör. YH24127)
        issue_date: day(), due_date: day(), currency: "TRL", shipment_included: c.shipmentIncluded,
        billing_address: x.bill.address, billing_phone: x.phone ? String(x.phone) : undefined, city: x.bill.city, district: x.bill.district || undefined,
        tax_number: x.taxNo || "11111111111", ...(x.bill.tax_office ? { tax_office: x.bill.tax_office } : {}),
        order_no: no, order_date: pastDay(o.created_at),
      }, relationships: {
        contact: { data: { id: contactId, type: "contacts" } },
        // Kanalın fatura kategorisi (Ayarlar › Paraşüt › Satış kanalına göre); seçilmemişse kategorisiz
        ...(x.ch?.category_id ? { category: { data: { id: String(x.ch.category_id), type: "item_categories" } } } : {}),
        details: { data: x.lines.map((l) => ({ type: "sales_invoice_details", attributes: {
          quantity: l.qty, vat_rate: l.vat, unit_price: r4(l.gross / l.qty / (1 + l.vat / 100)), description: l.title,
        }, relationships: { product: { data: { id: l.productId, type: "products" } } } })) },
      } } });
      const inv = j?.data;
      o.parasut_invoice_id = String(inv?.id);
      const net = Number(inv?.attributes?.net_total);
      await save(sb, orderId, { parasut_invoice_id: o.parasut_invoice_id, parasut_status: "created" });
      // Paraşüt toplamı sipariş tutarından 10 kuruştan fazla saparsa durup sor (yuvarlama dışı bir sorun olabilir)
      if (Number.isFinite(net) && Math.abs(net - x.total) > 0.1 && !o.parasut_diff_ok)
        await fail(`Paraşüt fatura toplamı ${net} TL, sipariş ${x.total} TL — Paraşüt'te faturayı kontrol et, doğruysa “Tutarı onayla ve devam et”.`);
    }

    // 2) Tahsilat (kanal ayarı)
    if (x.ch?.mark_paid && x.ch.account_id && !o.parasut_paid) {
      const pdate = o.payment_method === "bank_transfer" ? day() : pastDay(o.created_at);
      // Tutar = faturanın Paraşüt'teki KALAN tutarı (KDV hariç birim fiyattan hesaplanan toplam kuruş farkıyla
      // sipariş tutarından küçük olabilir → "amount can not be bigger than remaining"; daha önce tahsil edildiyse 0)
      const cur = await parasutCall(sb, "GET", `/sales_invoices/${o.parasut_invoice_id}`);
      const rem = Number(cur?.data?.attributes?.remaining);
      const amount = Number.isFinite(rem) ? r2(Math.min(rem, x.total)) : x.total;
      if (amount > 0) {
        await parasutCall(sb, "POST", `/sales_invoices/${o.parasut_invoice_id}/payments`, { data: { type: "payments", attributes: {
          account_id: Number(x.ch.account_id), date: pdate, amount,
        } } });
      }
      await save(sb, orderId, { parasut_paid: true });
    }

    // 3) e-Fatura (alıcı e-Fatura kullanıcısı) / e-Arşiv
    if (!o.parasut_job_id && !o.parasut_e_doc_id) {
      let inbox: string | null = null;
      if (x.business) { // şirket (VKN) ya da şahıs şirketi (TCKN) — e-fatura mükellefi mi?
        const j = await parasutCall(sb, "GET", `/e_invoice_inboxes?filter[vkn]=${x.taxNo}`);
        inbox = ((j?.data as any[]) || [])[0]?.attributes?.e_invoice_address ?? null;
      }
      let job: any;
      if (inbox) {
        job = await parasutCall(sb, "POST", "/e_invoices", { data: { type: "e_invoices", attributes: { scenario: "basic", to: inbox },
          relationships: { invoice: { data: { id: o.parasut_invoice_id, type: "sales_invoices" } } } } });
      } else {
        if (!x.carrier) await fail(x.errs.find((e) => e.includes("argo")) || "Kargo firması / VKN eksik (e-Arşiv).");
        const card = o.payment_method !== "bank_transfer";
        job = await parasutCall(sb, "POST", "/e_archives", { data: { type: "e_archives", attributes: {
          internet_sale: {
            url: x.ch?.internet_url || "https://yerihisset.com",
            payment_type: x.ch?.payment_type || (card ? "KREDIKARTI/BANKAKARTI" : "EFT/HAVALE"),
            payment_platform: x.ch?.payment_platform || (card ? "iyzico" : "Banka"),
            payment_date: o.payment_method === "bank_transfer" ? day() : pastDay(o.created_at),
          },
          shipment: { title: x.carrier!.name, vkn: x.carrier!.vkn, date: day() },
        }, relationships: { sales_invoice: { data: { id: o.parasut_invoice_id, type: "sales_invoices" } } } } });
      }
      await save(sb, orderId, { parasut_job_id: String(job?.data?.id ?? ""), parasut_e_doc_type: inbox ? "e_invoice" : "e_archive", parasut_status: "job_pending", parasut_error: null });
    }
  } catch (e: any) {
    if (e instanceof ParasutError && e.status === 422) throw e;
    await save(sb, orderId, { parasut_status: "error", parasut_error: e?.message || String(e) });
    throw e;
  }
  return checkInvoice(sb, orderId);
}

/** YeriHisset siparişinde karar netleşince (müşteri "oldu" / "oldu say" / değişimde tutulmayan geri geldi) faturayı
 *  kendiliğinden kes. Paraşüt kapalıysa ya da sipariş uygun değilse sessizce geçer; hata siparişe yazılır (parasut_error)
 *  ve sipariş ekranında "Paraşüt — yeniden dene" görünür. Hata fırlatmaz (çağıran beklemek zorunda değil). */
export async function autoInvoiceSiteOrder(sb: Sb, orderId: string, why: string): Promise<{ status: string; error?: string }> {
  try {
    const { data: o } = await (sb as any).from("orders").select("channel, import_source, status, payment_status, invoice_status, parasut_status, user_id").eq("id", orderId).maybeSingle();
    if (!o || (o.channel || "site") !== "site" || o.import_source || o.status === "cancelled") return { status: "skipped" };
    // Regresyon test siparişi (@….test üye): Paraşüt'te GERÇEK fatura kesilmesin
    if (await isTestOrder(sb, o.user_id)) return { status: "test" };
    if ((o.invoice_status || "pending") !== "pending" || o.parasut_status === "done" || !["paid", "partial_refund"].includes(o.payment_status)) return { status: "skipped" };
    const c = await parasutConfig(sb);
    if (!c.enabled) return { status: "off" };
    await (sb as any).from("order_events").insert({ order_id: orderId, type: "note", note: `Fatura otomatik kesiliyor (${why})` });
    const r = await invoiceOrder(sb, orderId);
    return { status: String(r.status || "") };
  } catch (e: any) {
    const msg = String(e?.message || e);
    try { await save(sb, orderId, { parasut_status: "error", parasut_error: msg.slice(0, 500) }); } catch { /* yut */ }
    return { status: "error", error: msg };
  }
}

/** e-belge işini ve PDF'i takip et (cron + "Şimdi sorgula") */
export async function checkInvoice(sb: Sb, orderId: string) {
  const o = await loadOrder(sb, orderId);
  if (!o.parasut_invoice_id || o.parasut_status === "done") return { status: o.parasut_status };
  if (o.parasut_status === "job_pending" && o.parasut_job_id) {
    try {
      const j = await parasutCall(sb, "GET", `/trackable_jobs/${o.parasut_job_id}`);
      const st = j?.data?.attributes?.status;
      if (st === "error") {
        const msg = ((j?.data?.attributes?.errors as string[]) || []).join("; ") || "e-belge oluşturulamadı";
        await save(sb, orderId, { parasut_status: "error", parasut_error: `${msg} — e-belge oluşmadı: sebebi düzelt, Paraşüt'te bu taslak faturayı (ve tahsilatını) sil, sonra “yeniden dene” (fatura baştan kesilir)`, parasut_job_id: null });
        return { status: "error", error: msg };
      }
      if (st !== "done") return { status: "job_pending" };
    } catch (e: any) {
      // İş kimliği 15 dk geçerli; süresi dolduysa doğrudan faturaya bak
      if (!(e instanceof ParasutError && e.status === 404)) throw e;
    }
  }
  // e-belge + fatura no
  const inv = await parasutCall(sb, "GET", `/sales_invoices/${o.parasut_invoice_id}?include=active_e_document`);
  const doc = ((inv?.included as any[]) || []).find((d) => d.type === "e_archives" || d.type === "e_invoices");
  if (!doc) return { status: o.parasut_status };
  const type = doc.type === "e_invoices" ? "e_invoice" : "e_archive";
  const invoiceNo = doc.attributes?.invoice_number || inv?.data?.attributes?.invoice_no || null;
  await save(sb, orderId, { parasut_e_doc_id: String(doc.id), parasut_e_doc_type: type, parasut_invoice_no: invoiceNo, parasut_status: "pdf_pending" });

  // PDF (204 = henüz yok; bağlantı 1 saat geçerli → indirip özel depoya)
  const pdf = await parasutCall(sb, "GET", `/${type === "e_invoice" ? "e_invoices" : "e_archives"}/${doc.id}/pdf`);
  const url = pdf?.data?.attributes?.url;
  if (!url) return { status: "pdf_pending", invoiceNo };
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!res.ok) return { status: "pdf_pending", invoiceNo };
  const path = `${orderId}.pdf`;
  const up = await (sb as any).storage.from("invoices").upload(path, Buffer.from(await res.arrayBuffer()), { contentType: "application/pdf", upsert: true });
  if (up.error) throw new ParasutError(500, `PDF kaydedilemedi: ${up.error.message}`);
  await save(sb, orderId, { parasut_pdf_path: path, parasut_status: "done", parasut_error: null, parasut_invoiced_at: new Date().toISOString(), invoice_status: "invoiced" });
  // Trendyol / Hepsiburada siparişi: faturayı pazaryerine de yükle (olmazsa hata siparişe yazılır, "Trendyol'a yükle" ile yeniden)
  if (o.channel === "trendyol" || o.channel === "hepsiburada") await pushInvoiceToMarketplace(sb, orderId).catch(() => {});
  // Site siparişi: PDF müşteriye bizden (bir kez)
  if ((o.channel || "site") === "site") await sendInvoiceEmail(sb, orderId).catch(() => {});
  return { status: "done", invoiceNo };
}

/** Cron (dakikada bir): e-belge / PDF bekleyen siparişler */
export async function pollParasut(sb: Sb = createAdminClient()) {
  const { data } = await (sb as any).from("orders").select("id")
    .in("parasut_status", ["job_pending", "pdf_pending"]).gte("updated_at", new Date(Date.now() - 3 * 86400_000).toISOString()).limit(20);
  const rows = (data as any[]) || [];
  const errors: string[] = [];
  let done = 0;
  for (const r of rows) {
    try { if ((await checkInvoice(sb, r.id)).status === "done") done++; }
    catch (e: any) { errors.push(e?.message || String(e)); if (e instanceof ParasutError && [0, 401].includes(e.status)) break; }
  }
  return { checked: rows.length, done, errors };
}

/** Yöneticiye 10 dk geçerli PDF bağlantısı */
export async function invoicePdfUrl(sb: Sb, orderId: string) {
  const { data: o } = await (sb as any).from("orders").select("parasut_pdf_path").eq("id", orderId).maybeSingle();
  if (!o?.parasut_pdf_path) throw new ParasutError(404, "Fatura PDF'i henüz yok.");
  const { data, error } = await (sb as any).storage.from("invoices").createSignedUrl(o.parasut_pdf_path, 600);
  if (error) throw new ParasutError(500, error.message);
  return data.signedUrl as string;
}
