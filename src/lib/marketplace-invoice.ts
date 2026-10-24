/* eslint-disable @typescript-eslint/no-explicit-any */
// PAZARYERİNE FATURA YÜKLEME (kullanıcı istekleri 2026-10-21) — Trendyol + Hepsiburada.
// Paraşüt faturası bitince (src/lib/parasut-invoice.ts › checkInvoice "done") PDF özel depodan (invoices) alınır:
//   * Trendyol    : PDF DOSYA olarak yüklenir (seller-invoice-file).
//   * Hepsiburada : yalnız BAĞLANTI alır (PUT …/packagenumber/{paket}/invoice, invoiceLink) → faturanın özel
//                   depodaki dosyasına 10 yıl geçerli imzalı bağlantı (supabase.yerihisset.com; site şifre
//                   kapısının dışında). Bağlantı Supabase JWT anahtarı değişirse geçersiz olur (anahtar döndürülmez).
// Yükleyemezse hata siparişe yazılır; siparişte "<Pazaryeri>'ya yükle" ile yeniden denenir (cron ilk denemeyi yapar).
import { createAdminClient } from "@/lib/supabase-admin";
import { getTrendyolConfig, hasCredentials, sendInvoiceFile, updatePackageStatus } from "@/lib/marketplace/trendyol";
import { getHepsiburadaConfig, hbHasCredentials, hbSendInvoiceLink } from "@/lib/marketplace/hepsiburada";

type Sb = ReturnType<typeof createAdminClient>;

export const INVOICE_UPLOAD_CHANNELS = ["trendyol", "hepsiburada"] as const;
export const MP_LABEL: Record<string, string> = { trendyol: "Trendyol", hepsiburada: "Hepsiburada" };
const NO_PACKAGE = "Hepsiburada paket numarası henüz yok";
const LINK_SECONDS = 10 * 365 * 86400;

export class MarketplaceInvoiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function pushInvoiceToMarketplace(sb: Sb, orderId: string): Promise<{ sent: boolean; already?: boolean }> {
  const s = sb as any;
  const { data: o } = await s.from("orders")
    .select("id, channel, import_source, external_package_id, mp_package_number, parasut_pdf_path, parasut_invoice_no, parasut_invoiced_at, mp_invoice_sent_at, packed_at")
    .eq("id", orderId).maybeSingle();
  if (!o) throw new MarketplaceInvoiceError(404, "Sipariş bulunamadı.");
  if (!(INVOICE_UPLOAD_CHANNELS as readonly string[]).includes(o.channel) || o.import_source)
    throw new MarketplaceInvoiceError(400, "Fatura yükleme yalnız Trendyol ve Hepsiburada siparişinde.");
  if (o.mp_invoice_sent_at) return { sent: true, already: true };
  if (!o.parasut_pdf_path) throw new MarketplaceInvoiceError(400, "Faturanın PDF'i yok (önce Paraşüt faturası kesilmeli).");
  const label = MP_LABEL[o.channel];

  const fail = async (msg: string, status = 502) => {
    await s.from("orders").update({ mp_invoice_error: msg.slice(0, 500) }).eq("id", orderId);
    throw new MarketplaceInvoiceError(status, msg);
  };
  const done = async (note: string, already = false) => {
    await s.from("orders").update({ mp_invoice_sent_at: new Date().toISOString(), mp_invoice_error: null }).eq("id", orderId);
    await s.from("order_events").insert({ order_id: orderId, type: "note", note });
    // "Paket hazır" akışı: fatura Trendyol'a gidince paket "İşleme al" (hata siparişe yazılır, cron / düğmeyle yeniden)
    if (o.channel === "trendyol" && o.packed_at) await trendyolPicking(sb, orderId).catch(() => {});
    return { sent: true, already };
  };

  try {
    if (o.channel === "trendyol") {
      const cfg = await getTrendyolConfig(sb);
      if (!hasCredentials(cfg)) return await fail("Trendyol bağlantı bilgileri eksik (Ayarlar › Entegrasyonlar).", 400);
      if (!o.external_package_id) return await fail("Trendyol paket numarası yok.", 400);
      const { data: file, error } = await s.storage.from("invoices").download(o.parasut_pdf_path);
      if (error || !file) return await fail(`Fatura PDF'i okunamadı: ${error?.message || "dosya yok"}`, 500);
      await sendInvoiceFile(cfg, String(o.external_package_id), Buffer.from(await file.arrayBuffer()), `${o.external_package_id}.pdf`);
    } else {
      const cfg = await getHepsiburadaConfig(sb);
      if (!hbHasCredentials(cfg)) return await fail("Hepsiburada bağlantı bilgileri eksik (Ayarlar › Entegrasyonlar).", 400);
      if (!o.mp_package_number) return await fail(`${NO_PACKAGE} — paketlenince kendiliğinden yüklenir.`, 400);
      const { data: link, error } = await s.storage.from("invoices").createSignedUrl(o.parasut_pdf_path, LINK_SECONDS);
      if (error || !link?.signedUrl) return await fail(`Fatura bağlantısı oluşturulamadı: ${error?.message || ""}`, 500);
      // e-Arşiv / e-Fatura numarası: 3 harf seri + 13 hane sıra (ör. YHA2026000000123)
      const no = String(o.parasut_invoice_no || "");
      const m = /^([A-Z0-9]{3})(\d{13})$/.exec(no);
      await hbSendInvoiceLink(cfg, String(o.mp_package_number), {
        invoiceLink: link.signedUrl,
        ...(m ? { serialNumber: m[1], rowNumber: m[2] } : {}),
      });
    }
  } catch (e: any) {
    if (e instanceof MarketplaceInvoiceError) throw e;
    const msg = String(e?.message || e);
    // Daha önce (elle / eski firma) yüklenmişse: pazaryerinde fatura var demektir → gönderildi say
    if (/already been sent|already exist|zaten|daha önce/i.test(msg)) return done(`${label}'da bu paketin faturası zaten vardı (önceden yüklenmiş)`, true);
    return fail(msg);
  }
  return done(`Fatura ${label}'a yüklendi`);
}

