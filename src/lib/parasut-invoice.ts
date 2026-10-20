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

type Sb = ReturnType<typeof createAdminClient>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const day = (d: Date | string = new Date()) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const norm = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]/g, "");
const parse = (v: any) => { try { return typeof v === "string" ? JSON.parse(v) : v || {}; } catch { return {}; } };

const ORDER_COLS = `id, order_number, external_order_number, channel, status, created_at, payment_method, payment_status, invoice_status,
  total_amount, shipping_cost, coupon_discount, credit_used, billing_address, shipping_address, customer_name, customer_email, customer_phone,
  cargo_provider, kargonomi_provider, shipping_method, parasut_invoice_id, parasut_status, parasut_job_id, parasut_e_doc_id, parasut_e_doc_type,
  parasut_paid, parasut_diff_ok, profiles(email, first_name, last_name, phone),
  order_items(quantity, unit_price, product_id, variant_id, variant_name, products(title, parasut_product_id), product_variants(parasut_product_id))`;

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
  if (o.payment_status !== "paid") errs.push("Ödemesi alınmamış sipariş faturalanmaz.");
  if (o.invoice_status && o.invoice_status !== "pending") errs.push(`Fatura durumu “${o.invoice_status}” — zaten faturalanmış.`);

  const items = (o.order_items as any[]) || [];
  const pids = [...new Set(items.map((i) => i.product_variants?.parasut_product_id || i.products?.parasut_product_id).filter(Boolean))];
  const { data: pps } = pids.length ? await s.from("parasut_products").select("parasut_id, vat_rate").in("parasut_id", pids) : { data: [] };
  const vat = new Map(((pps as any[]) || []).map((p) => [p.parasut_id, p.vat_rate == null ? null : Number(p.vat_rate)]));

  const lines: Line[] = [];
  for (const i of items) {
    const title = `${i.products?.title ?? "Ürün"}${i.variant_name ? ` — ${i.variant_name}` : ""}`;
    const pid = i.product_variants?.parasut_product_id || i.products?.parasut_product_id;
    if (!pid) { errs.push(`Paraşüt ürünüyle eşleşmemiş: ${title} (Paraşüt ürün eşleştirme sayfası)`); continue; }
    const v = vat.get(pid);
    if (v == null) { errs.push(`Paraşüt'te KDV oranı yok: ${title} — ürünleri yeniden çek`); continue; }
    lines.push({ productId: pid, vat: v, qty: Number(i.quantity), gross: r2(Number(i.unit_price) * Number(i.quantity)), title });
  }

  // Kupon + kredi (yalnız site) → ürün kalemlerine orantılı; kuruş farkı en büyük kaleme
  const disc = channel === "site" ? r2(Number(o.coupon_discount || 0) + Number(o.credit_used || 0)) : 0;
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
  if (lines.length && Math.abs(total - Number(o.total_amount)) > 0.01)
    errs.push(`Kalemler (${total} TL) sipariş tutarıyla (${Number(o.total_amount)} TL) tutmuyor.`);

  // Alıcı
  const bill = { ...parse(o.shipping_address), ...parse(o.billing_address) };
  const p = o.profiles || {};
  const taxNo = String(bill.tax_number || "").replace(/\D/g, "");
  const corporate = taxNo.length === 10;
  const name = String((corporate ? bill.company_name || bill.company : null) || bill.name || o.customer_name || [p.first_name, p.last_name].filter(Boolean).join(" ")).trim();
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

  return { errs, lines, total, bill, taxNo, corporate, name, email: o.customer_email || p.email || null, phone: bill.phone || o.customer_phone || p.phone || null, ch, carrier, channel };
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
  if (o.parasut_status === "done") return { status: "done" };
  // Entegrasyon dışı gönderim: siparişte kargo firması yoksa panelde seçilen firma (Kargo firmaları listesinden) kaydedilir
  if (opts.carrier && !o.kargonomi_provider && !o.cargo_provider) {
    const { data: known } = await (sb as any).from("cargo_carriers").select("name").eq("name", opts.carrier).maybeSingle();
    if (!known) throw new ParasutError(400, `“${opts.carrier}” Kargo firmaları listesinde yok.`);
    await save(sb, orderId, { cargo_provider: known.name });
    o = { ...o, cargo_provider: known.name };
  }
  if (opts.acceptDiff) { await save(sb, orderId, { parasut_diff_ok: true }); o = { ...o, parasut_diff_ok: true }; }
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
        order_no: no, order_date: day(o.created_at),
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
      const pdate = o.payment_method === "bank_transfer" ? day() : day(o.created_at);
      await parasutCall(sb, "POST", `/sales_invoices/${o.parasut_invoice_id}/payments`, { data: { type: "payments", attributes: {
        account_id: Number(x.ch.account_id), date: pdate, amount: x.total,
      } } });
      await save(sb, orderId, { parasut_paid: true });
    }

    // 3) e-Fatura (alıcı e-Fatura kullanıcısı) / e-Arşiv
    if (!o.parasut_job_id && !o.parasut_e_doc_id) {
      let inbox: string | null = null;
      if (x.corporate) {
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
            payment_date: o.payment_method === "bank_transfer" ? day() : day(o.created_at),
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
        await save(sb, orderId, { parasut_status: "error", parasut_error: `${msg} — düzeltip yeniden dene`, parasut_job_id: null });
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
