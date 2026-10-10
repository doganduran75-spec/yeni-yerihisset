/* eslint-disable @typescript-eslint/no-explicit-any */
// Basit site e-postası: ayarlardaki SMTP + standart şablon (buildEmailDocument). Kilit / test adresi
// kuralları mail-guard'dan gelir (@….test adreslerine asla gitmez).
import { createAdminClient } from "./supabase-admin";
import { createMailTransport } from "./mail-guard";
import { buildSmtpConfig } from "./smtp-config";
import { buildEmailDocument, htmlToText } from "./notifications";

export async function sendSiteMail(to: string, subject: string, bodyHtml: string): Promise<{ status: "sent" | "failed"; error?: string }> {
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

export const mailButton = (href: string, label: string) =>
  `<div style="text-align:center;margin:22px 0"><a href="${href}" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:15px">${label}</a></div>`;
