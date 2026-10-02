#!/usr/bin/env node
// WOOCOMMERCE AKTARIMI — eski yerihisset.com ve attipas.com.tr müşterileri + siparişleri.
// Önce DENEME (hiçbir şey yazmaz, rapor), sonra --apply. TEKRAR ÇALIŞTIRILABİLİR:
// aktarılmış sipariş (import_source + import_ref) yeniden eklenmez, yalnız eski sitede
// durumu değiştiyse durumu güncellenir; canlıya geçiş günü son bir kez çalıştırılır.
//
// Kurallar (kullanıcıyla netleşti):
//   * Müşteri → ŞİFRESİZ hesap (e-posta onaylı); profil import_source ile işaretli.
//     Var olan hesap (aynı e-posta) → yeni hesap açılmaz, bağlanır. E-POSTA GİTMEZ.
//   * yerihisset siparişi → kanal "site" (YeriHisset), KENDİ numarasıyla (YH22559);
//     numara doluysa yeni numara alır, eski no "Eski no" olarak görünür.
//   * attipas siparişi → kanal "attipas", yeni numara + eski no.
//   * STOK DÜŞMEZ, e-posta/satış ortaklığı tetiklenmez. Ciroya dahildir (iadeler düşülür).
//   * Başarısız / taslak siparişler alınmaz (müşterisi alınır). 2021 öncesi ₺0 = test, alınmaz.
//   * "Beklemede/ödeme bekleniyor" 30 günden eskiyse İptal (ödenmemiş) olarak gelir.
//   * Ürün eşleştirme: elle eşleme → SKU → barkod (rematch_order_items). Eşleşmeyenler
//     /admin/products/unmatched ekranında.
//
// Kullanım (sunucuda, /opt/yerihisset-app içinde; anahtarlar .env.woo'da):
//   node scripts/woo-import.mjs                    # DENEME (rapor)
//   node scripts/woo-import.mjs --apply            # aktar
//   node scripts/woo-import.mjs --site=attipas     # tek site

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnv, wooClient, mapAddress, phone10, lower, normSku, round2, BARCODE_KEY, EMAIL_RE } from "./lib/woo-common.mjs";

loadEnv();
const APPLY = process.argv.includes("--apply");
const onlySite = (process.argv.find((a) => a.startsWith("--site=")) || "").split("=")[1];
const OUT_DIR = new URL("../.woo-report/", import.meta.url);
const SKIP_ZERO_BEFORE = "2021-01-01";
const UNPAID_CANCEL_DAYS = 30;
const STAFF_ROLES = new Set(["administrator", "shop_manager", "editor", "author", "contributor"]);

