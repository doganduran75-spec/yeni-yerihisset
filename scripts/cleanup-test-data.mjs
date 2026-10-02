#!/usr/bin/env node
// TEST VERİSİ TEMİZLİĞİ (canlıya geçiş öncesi; tekrar çalıştırılabilir).
// Kurallar veritabanındaki cleanup_test_data() fonksiyonunda
// (supabase/migrations/20261008000001_test_data_cleanup.sql):
//   SİLİNİR: işaretsiz site siparişleri, müşteri test hesapları, test kuponları,
//            stok bildirimleri, geri bildirimler, mesajlar, affiliate test verisi,
//            e-posta kuyruğu, popup/fırsat tıklamaları (+ --istatistik ile ziyaret verisi)
//   KALIR:   yöneticiler/personel, WooCommerce'ten aktarılanlar, pazaryeri siparişleri,
//            ürünler, fiyatlar, STOKLAR (stoğa hiç dokunulmaz), ayarlar, içerikler
//
// Listeler (/opt/yerihisset-app içinde, her satıra bir değer, # ile açıklama):
//   .temizlik-kalsin.txt  → silinmesin: e-posta, sipariş no (YH1234), kupon kodu
//   .temizlik-sil.txt     → pazaryeri siparişi de silinsin (ör. Hepsiburada test
//                           siparişi numarası) / CRM kişisi e-postası
//
// Kullanım (sunucuda, /opt/yerihisset-app içinde):
//   node scripts/cleanup-test-data.mjs                 # DENEME: liste + rapor, hiçbir şey silinmez
//   node scripts/cleanup-test-data.mjs --apply         # siler (onay ister)
//   node scripts/cleanup-test-data.mjs --apply --istatistik   # + ziyaret istatistikleri (geçiş günü)

import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

