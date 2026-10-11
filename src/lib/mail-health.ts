/* eslint-disable @typescript-eslint/no-explicit-any */
// E-POSTA SAĞLIĞI: "e-posta atıyorum sanıyorum ama gitmiyor" durumunu yakalar.
//   * Her gerçek gönderimin sonucu mail-guard'da mail_health'e yazılır (son başarılı / art arda hata).
//   * verifySmtp: SMTP sunucusuna bağlanıp giriş yapar, e-posta GÖNDERMEZ. Sağlık cron'u (15 dk) çağırır →
//     site az e-posta atsa da şifre / sunucu sorunu fark edilir.
// Pano › Sistem › "E-posta" kutusu ikisini birlikte değerlendirir (/api/admin/system-status).
import nodemailer from "nodemailer";
import { buildSmtpConfig } from "./smtp-config";

export async function verifySmtp(sb: any): Promise<{ ok: boolean; error?: string }> {
  const { data: st } = await sb.from("settings").select("*").limit(1).maybeSingle();
  const cfg = buildSmtpConfig({ smtp_host: st?.smtp_host || "", smtp_port: st?.smtp_port, smtp_secure: st?.smtp_secure, smtp_user: st?.smtp_user, smtp_password: st?.smtp_password });
  let r: { ok: boolean; error?: string };
  if (!cfg.host || !cfg.auth.user) r = { ok: false, error: "SMTP ayarları eksik (Ayarlar › E-posta)" };
  else {
    try {
      await nodemailer.createTransport({ ...cfg, connectionTimeout: 15000, greetingTimeout: 15000 }).verify();
      r = { ok: true };
    } catch (e: any) {
      r = { ok: false, error: String(e?.message || e).slice(0, 300) };
    }
  }
  await sb.from("mail_health").upsert({ id: 1, verify_at: new Date().toISOString(), verify_ok: r.ok, verify_error: r.ok ? null : r.error });
  return r;
}