const SITES = [
  { code: "yerihisset", label: "YeriHisset (eski site)", source: "woo_yerihisset", channel: "site", ownNumbers: true },
  { code: "attipas", label: "Attipas", source: "woo_attipas", channel: "attipas", ownNumbers: false },
].map((s) => {
  const P = `WOO_${s.code.toUpperCase()}_`;
  return { ...s, url: (process.env[P + "URL"] || "").replace(/\/+$/, ""), key: process.env[P + "KEY"], secret: process.env[P + "SECRET"] };
}).filter((s) => (!onlySite || s.code === onlySite));

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("HATA: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli."); process.exit(1); }
const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const gmt = (v) => (v ? new Date(String(v).endsWith("Z") ? v : `${v}Z`).toISOString() : null);
const money = (n) => `₺${Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
const inc = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
// Uzun yazma aşamalarında ekranda ilerleme (ekran donmuş sanılmasın)
const progress = (label, i, total) => {
  if (i % 10 === 0 || i === total) process.stdout.write(`\r  ${label}: ${i} / ${total}   ${i === total ? "\n" : ""}`);
};

async function pageAll(table, cols, filter) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// ── Durum eşleme ──────────────────────────────────────────────────────────────
function mapStatus(o) {
  const created = gmt(o.date_created_gmt) || gmt(o.date_created);
  const modified = gmt(o.date_modified_gmt) || created;
  const completed = gmt(o.date_completed_gmt) || modified;
  const total = round2(o.total);
  if (["failed", "trash", "checkout-draft"].includes(o.status)) return { skip: "başarısız / taslak" };
  if (total === 0 && created < SKIP_ZERO_BEFORE) return { skip: "₺0 test siparişi (2021 öncesi)" };
  const ageDays = (Date.now() - Date.parse(created)) / 86400_000;
  switch (o.status) {
    case "completed":
      return { status: "delivered", payment_status: "paid", shipment_status: "delivered", invoice_status: "invoiced", is_closed: true, closed_at: completed, completed_at: completed };
    case "processing":
      return { status: "processing", payment_status: "paid", shipment_status: "preparing", invoice_status: "pending", is_closed: false };
    case "on-hold":
    case "pending":
      if (ageDays > UNPAID_CANCEL_DAYS)
        return { status: "cancelled", payment_status: "failed", shipment_status: "cancelled", invoice_status: "pending", is_closed: true, closed_at: modified, note: "ödenmemiş (eski)" };
      return { status: "awaiting_payment", payment_status: "pending", shipment_status: "waiting", invoice_status: "pending", is_closed: false };
    case "cancelled":
      return { status: "cancelled", payment_status: "failed", shipment_status: "cancelled", invoice_status: "pending", is_closed: true, closed_at: modified };
    case "refunded":
      return { status: "refunded", payment_status: "paid", shipment_status: "returned", invoice_status: "invoiced", is_closed: true, closed_at: modified, refund_status: "full", refunded_amount: total };
    default:
      return { skip: `bilinmeyen durum (${o.status})` };
  }
}

function paymentMethod(o) {
  const t = lower(`${o.payment_method} ${o.payment_method_title}`);
  if (/bacs|havale|eft/.test(t)) return "bank_transfer";
  if (/cod|kap[ıi]da/.test(t)) return "cash_on_delivery";
  return "credit_card";
}

const metaVal = (arr, key) => (arr || []).find((m) => m.key === key)?.value;
// Satır adı "Ürün - 39" biçiminde gelir; ürün eski sitede silinmişse model adı buradan (numarasız) çıkar
const stripSize = (name, size) => {
  const n = String(name || "").trim();
  if (!size) return n;
  const esc = size.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return n.replace(new RegExp(`\\s*[-–·,]\\s*${esc}$`), "").trim() || n;
};

function addressSnap(a, billing = false) {
  if (!a) return null;
  const snap = { name: `${a.first_name} ${a.last_name}`.trim(), phone: a.phone, address: a.address_detail, district: a.district, city: a.city };
  if (!billing) return snap;
  return { same_as_shipping: false, ...snap, is_corporate: !!a.company, company_name: a.company || null, tax_office: null, tax_number: null };
}

// ── Ana akış ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`== WOOCOMMERCE AKTARIMI — ${APPLY ? "UYGULAMA" : "DENEME (hiçbir şey yazılmaz)"} ==`);
  const missing = SITES.filter((s) => !s.url || !s.key || !s.secret);
  for (const s of missing) console.log(`! ${s.label}: .env.woo içinde anahtar eksik → atlanıyor.`);
  const sites = SITES.filter((s) => !missing.includes(s));
  if (!sites.length) { console.error("HATA: aktarılacak site yok."); process.exit(1); }

  // Yeni sistemdeki mevcut durum
  console.log("Yeni sistem okunuyor…");
  const authByEmail = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`hesaplar: ${error.message}`);
    for (const u of data.users) if (u.email) authByEmail.set(lower(u.email), u.id);
    if (data.users.length < 1000) break;
  }
  const profiles = new Map((await pageAll("profiles", "id, email, first_name, last_name, phone, import_source")).map((p) => [p.id, p]));
  const withAddress = new Set((await pageAll("user_addresses", "user_id")).map((a) => a.user_id));
  const existingOrders = await pageAll("orders", "id, order_number, import_source, import_ref, external_raw");
  const imported = new Map(existingOrders.filter((o) => o.import_source).map((o) => [`${o.import_source}:${o.import_ref}`, o]));
  // Dolu numaralar (aktarılanlar dahil): eski sitenin sonraki siparişleri, sayaçtan numara almış
  // bir siparişle çakışırsa yeni numara alır (eski no "Eski no" olarak görünür)
  const takenNumbers = new Set(existingOrders.filter((o) => o.order_number).map((o) => String(o.order_number)));
  const variants = await pageAll("product_variants", "id, sku, barcode");
  const skuMap = new Map((await pageAll("legacy_sku_map", "old_sku, variant_id")).map((m) => [m.old_sku, m.variant_id]));
  const bySku = new Set(variants.map((v) => normSku(v.sku)).filter(Boolean));
  const byBarcode = new Set(variants.map((v) => normSku(v.barcode)).filter(Boolean));

  const report = [];
  const log = (s = "") => { report.push(s); };
  let seqBumped = false;
  const addrPlanned = new Set(); // aynı kişiye iki siteden iki adres eklenmesin

  for (const site of sites) {
    console.log(`\n▶ ${site.label} (${site.url})`);
    const wc = wooClient(site);
    const products = await wc.all("/products", { status: "any" }, "ürünler");
    const prod = new Map(); // woo id → { parent, sku, barcode, size }
    for (const p of products) {
      const bc = (m) => [p.global_unique_id, ...(m || []).filter((x) => BARCODE_KEY.test(x.key) && typeof x.value !== "object").map((x) => x.value)].filter(Boolean)[0] || null;
      prod.set(p.id, { parent: p.name, sku: p.sku || "", barcode: bc(p.meta_data), size: "" });
      if (p.type === "variable") {
        const vars = await wc.all(`/products/${p.id}/variations`, {}, `  varyasyon #${p.id}`);
        for (const v of vars) {
          const size = (v.attributes || []).map((a) => a.option).filter(Boolean).join(" / ");
          const vbc = [v.global_unique_id, ...(v.meta_data || []).filter((x) => BARCODE_KEY.test(x.key) && typeof x.value !== "object").map((x) => x.value)].filter(Boolean)[0] || null;
          prod.set(v.id, { parent: p.name, sku: v.sku || "", barcode: vbc, size });
        }
      }
    }
    const customers = await wc.all("/customers", { role: "all" }, "üyeler");
    const orders = await wc.all("/orders", { status: "any", order: "asc", orderby: "date" }, "siparişler");

    // ── Müşteriler (üyeler + sipariş verenler; son siparişin bilgisi esas) ──
    const people = new Map();
    const orderEmails = new Set(orders.map((o) => lower(o.billing?.email)).filter(Boolean));
    for (const c of customers) {
      const e = lower(c.email);
      if (!EMAIL_RE.test(e)) continue;
      if (STAFF_ROLES.has(c.role) && !orderEmails.has(e)) continue; // eski sitenin yöneticileri
      people.set(e, {
        first: c.first_name || c.billing?.first_name || "", last: c.last_name || c.billing?.last_name || "",
        phone: phone10(c.billing?.phone) || "", since: gmt(c.date_created_gmt),
        addr: mapAddress(c.shipping?.address_1 ? { ...c.shipping, phone: c.shipping.phone || c.billing?.phone } : c.billing),
      });
    }
    for (const o of orders) {
      const e = lower(o.billing?.email);
      if (!EMAIL_RE.test(e)) continue;
      const p = people.get(e) || { first: "", last: "", phone: "", since: null, addr: null };
      const d = gmt(o.date_created_gmt);
      p.first = o.billing.first_name || p.first; p.last = o.billing.last_name || p.last;
      p.phone = phone10(o.billing.phone) || p.phone;
      const a = mapAddress(o.shipping?.address_1 ? { ...o.shipping, phone: o.shipping.phone || o.billing.phone } : o.billing);
      if (a) p.addr = a;
      if (!p.since || d < p.since) p.since = d;
      people.set(e, p);
    }

    const cStat = { new: 0, linked: 0, addr: 0, failed: 0 };
    const userIdByEmail = new Map();
    let pi = 0;
    for (const [email, p] of people) {
      progress(APPLY ? "hesaplar yazılıyor" : "hesaplar kontrol ediliyor", ++pi, people.size);
      let id = authByEmail.get(email);
      if (authByEmail.has(email)) {
        cStat.linked++;
        const prof = profiles.get(id);
        if (APPLY) {
          const fill = {};
          if (prof && !prof.import_source) fill.import_source = site.source;
          if (prof && !prof.first_name && p.first) fill.first_name = p.first;
          if (prof && !prof.last_name && p.last) fill.last_name = p.last;
          if (prof && !prof.phone && p.phone) fill.phone = p.phone;
          if (Object.keys(fill).length) { await sb.from("profiles").update(fill).eq("id", id); Object.assign(prof, fill); }
        }
      } else {
        cStat.new++;
        if (!APPLY) authByEmail.set(email, null); // denemede: sonraki sitede "var olan" sayılsın
        if (APPLY) {
          const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { first_name: p.first, last_name: p.last } });
          if (error || !data?.user?.id) { cStat.failed++; console.log(`  ! hesap açılamadı (${error?.message || "?"})`); continue; }
          id = data.user.id;
          authByEmail.set(email, id);
          const prof = { id, email, first_name: p.first, last_name: p.last, phone: p.phone, import_source: site.source, ...(p.since ? { created_at: p.since } : {}) };
          const { error: pErr } = await sb.from("profiles").upsert(prof, { onConflict: "id" });
          if (pErr) console.log(`  ! profil yazılamadı: ${pErr.message}`);
          profiles.set(id, prof);
        }
      }
      if (id) userIdByEmail.set(email, id);
      if (p.addr?.address_detail && p.addr.cityResolved && !addrPlanned.has(email) && (!id || !withAddress.has(id))) {
        cStat.addr++;
        addrPlanned.add(email);
        if (APPLY && id) {
          const a = p.addr;
          const { error } = await sb.from("user_addresses").insert({
            user_id: id, address_name: "Ev", first_name: a.first_name || p.first, last_name: a.last_name || p.last,
            phone: a.phone || p.phone || "", address_detail: a.address_detail, district: a.district, city: a.city,
            is_corporate: false, company_name: null, is_default_shipping: true, is_default_billing: true,
          });
          if (!error) withAddress.add(id);
        }
      }
    }

    // ── Siparişler ──
    if (APPLY && site.ownNumbers && !seqBumped) {
      // Sayaç eski numaraların üstüne: yeni siparişler eski numaralarla çakışmaz
      const maxNo = Math.max(0, ...orders.map((o) => Number(o.number)).filter((n) => Number.isFinite(n)));
      const { error } = await sb.rpc("ensure_order_number_seq", { p_min: maxNo });
      if (error) throw new Error(`sipariş sayacı: ${error.message}`);
      seqBumped = true;
    }
    const oStat = { insert: 0, update: 0, same: 0, conflicts: 0, items: 0 };
    const skipped = new Map(), statuses = new Map(), revenueByYear = new Map();
    const match = { map: 0, sku: 0, barcode: 0, none: 0 };
    let oi = 0;
    for (const o of orders) {
      progress(APPLY ? "siparişler yazılıyor" : "siparişler kontrol ediliyor", ++oi, orders.length);
      const st = mapStatus(o);
      if (st.skip) { inc(skipped, st.skip); continue; }
      const ref = String(o.id);
      const wcModified = gmt(o.date_modified_gmt);
      const refunds = (o.refunds || []).reduce((a, r) => a + Math.abs(Number(r.total || 0)), 0);
      const fields = { ...st };
      delete fields.note;
      if (refunds > 0 && st.status !== "refunded") { fields.refund_status = "partial"; fields.refunded_amount = round2(refunds); }

      const prev = imported.get(`${site.source}:${ref}`);
      if (prev) {
        if (prev.external_raw?.wc_modified && wcModified && wcModified <= prev.external_raw.wc_modified) { oStat.same++; continue; }
        oStat.update++;
        if (APPLY) {
          const { error } = await sb.from("orders").update({ ...fields, external_raw: { ...(prev.external_raw || {}), wc_status: o.status, wc_modified: wcModified } }).eq("id", prev.id);
          if (error) console.log(`  ! #${o.number} güncellenemedi: ${error.message}`);
        }
        continue;
      }

      inc(statuses, `${o.status}${st.note ? ` → ${st.note}` : ""}`);
      if (st.payment_status === "paid" && st.status !== "cancelled") {
        inc(revenueByYear, String(o.date_created).slice(0, 4), Math.max(0, round2(o.total) - (fields.refunded_amount || 0)));
      }
      const email = lower(o.billing?.email);
      const ship = mapAddress(o.shipping?.address_1 ? { ...o.shipping, phone: o.shipping.phone || o.billing?.phone } : o.billing);
      const bill = mapAddress(o.billing);
      const num = String(o.number);
      const ownNo = site.ownNumbers && /^\d{1,15}$/.test(num) && !takenNumbers.has(num);
      if (site.ownNumbers && !ownNo) oStat.conflicts++;
      const fees = o.fee_lines || [];
      const payload = {
        channel: site.channel,
        user_id: userIdByEmail.get(email) || null,
        import_source: site.source,
        import_ref: ref,
        external_order_number: num,
        order_number: ownNo ? num : null,
        created_at: gmt(o.date_created_gmt),
        ...fields,
        total_amount: round2(o.total),
        shipping_cost: round2((o.shipping_lines || []).reduce((a, s) => a + Number(s.total || 0) + Number(s.total_tax || 0), 0)),
        shipping_method: (o.shipping_lines || []).map((s) => s.method_title).filter(Boolean).join(", ") || null,
        coupon_discount: round2(Number(o.discount_total || 0) + Number(o.discount_tax || 0)),
        extra_fee: round2(fees.reduce((a, f) => a + Number(f.total || 0) + Number(f.total_tax || 0), 0)),
        payment_method: paymentMethod(o),
        customer_name: `${o.billing?.first_name || ""} ${o.billing?.last_name || ""}`.trim() || null,
        customer_email: email || null,
        customer_phone: phone10(o.billing?.phone) || o.billing?.phone || null,
        customer_note: o.customer_note || null,
        shipping_address: ship ? JSON.stringify(addressSnap(ship)) : null,
        billing_address: bill ? JSON.stringify(addressSnap(bill, true)) : null,
        external_raw: {
          wc_status: o.status, wc_modified: wcModified,
          payment_title: o.payment_method_title || o.payment_method || null,
          coupons: (o.coupon_lines || []).map((c) => c.code).filter(Boolean),
          fee_names: fees.map((f) => f.name).filter(Boolean),
          utm_source: metaVal(o.meta_data, "_wc_order_attribution_utm_source") || null,
          utm_medium: metaVal(o.meta_data, "_wc_order_attribution_utm_medium") || null,
        },
      };
      const hasAccount = !!payload.user_id || (!APPLY && !!email && people.has(email)); // denemede yeni hesaplar henüz yok
      if (!hasAccount && site.channel === "site") { inc(skipped, "e-postasız site siparişi"); continue; }

      const items = (o.line_items || []).map((li) => {
        const info = prod.get(li.variation_id) || prod.get(li.product_id);
        const sku = normSku(li.sku || info?.sku);
        const barcode = info?.barcode ? String(info.barcode) : null;
        const size = String(metaVal(li.meta_data, "pa_numara") || info?.size || "").trim();
        const qty = Math.max(1, Number(li.quantity || 1));
        if (sku && skuMap.has(sku)) match.map++;
        else if (sku && bySku.has(sku)) match.sku++;
        else if (barcode && byBarcode.has(normSku(barcode))) match.barcode++;
        else match.none++;
        return {
          product_id: null, variant_id: null, quantity: qty,
          unit_price: round2((Number(li.total || 0) + Number(li.total_tax || 0)) / qty),
          sku, barcode, title: info?.parent || stripSize(li.name, size), size_label: size || null,
          variant_name: size ? `Numara: ${size}` : null,
        };
      });
      oStat.insert++;
      oStat.items += items.length;

      if (APPLY) {
        let { data: ins, error } = await sb.from("orders").insert(payload).select("id").single();
        if (error && String(error.code) === "23505" && /order_number/.test(error.message) && payload.order_number) {
          oStat.conflicts++; // numara bu arada dolmuş → sayaçtan yeni numara
          ({ data: ins, error } = await sb.from("orders").insert({ ...payload, order_number: null }).select("id").single());
        }
        if (error) {
          if (String(error.code) === "23505" && /import_ref/.test(error.message)) { oStat.insert--; oStat.same++; continue; } // önceki tur eklemiş
          console.log(`  ! #${num} eklenemedi: ${error.message}`);
          oStat.insert--;
          continue;
        }
        if (payload.order_number) takenNumbers.add(payload.order_number);
        if (items.length) {
          const { error: iErr } = await sb.from("order_items").insert(items.map((it) => ({ ...it, order_id: ins.id })));
          if (iErr) console.log(`  ! #${num} satırları eklenemedi: ${iErr.message}`);
        }
        imported.set(`${site.source}:${ref}`, { id: ins.id, external_raw: payload.external_raw });
      }
    }

    // ── Rapor ──
    log("");
    log(`═══ ${site.label} → kanal: ${site.channel === "site" ? "YeriHisset" : "Attipas"} ═══`);
    log(`MÜŞTERİ: ${people.size} kişi · yeni hesap ${cStat.new} · var olan hesaba bağlanan ${cStat.linked} · adres eklenecek ${cStat.addr}${cStat.failed ? ` · HATA ${cStat.failed}` : ""}`);
    log(`SİPARİŞ: eklenecek ${oStat.insert} (${oStat.items} satır) · durumu güncellenecek ${oStat.update} · değişmeyen ${oStat.same}`);
    log(`  Durumlar: ${[...statuses.entries()].map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}`);
    log(`  Alınmayan: ${[...skipped.entries()].map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}`);
    if (site.ownNumbers) log(`  Kendi numarasıyla gelen: ${oStat.insert - oStat.conflicts} · numarası dolu olduğu için yeni numara alan: ${oStat.conflicts}`);
    log(`  Ciroya eklenecek (yıl): ${[...revenueByYear.keys()].sort().map((y) => `${y}: ${money(revenueByYear.get(y))}`).join(" · ") || "—"}`);
    log(`  Ürün eşleşmesi: elle eşleme ${match.map} · SKU ${match.sku} · barkod ${match.barcode} · eşleşmeyen ${match.none}`);
  }

  if (APPLY) {
    const { data: rm, error } = await sb.rpc("rematch_order_items");
    log("");
    log(error ? `! Eşleştirme hatası: ${error.message}` : `EŞLEŞTİRME: ${rm.matched} satır ürüne bağlandı · ${rm.unmatched} satır eşleşmedi → /admin/products/unmatched`);
  }

  const text = report.join("\n");
  console.log(text);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(new URL(APPLY ? "aktarim-sonuc.txt" : "aktarim-deneme.txt", OUT_DIR), text.trimStart() + "\n");
  console.log(`\n${APPLY ? "✓ Aktarım tamamlandı." : "DENEME bitti, hiçbir şey yazılmadı."} Rapor: .woo-report/${APPLY ? "aktarim-sonuc" : "aktarim-deneme"}.txt (kişisel veri içermez)`);
}

main().catch((e) => { console.error("\nHATA:", e.message); process.exit(1); });
