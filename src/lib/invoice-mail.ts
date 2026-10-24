/* eslint-disable @typescript-eslint/no-explicit-any */
// FATURA E-POSTASI (site siparişi): Paraşüt faturası bitince PDF müşteriye BİZDEN gider (bir kez — invoice_emailed_at).
// Pazaryeri müşterisine gitmez (faturayı pazaryeri iletir). Test adreslerine (@….test) mail-guard göndermez.
// Metin canlıya almadan önce kullanıcıyla gözden geçirilecek.
import { createAdminClient } from "./supabase-admin";
import { escapeHtml } from "./notifications";
import { sendSiteMail } from "./site-mail";
import { orderLabel } from "./order-label";
import { mailRedirectActive } from "./mail-guard";

type Sb = ReturnType<typeof createAdminClient>;

export async function sendInvoiceEmail(sb: Sb, orderId: string): Promise<{ status: "sent" | "failed" | "skipped"; error?: string }> {
  const s = sb as any;
  const { data: o } = await s.from("orders")
    .select("id, order_number, channel, import_source, user_id, customer_email, customer_name, parasut_pdf_path, parasut_invoice_no, invoice_emailed_at")
    .eq("id", orderId).maybeSingle();
  if (!o || (o.channel || "site") !== "site" || o.import_source) return { status: "skipped" };
  const trial = mailRedirectActive(); // e-posta denemesi: işaret / not yazılmaz, daha önce gönderilmiş olsa da gider
  if (o.invoice_emailed_at && !trial) return { status: "skipped" };
  if (!o.parasut_pdf_path) return { status: "failed", error: "Faturanın PDF'i yok" };
  const { data: p } = o.user_id ? await s.from("profiles").select("email, first_name").eq("id", o.user_id).maybeSingle() : { data: null };
  const email = p?.email || o.customer_email;
  if (!email) return { status: "failed", error: "Müşterinin e-posta adresi yok" };
  const { data: file, error } = await s.storage.from("invoices").download(o.parasut_pdf_path);
  if (error || !file) return { status: "failed", error: `PDF okunamadı: ${error?.message || "dosya yok"}` };

  const label = orderLabel(o);
  const name = escapeHtml(String(p?.first_name || o.customer_name || "").trim().split(" ")[0] || "");
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">Faturan ekte 🧾</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 10px">Merhaba${name ? ` ${name}` : ""}, <b>${escapeHtml(label)}</b> siparişinin faturası${o.parasut_invoice_no ? ` (<b>${escapeHtml(o.parasut_invoice_no)}</b>)` : ""} bu e-postanın ekinde.</p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0">Ayakkabılarını güzel günlerde giy. Bir sorunda bu e-postayı yanıtlaman yeterli.</p>`;
  const r = await sendSiteMail(email, `${label} faturan`, body, [
    { filename: `${o.parasut_invoice_no || label}.pdf`, content: Buffer.from(await file.arrayBuffer()), contentType: "application/pdf" },
  ]);
  if (trial) return r;
  if (r.status === "sent") {
    await s.from("orders").update({ invoice_emailed_at: new Date().toISOString() }).eq("id", orderId);
    await s.from("order_events").insert({ order_id: orderId, type: "note", note: "Fatura müşteriye e-postayla gönderildi" });
  } else {
    await s.from("order_events").insert({ order_id: orderId, type: "note", note: `Fatura e-postası gönderilemedi: ${r.error || ""}`.slice(0, 300) });
  }
  return r;
}