for (const name of [".env.local", ".env", ".env.production.local", ".env.production"]) {
  try {
    for (const line of readFileSync(new URL(`../${name}`, import.meta.url), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* bu dosya yoksa geç */ }
}

const APPLY = process.argv.includes("--apply");
const ANALYTICS = process.argv.includes("--istatistik");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("HATA: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli."); process.exit(1); }
const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const OUT = new URL("../.cleanup-report/", import.meta.url);

function readList(name) {
  try {
    return readFileSync(new URL(`../${name}`, import.meta.url), "utf8").split("\n")
      .map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  } catch { return []; }
}

const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const day = (s) => (s ? new Date(s).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "");
function csv(file, header, rows) {
  writeFileSync(new URL(file, OUT), "﻿" + header.join(";") + "\n" + rows.map((r) => r.map(esc).join(";")).join("\n"));
}

async function run(apply, keep, del) {
  const { data, error } = await sb.rpc("cleanup_test_data", { p_apply: apply, p_keep: keep, p_delete: del, p_analytics: ANALYTICS });
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  const keep = readList(".temizlik-kalsin.txt");
  const del = readList(".temizlik-sil.txt");
  console.log("== TEST VERİSİ TEMİZLİĞİ — " + (APPLY ? "UYGULAMA" : "DENEME (hiçbir şey silinmez)") + " ==");
  console.log(`Kalsın listesi: ${keep.length} değer · Sil listesi: ${del.length} değer${ANALYTICS ? " · istatistikler DAHİL" : ""}`);

  const r = await run(false, keep, del);
  const c = r.counts;
  const lines = [
    "",
    "SİLİNECEK",
    `  Siparişler ............ ${r.orders.length}${r.orders.some((o) => o.channel !== "site") ? ` (pazaryeri: ${r.orders.filter((o) => o.channel !== "site").length})` : ""}`,
    `  Üyeler ................ ${r.users.length} (satış ortağı: ${r.users.filter((u) => u.affiliate).length})`,
    `  Kuponlar .............. ${r.coupons.length}`,
    `  CRM kişileri .......... ${r.contacts.length}`,
    `  Stok bildirimi bekleyen ${c.stock_notifications}`,
    `  Talep / geri bildirim . ${c.feedback}`,
    `  Mesajlar .............. ${c.messages}`,
    `  Satış ortaklığı ....... ${c.affiliates} hesap · ${c.affiliate_clicks} tıklama · ${c.affiliate_payout_runs} dönem · ${c.store_credit_ledger} kredi hareketi`,
    `  E-posta kuyruğu ....... ${c.email_queue} · kampanya gönderimi ${c.email_campaign_sends}`,
    `  Popup / fırsat tıklama  ${c.popup_impressions} / ${c.opportunity_clicks}`,
    ...(ANALYTICS ? [`  İstatistik ............ ${c.analytics_events} olay · ${c.analytics_sessions} oturum`] : []),
    "",
    "KALACAK",
    `  Siparişler ............ ${r.kept_orders.length}  (${["pazaryeri", "woocommerce", "kalsın listesi"].map((k) => `${k}: ${r.kept_orders.filter((o) => o.reason === k).length}`).join(" · ")})`,
    `  Hesaplar .............. ${r.kept_users.length + r.kept_users_imported}  (${r.kept_users.map((u) => `${u.email} [${u.reason}]`).join(", ")}${r.kept_users_imported ? ` + ${r.kept_users_imported} WooCommerce müşterisi` : ""})`,
    `  Kuponlar .............. ${r.kept_coupons.length ? r.kept_coupons.join(", ") : "—"}`,
    `  CRM kişileri .......... ${r.kept_contacts.length}`,
    "  Ürünler, fiyatlar, STOKLAR, ayarlar, şablonlar, içerikler: dokunulmaz",
  ];
  console.log(lines.join("\n"));

  mkdirSync(OUT, { recursive: true });
  csv("silinecek-siparisler.csv", ["Sipariş", "Kanal", "Tarih", "Durum", "Tutar", "Müşteri"],
    r.orders.map((o) => [o.no, o.channel, day(o.date), o.status, o.total, o.email]));
  csv("kalacak-siparisler.csv", ["Sipariş", "Kanal", "Pazaryeri no", "Tarih", "Durum", "Tutar", "Neden"],
    r.kept_orders.map((o) => [o.no, o.channel, o.external, day(o.date), o.status, o.total, o.reason]));
  csv("silinecek-uyeler.csv", ["E-posta", "Ad", "Kayıt", "Sipariş", "Satış ortağı"],
    r.users.map((u) => [u.email, u.name, day(u.created), u.orders, u.affiliate ? "evet" : ""]));
  csv("silinecek-kuponlar.csv", ["Kod", "Ad", "Kullanım", "Aktif", "Kişiye özel"],
    r.coupons.map((x) => [x.code, x.name, x.used, x.active ? "evet" : "", x.personal ? "evet" : ""]));
  csv("crm-kisileri.csv", ["Durum", "Ad", "E-posta", "Kaynak"], [
    ...r.contacts.map((x) => ["SİLİNECEK", x.name, x.email, x.source]),
    ...r.kept_contacts.map((x) => ["kalacak", x.name, x.email, x.source]),
  ]);
  console.log("\nAyrıntılı listeler: .cleanup-report/ (silinecek-siparisler, kalacak-siparisler, silinecek-uyeler, silinecek-kuponlar, crm-kisileri .csv)");

  if (!APPLY) {
    console.log("\nDENEME bitti, hiçbir şey silinmedi. Listeleri kontrol et; kalmasını istediklerini .temizlik-kalsin.txt dosyasına yaz.");
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question("\nYukarıdakiler KALICI olarak silinecek (yedeğini aldın mı?). Devam için SIL yaz: ");
  rl.close();
  if (ans.trim() !== "SIL") { console.log("Vazgeçildi, hiçbir şey silinmedi."); return; }

  const done = await run(true, keep, del);
  console.log(`\n✓ Temizlik tamamlandı: ${done.orders.length} sipariş, ${done.deleted_users} üye, ${done.coupons.length} kupon silindi. Stoklara dokunulmadı.`);
}

main().catch((e) => { console.error("\nHATA (hiçbir şey silinmedi):", e.message); process.exit(1); });
