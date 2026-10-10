/* eslint-disable @typescript-eslint/no-explicit-any */
// SATIŞ SONRASI E-POSTALARI (değişim / iade). Metinler canlıya almadan önce kullanıcıyla gözden geçirilecek.
// Test siparişlerine (@….test) e-posta gitmez (mail-guard), yöneticiye bildirim düşmez (isTestOrder).
import { createAdminClient } from "./supabase-admin";
import { createMailTransport } from "./mail-guard";
import { buildSmtpConfig } from "./smtp-config";
import { buildEmailDocument, htmlToText, escapeHtml, isTestOrder } from "./notifications";
import { afterSaleUrl } from "./after-sale";

export const RETURN_METHOD_LABEL: Record<string, string> = {
  ups: "UPS adresten alım",
  surat: "Sürat Kargo şubesine teslim",
  aras: "Aras Kargo şubesine teslim",
};

async function send(to: string, subject: string, bodyHtml: string): Promise<{ status: "sent" | "failed"; error?: string }> {
  const sb = createAdminClient() as any;
  const { data: st } = await sb.from("settings").select("*").limit(1).maybeSingle();
  const storeName = st?.store_name || "YeriHisset";
  const cfg = buildSmtpConfig({ smtp_host: st?.smtp_host || "", smtp_port: st?.smtp_port, smtp_secure: st?.smtp_secure, smtp_user: st?.smtp_user, smtp_password: st?.smtp_password });
  if (!cfg.host || !cfg.auth.user) return { status: "failed", error: "SMTP ayarları eksik" };
  try {
    await createMailTransport(cfg).sendMail({
      from: `"${st?.smtp_from_name || storeName}" <${st?.smtp_from_email || cfg.auth.user}>`,
      to, subject: `${storeName} — ${subject}`,
      html: buildEmailDocument(bodyHtml, storeName), text: htmlToText(bodyHtml),
    });
    return { status: "sent" };
  } catch (e: any) {
    return { status: "failed", error: e?.message || "E-posta gönderilemedi" };
  }
}

async function orderCustomer(orderId: string) {
  const sb = createAdminClient() as any;
  const { data: o } = await sb.from("orders").select("id, order_number, user_id").eq("id", orderId).maybeSingle();
  if (!o) return null;
  const { data: p } = await sb.from("profiles").select("email, first_name").eq("id", o.user_id).maybeSingle();
  return { order: o, email: p?.email as string | undefined, name: escapeHtml((p?.first_name || "").trim()), label: o.order_number ? `YH${o.order_number}` : o.id.slice(0, 8).toUpperCase() };
}

const btn = (href: string, label: string) =>
  `<div style="text-align:center;margin:22px 0"><a href="${href}" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:15px">${label}</a></div>`;

/** Alternatif numara teslim edildi → "hangisi oldu?" */
export async function sendAltDeliveredEmail(orderId: string) {
  const c = await orderCustomer(orderId);
  if (!c?.email) return { status: "failed" as const, error: "e-posta yok" };
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">Yeni numaran ulaştı 👟</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 10px">Merhaba${c.name ? ` ${c.name}` : ""}, <b>${c.label}</b> siparişin için gönderdiğimiz numara elinde. Acele etme: ikisini de evde, günün farklı saatlerinde dene.</p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0">Karar verince hangisini tuttuğunu söyle; diğerini nasıl göndereceğini birlikte ayarlayalım.</p>
    ${btn(afterSaleUrl(orderId), "Hangisi oldu?")}`;
  return send(c.email, `${c.label} — hangisi oldu?`, body);
}

/** İade / değişim kargo kodu */
export async function sendReturnLabelEmail(orderId: string, method: string, code: string, exchange: boolean) {
  const c = await orderCustomer(orderId);
  if (!c?.email) return { status: "failed" as const, error: "e-posta yok" };
  const how = method === "ups"
    ? "UPS kargo görevlisi ürünü <b>adresinden alacak</b>. Gelme saatini önceden bilemiyoruz; adreste teslim edecek biri olmalı. 5 gün içinde gelmezlerse bize yaz, Sürat ya da Aras şubesine bırakman için yeni kod gönderelim."
    : `Ürünü paketleyip <b>${method === "surat" ? "Sürat Kargo" : "Aras Kargo"}</b> şubesine bırak, aşağıdaki kodu görevliye söyle. Ücreti bize ait.`;
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">${exchange ? "Değişim" : "İade"} kargo kodun hazır</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px">Merhaba${c.name ? ` ${c.name}` : ""}, <b>${c.label}</b> siparişin için ${exchange ? "geri göndereceğin ürünün" : "iaden için"} kargo bilgisi:</p>
    <div style="margin:0 0 14px;padding:14px 16px;border:1px dashed #84cc16;border-radius:12px;background:#f7fee7;text-align:center">
      <div style="font-size:12px;color:#4d7c0f">${escapeHtml(RETURN_METHOD_LABEL[method] ?? method)} · kargo kodu</div>
      <div style="font-size:24px;font-weight:800;letter-spacing:2px;color:#1a2e05;margin-top:4px">${escapeHtml(code)}</div>
    </div>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 8px">${how}</p>
    <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0">Ürünü kutusuyla ve temiz göndermeni rica ederiz. Bize ulaşınca ${exchange ? "değişimini tamamlayıp" : "iadeni onaylayıp ödemeni"} hemen ${exchange ? "haber veririz" : "iade ederiz"}.</p>
    ${btn(afterSaleUrl(orderId), "Talebimi görüntüle")}`;
  return send(c.email, `${c.label} — ${exchange ? "değişim" : "iade"} kargo kodun`, body);
}

/** Yöneticiye: müşteri değişim / iade istedi */
export async function sendAdminCaseEmail(orderId: string, title: string, lines: string[]) {
  const sb = createAdminClient() as any;
  const c = await orderCustomer(orderId);
  if (!c || (await isTestOrder(sb, c.order.user_id))) return { status: "skipped" as const };
  const { data: st } = await sb.from("settings").select("admin_notify_email, contact_email, smtp_from_email, smtp_user").limit(1).maybeSingle();
  const to = st?.admin_notify_email || st?.contact_email || st?.smtp_from_email || st?.smtp_user;
  if (!to) return { status: "skipped" as const };
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");
  const body = `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 10px">${escapeHtml(title)} — ${c.label}</h1>
    ${lines.map((l) => `<p style="font-size:14px;color:#374151;margin:0 0 6px;line-height:1.5">${l}</p>`).join("")}
    ${btn(`${site}/admin/orders`, "Siparişlere git")}`;
  return send(to, `${title}: ${c.label}`, body);
}