/** Trendyol paketini "İşleme al" (Picking). Paket zaten ilerlemişse (Created değil) dokunmaz, yapıldı sayar. */
export async function trendyolPicking(sb: Sb, orderId: string): Promise<{ ok: boolean; skipped?: boolean }> {
  const s = sb as any;
  const { data: o } = await s.from("orders").select("id, channel, external_package_id, external_status, mp_picking_at").eq("id", orderId).maybeSingle();
  if (!o || o.channel !== "trendyol") throw new MarketplaceInvoiceError(400, "Yalnız Trendyol siparişi.");
  if (o.mp_picking_at) return { ok: true, skipped: true };
  const mark = (fields: Record<string, unknown>) => s.from("orders").update(fields).eq("id", orderId);
  if (o.external_status && o.external_status !== "Created") {
    await mark({ mp_picking_at: new Date().toISOString(), mp_picking_error: null });
    return { ok: true, skipped: true };
  }
  try {
    const cfg = await getTrendyolConfig(sb);
    if (!hasCredentials(cfg)) throw new Error("Trendyol bağlantı bilgileri eksik (Ayarlar › Entegrasyonlar).");
    if (!o.external_package_id) throw new Error("Trendyol paket numarası yok.");
    const { data: items } = await s.from("order_items").select("external_line_id, quantity").eq("order_id", orderId);
    const lines = ((items as any[]) || []).filter((i) => /^\d+$/.test(String(i.external_line_id || "")))
      .map((i) => ({ lineId: Number(i.external_line_id), quantity: Number(i.quantity) || 1 }));
    if (!lines.length) throw new Error("Trendyol satır numaraları yok.");
    await updatePackageStatus(cfg, String(o.external_package_id), lines, "Picking");
  } catch (e: any) {
    const msg = `Trendyol'da “İşleme al” yapılamadı: ${String(e?.message || e)}`.slice(0, 500);
    await mark({ mp_picking_error: msg });
    throw new MarketplaceInvoiceError(502, msg);
  }
  await mark({ mp_picking_at: new Date().toISOString(), mp_picking_error: null, external_status: "Picking" });
  await s.from("order_events").insert({ order_id: orderId, type: "note", note: "Trendyol'da paket “İşleme al” yapıldı" });
  return { ok: true };
}

/** Cron (dakikada bir): Paraşüt faturası bitmiş, pazaryerine henüz gitmemiş siparişler. Hata alanlar elle yeniden
 *  denenir; yalnız "paket numarası henüz yok" (Hepsiburada paketlemesini bekliyor) kendiliğinden yeniden denenir. */
export async function pollMarketplaceInvoices(sb: Sb = createAdminClient()) {
  const { data } = await (sb as any).from("orders").select("id")
    .in("channel", INVOICE_UPLOAD_CHANNELS as unknown as string[]).is("import_source", null).eq("parasut_status", "done")
    .is("mp_invoice_sent_at", null).or(`mp_invoice_error.is.null,mp_invoice_error.like."${NO_PACKAGE}*"`)
    .gte("parasut_invoiced_at", new Date(Date.now() - 14 * 86400_000).toISOString()).limit(10);
  const errors: string[] = [];
  let sent = 0;
  for (const r of (data as any[]) || []) {
    try { if ((await pushInvoiceToMarketplace(sb, r.id)).sent) sent++; }
    catch (e: any) { if (!String(e?.message).startsWith(NO_PACKAGE)) errors.push(e?.message || String(e)); }
  }
  // Fatura yüklenmiş, paket hazır, "İşleme al" henüz yapılmamış Trendyol siparişleri (hata alan elle yeniden denenir)
  const { data: pick } = await (sb as any).from("orders").select("id")
    .eq("channel", "trendyol").not("packed_at", "is", null).not("mp_invoice_sent_at", "is", null)
    .is("mp_picking_at", null).is("mp_picking_error", null).limit(10);
  for (const r of (pick as any[]) || []) {
    try { await trendyolPicking(sb, r.id); } catch (e: any) { errors.push(e?.message || String(e)); }
  }
  return { sent, errors };
}
