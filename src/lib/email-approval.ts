/* eslint-disable @typescript-eslint/no-explicit-any */
// E-POSTA ONAYI (kullanıcı 2026-11-15): bekleyen e-postayı gönder / gönderme, türü onayla / onayı geri al.
// Bekletme kuralı: src/lib/mail-guard.ts (holdForApproval). Tablo: MIG 20261185. Ekran: /admin/email-onay.
// "Gönder" = bu e-posta gider + tür onaylanır + aynı türde bekleyen diğer e-postalar da gider (aynı şablon).
import { createAdminClient } from "./supabase-admin";
import { createMailTransport, resetMailGuardCache } from "./mail-guard";
import { buildSmtpConfig } from "./smtp-config";

type Sb = any;

/** Tür adları (şablon tetikleyicisi). Bilinmeyen tür: "konu:<konu>" → konu gösterilir. */
export const EMAIL_KIND_LABEL: Record<string, string> = {
  order_placed: "Sipariş alındı", order_paid: "Ödeme onaylandı", order_shipped: "Kargoya verildi",
  order_delivered: "Teslim edildi", order_cancelled: "Sipariş iptal edildi", coupon_assigned: "Yeni kupon tanımlandı",
  cart_abandonment: "Sepet hatırlatma", order_recovery: "Sipariş kurtarma", review_request: "Yorum isteme",
  trial_reminder: "Deneme hatırlatması", newsletter_welcome: "Bülten — hoş geldin", newsletter_confirm: "Bülten — abonelik onayı", winback: "Seni özledik",
  message_reply: "Sipariş mesajına cevap", lead_magnet_welcome: "Fırsat — hoş geldin / kupon",
  email_verification: "E-posta doğrulama", password_recovery: "Şifre sıfırlama", guest_activation: "Misafir hesabı — şifre belirle",
  stock_notify_signup: "Stok talebi alındı", back_in_stock: "Stok geldi", affiliate_payout: "Satış ortağı hakedişi",
  crm_coupon: "CRM kampanya kuponu", invoice: "Fatura e-postası",
};
export const kindLabel = (kind: string) => EMAIL_KIND_LABEL[kind] ?? (kind.startsWith("konu:") ? `Diğer: ${kind.slice(5)}` : kind);
/** Şablon ekranı olan türler (Ayarlar › CRM › E-posta şablonları) */
export const TEMPLATE_EDITABLE = new Set(["order_placed", "order_paid", "order_shipped", "order_delivered", "order_cancelled", "coupon_assigned",
  "cart_abandonment", "order_recovery", "review_request", "trial_reminder", "newsletter_welcome", "winback"]);

async function transport(sb: Sb) {
  const { data: st } = await sb.from("settings").select("*").limit(1).maybeSingle();
  const cfg = buildSmtpConfig({ smtp_host: st?.smtp_host || "", smtp_port: st?.smtp_port, smtp_secure: st?.smtp_secure, smtp_user: st?.smtp_user, smtp_password: st?.smtp_password });
  if (!cfg.host || !cfg.auth.user) throw new Error("SMTP ayarları eksik");
  return createMailTransport(cfg, { approved: true });
}

async function sendRow(sb: Sb, t: any, row: any, adminId: string | null): Promise<boolean> {
  const p = row.payload || {};
  try {
    await t.sendMail({
      from: p.from, to: p.to, cc: p.cc || undefined, bcc: p.bcc || undefined, replyTo: p.replyTo || undefined,
      subject: row.subject || "", html: row.html || undefined, text: p.text || undefined,
      attachments: (p.attachments || []).map((a: any) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(String(a.content || ""), "base64") })),
    });
    await sb.from("email_approvals").update({ status: "sent", decided_at: new Date().toISOString(), decided_by: adminId, error: null }).eq("id", row.id);
    return true;
  } catch (e: any) {
    await sb.from("email_approvals").update({ status: "failed", decided_at: new Date().toISOString(), decided_by: adminId, error: String(e?.message || e).slice(0, 300) }).eq("id", row.id);
    return false;
  }
}

/** Gönder + türü onayla + aynı türde bekleyenleri gönder. */
export async function approveAndSend(id: string, adminId: string | null, sb: Sb = createAdminClient()) {
  const { data: row } = await sb.from("email_approvals").select("*").eq("id", id).maybeSingle();
  if (!row) return { error: "Kayıt bulunamadı" };
  if (row.status !== "pending") return { error: "Bu e-posta zaten işlenmiş" };
  const t = await transport(sb);
  const ok = await sendRow(sb, t, row, adminId);
  if (!ok) return { error: "Gönderilemedi — Sistem ekranında e-posta durumuna bak", sent: 0 };
  await sb.from("email_approved_kinds").upsert({ kind: row.kind, label: kindLabel(row.kind), approved_by: adminId, approved_at: new Date().toISOString() });
  resetMailGuardCache();
  // Aynı türde bekleyenler (aynı şablon) — onaylandığı için gider
  const { data: rest } = await sb.from("email_approvals").select("*").eq("kind", row.kind).eq("status", "pending").order("created_at").limit(100);
  let more = 0;
  for (const r of (rest as any[]) || []) if (await sendRow(sb, t, r, adminId)) more++;
  return { ok: true, sent: 1 + more };
}

export async function discard(id: string, adminId: string | null, sb: Sb = createAdminClient()) {
  const { data, error } = await sb.from("email_approvals").update({ status: "discarded", decided_at: new Date().toISOString(), decided_by: adminId })
    .eq("id", id).eq("status", "pending").select("id");
  if (error) return { error: error.message };
  return data?.length ? { ok: true } : { error: "Bu e-posta zaten işlenmiş" };
}

export async function unapproveKind(kind: string, sb: Sb = createAdminClient()) {
  const { error } = await sb.from("email_approved_kinds").delete().eq("kind", kind);
  resetMailGuardCache();
  return error ? { error: error.message } : { ok: true };
}
