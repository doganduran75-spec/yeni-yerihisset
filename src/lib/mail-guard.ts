/* eslint-disable @typescript-eslint/no-explicit-any */
// E-POSTA KİLİDİ: canlıya geçene kadar (settings.email_lock_enabled) e-postalar
// yalnız İZİNLİ adreslere gider: yöneticiler, mağazanın kendi adresleri (bildirim /
// iletişim / gönderen) + settings.email_allowlist. Amaç:
// WooCommerce'ten aktarılan GERÇEK müşterilere staging'deki testlerden yanlışlıkla
// e-posta gitmesin. Engellenen gönderim EmailLockedError fırlatır → çağıran yer
// gönderimi "failed" olarak kaydeder (bildirim kaydında / kuyrukta görünür).
// Tüm uygulama e-postaları createMailTransport() üzerinden gider.
//
// Ayar okunamazsa kilit KAPALI sayılmaz (güvenli taraf): yalnız yöneticilere gider.

import nodemailer, { type SendMailOptions } from "nodemailer";
import { createAdminClient } from "./supabase-admin";

export class EmailLockedError extends Error {
  code = "EMAIL_LOCKED";
  constructor(recipients: string[]) {
    super(`E-posta kilidi açık: ${recipients.join(", ")} izinli listede değil, gönderilmedi (Ayarlar › Genel › E-posta kilidi).`);
  }
}

type LockState = { at: number; locked: boolean; allow: Set<string> };
let cache: LockState | null = null;

async function lockState(): Promise<LockState> {
  if (cache && Date.now() - cache.at < 30_000) return cache;
  const sb = createAdminClient() as any;
  const [settingsRes, adminsRes] = await Promise.all([
    sb.from("settings").select("*").limit(1).maybeSingle(),
    sb.from("profiles").select("email").eq("role", "admin"),
  ]);
  const allow = new Set<string>();
  for (const a of adminsRes.data || []) if (a.email) allow.add(String(a.email).toLowerCase());
  // Mağazanın kendi adresleri (yönetici bildirimi, sunucu uyarısı) her zaman izinli
  const st = settingsRes.data || {};
  for (const e of [st.admin_notify_email, st.contact_email, st.smtp_from_email]) if (e) allow.add(String(e).trim().toLowerCase());
  for (const e of String(st.email_allowlist || "").split(/[\s,;]+/)) {
    if (e.trim()) allow.add(e.trim().toLowerCase());
  }
  const locked = settingsRes.error ? true : settingsRes.data?.email_lock_enabled !== false;
  cache = { at: Date.now(), locked, allow };
  return cache;
}

function addresses(v: unknown): string[] {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.flatMap((x: any) => {
    const s = typeof x === "string" ? x : x?.address || "";
    return (s.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []).map((e: string) => e.toLowerCase());
  });
}

/** nodemailer.createTransport yerine: aynı sendMail, kilit kontrolüyle. */
export function createMailTransport(config: any) {
  const transport = nodemailer.createTransport(config);
  return {
    async sendMail(opts: SendMailOptions) {
      const st = await lockState();
      if (st.locked) {
        const blocked = [opts.to, opts.cc, opts.bcc].flatMap(addresses).filter((e) => !st.allow.has(e));
        if (blocked.length) throw new EmailLockedError(blocked);
      }
      return transport.sendMail(opts);
    },
  };
}

export function isEmailLockedError(err: unknown): boolean {
  return (err as any)?.code === "EMAIL_LOCKED";
}
