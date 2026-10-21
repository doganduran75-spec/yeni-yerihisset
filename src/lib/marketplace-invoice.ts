/* eslint-disable @typescript-eslint/no-explicit-any */
// PAZARYERİNE FATURA YÜKLEME (kullanıcı isteği 2026-10-21) — şimdilik Trendyol.
// Paraşüt faturası bitince (src/lib/parasut-invoice.ts › checkInvoice "done") PDF özel depodan (invoices) alınıp
// Trendyol'a dosya olarak yüklenir → Trendyol'daki "fatura bekleniyor" kalkar, müşteri faturayı uygulamada görür.
// Yükleyemezse hata siparişe yazılır; siparişte "Trendyol'a yükle" ile yeniden denenir (cron ilk denemeyi yapar).
import { createAdminClient } from "@/lib/supabase-admin";
import { getTrendyolConfig, hasCredentials, sendInvoiceFile } from "@/lib/marketplace/trendyol";

type Sb = ReturnType<typeof createAdminClient>;

export class MarketplaceInvoiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function pushInvoiceToMarketplace(sb: Sb, orderId: string): Promise<{ sent: boolean; already?: boolean }> {
  const s = sb as any;
  const { data: o } = await s.from("orders")
    .select("id, channel, import_source, external_package_id, parasut_pdf_path, mp_invoice_sent_at").eq("id", orderId).maybeSingle();
  if (!o) throw new MarketplaceInvoiceError(404, "Sipariş bulunamadı.");
  if (o.channel !== "trendyol" || o.import_source) throw new MarketplaceInvoiceError(400, "Fatura yükleme şimdilik yalnız Trendyol siparişinde.");
  if (o.mp_invoice_sent_at) return { sent: true, already: true };
  if (!o.parasut_pdf_path) throw new MarketplaceInvoiceError(400, "Faturanın PDF'i yok (önce Paraşüt faturası kesilmeli).");
  if (!o.external_package_id) throw new MarketplaceInvoiceError(400, "Trendyol paket numarası yok.");

  const fail = async (msg: string, status = 502) => {
    await s.from("orders").update({ mp_invoice_error: msg.slice(0, 500) }).eq("id", orderId);
    throw new MarketplaceInvoiceError(status, msg);
  };
  const cfg = await getTrendyolConfig(sb);
  if (!hasCredentials(cfg)) return fail("Trendyol bağlantı bilgileri eksik (Ayarlar › Entegrasyonlar).", 400);

  const { data: file, error } = await s.storage.from("invoices").download(o.parasut_pdf_path);
  if (error || !file) return fail(`Fatura PDF'i okunamadı: ${error?.message || "dosya yok"}`, 500);
  const pdf = Buffer.from(await file.arrayBuffer());

  try {
    await sendInvoiceFile(cfg, String(o.external_package_id), pdf, `${o.external_package_id}.pdf`);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Daha önce (elle / eski firma) yüklenmişse: Trendyol'da fatura var demektir → gönderildi say
    if (/already been sent|zaten gönderil|daha önce gönderil/i.test(msg)) {
      await s.from("orders").update({ mp_invoice_sent_at: new Date().toISOString(), mp_invoice_error: null }).eq("id", orderId);
      await s.from("order_events").insert({ order_id: orderId, type: "note", note: "Trendyol'da bu paketin faturası zaten vardı (önceden yüklenmiş)" });
      return { sent: true, already: true };
    }
    return fail(msg);
  }
  await s.from("orders").update({ mp_invoice_sent_at: new Date().toISOString(), mp_invoice_error: null }).eq("id", orderId);
  await s.from("order_events").insert({ order_id: orderId, type: "note", note: "Fatura Trendyol'a yüklendi" });
  return { sent: true };
}

/** Cron (dakikada bir): Paraşüt faturası bitmiş, Trendyol'a henüz hiç denenmemiş siparişler (hata alanlar elle yeniden) */
export async function pollMarketplaceInvoices(sb: Sb = createAdminClient()) {
  const { data } = await (sb as any).from("orders").select("id")
    .eq("channel", "trendyol").is("import_source", null).eq("parasut_status", "done")
    .is("mp_invoice_sent_at", null).is("mp_invoice_error", null)
    .gte("updated_at", new Date(Date.now() - 7 * 86400_000).toISOString()).limit(10);
  const errors: string[] = [];
  let sent = 0;
  for (const r of (data as any[]) || []) {
    try { if ((await pushInvoiceToMarketplace(sb, r.id)).sent) sent++; }
    catch (e: any) { errors.push(e?.message || String(e)); }
  }
  return { sent, errors };
}
