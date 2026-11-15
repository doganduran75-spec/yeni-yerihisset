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
import { AsyncLocalStorage } from "node:async_hooks";
import { createAdminClient } from "./supabase-admin";

export class EmailLockedError extends Error {
  code = "EMAIL_LOCKED";
  constructor(recipients: string[], testAddress = false) {
    super(testAddress
      ? `E-posta kilidi (test adresi): ${recipients.join(", ")} test adresi — e-posta hiçbir zaman gönderilmez.`
      : `E-posta kilidi açık: ${recipients.join(", ")} izinli listede değil, gönderilmedi (Ayarlar › Genel › E-posta kilidi).`);
  }
}

// TEST ADRESLERİ: otomatik regresyon testlerinin müşterileri (@yerihisset.test vb.). Bu adreslere
// kilit kapalı olsa da (canlıda) ASLA e-posta gönderilmez; test siparişleri yöneticiye bildirim de üretmez.
export const isTestEmail = (e?: string | null) => /@[^@\s]*\.(test|invalid)$/i.test(String(e || "").trim());

type LockState = { at: number; locked: boolean; allow: Set<string>; approval: boolean; approvedKinds: Set<string> };
let cache: LockState | null = null;
/** Onay / onay geri alma sonrası (src/lib/email-approval.ts) — bu süreçte hemen geçerli olsun */
export const resetMailGuardCache = () => { cache = null; };

async function lockState(): Promise<LockState> {
  if (cache && Date.now() - cache.at < 15_000) return cache;
  const sb = createAdminClient() as any;
  const [settingsRes, adminsRes, kindsRes] = await Promise.all([
    sb.from("settings").select("*").limit(1).maybeSingle(),
    sb.from("profiles").select("email").eq("role", "admin"),
    sb.from("email_approved_kinds").select("kind"),
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
  // E-POSTA ONAYI (MIG 20261185): kolon yoksa (migration uygulanmadıysa) kapalı sayılır
  const approval = settingsRes.data?.email_approval_enabled === true && !kindsRes.error;
  const approvedKinds = new Set<string>(((kindsRes.data as any[]) || []).map((k) => String(k.kind)));
  cache = { at: Date.now(), locked, allow, approval, approvedKinds };
  return cache;
}

// ── E-POSTA ONAYI (kullanıcı 2026-11-15) ────────────────────────────────────
// Müşteriye giden bir e-posta TÜRÜ ilk kez gönderileceğinde gönderilmez → email_approvals'a (bekliyor) yazılır,
// çağıran yere "gönderildi" döner (akış bozulmaz). Yönetici /admin/email-onay'da görüp "Gönder" deyince gider
// ve tür onaylanır; sonraki aynı tür e-postalar doğrudan gider. Tür: X-YH-Template başlığı → şablondaki
// <!--yh-tpl:…--> işareti (renderEmailTemplate) → konu (sayılar atılmış). Yönetici / mağaza adresleri onaya düşmez.
export const TEMPLATE_HEADER = "X-YH-Template";
export function mailKind(opts: SendMailOptions): string {
  const h: any = opts.headers;
  const fromHeader = h && !Array.isArray(h) ? h[TEMPLATE_HEADER] : null;
  if (fromHeader) return String(fromHeader);
  const m = String(opts.html || "").match(/<!--yh-tpl:([a-z0-9_]+)-->/);
  if (m) return m[1];
  const subj = String(opts.subject || "").replace(/^[^—]{1,40}—\s*/, "").replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
  return `konu:${subj.slice(0, 80)}`;
}

async function holdForApproval(opts: SendMailOptions, kind: string, recipients: string[]) {
  const atts = ((opts.attachments as any[]) || []).map((a) => ({
    filename: a.filename, contentType: a.contentType,
    content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : Buffer.from(String(a.content ?? "")).toString("base64"),
  }));
  const payload = { from: opts.from, to: opts.to, cc: opts.cc, bcc: opts.bcc, replyTo: opts.replyTo, text: opts.text, attachments: atts };
  const { data, error } = await (createAdminClient() as any).from("email_approvals").insert({
    kind, recipient: recipients.join(", ").slice(0, 300), subject: String(opts.subject || "").slice(0, 300),
    html: typeof opts.html === "string" ? opts.html : null, payload: JSON.parse(JSON.stringify(payload)),
  }).select("id").single();
  if (error || !data) throw new Error(`E-posta onaya alınamadı: ${error?.message || "kayıt yazılamadı"}`);
  return { messageId: `held-${data.id}`, held: true, accepted: [], rejected: [], response: "onay bekliyor" };
}

function addresses(v: unknown): string[] {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.flatMap((x: any) => {
    const s = typeof x === "string" ? x : x?.address || "";
    return (s.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []).map((e: string) => e.toLowerCase());
  });
}

// E-posta sağlığı (Pano › Sistem › E-posta): her GERÇEK gönderim denemesinin sonucu. Kilit / test adresi
// engeli sayılmaz (bilerek gönderilmedi). Beklenmez; kayıt yazılamazsa gönderimi etkilemez.
function recordMailResult(ok: boolean, error?: string) {
  void Promise.resolve((createAdminClient() as any).rpc("mail_health_record", { p_ok: ok, p_error: error ?? null }))
    .catch(() => { /* kritik değil */ });
}

// E-POSTA DENEMESİ (Pano › CRM › E-posta denemesi): bu blok içinde giden HER e-posta yöneticinin adresine gider
// (asıl alıcı konuya yazılır); kayıt / işaret yazan yerler mailRedirectActive() ile atlar (müşteri kaydına iz kalmaz).
const redirectStore = new AsyncLocalStorage<{ to: string }>();
export const runWithMailRedirect = <T>(to: string, fn: () => Promise<T>) => redirectStore.run({ to }, fn);
export const mailRedirectActive = () => !!redirectStore.getStore();

/** nodemailer.createTransport yerine: aynı sendMail, kilit kontrolüyle. */
export function createMailTransport(config: any, mode: { approved?: boolean } = {}) {
  const transport = nodemailer.createTransport(config);
  return {
    async sendMail(opts: SendMailOptions): Promise<any> {
      const r = redirectStore.getStore();
      if (r) {
        const orig = [opts.to].flatMap(addresses).join(", ") || "—";
        opts = { ...opts, to: r.to, cc: undefined, bcc: undefined, subject: `[DENEME → ${orig}] ${opts.subject || ""}` };
      }
      const testRcpt = [opts.to, opts.cc, opts.bcc].flatMap(addresses).filter((e) => isTestEmail(e));
      if (testRcpt.length) throw new EmailLockedError(testRcpt, true);
      const st = await lockState();
      if (st.locked) {
        const blocked = [opts.to, opts.cc, opts.bcc].flatMap(addresses).filter((e) => !st.allow.has(e));
        if (blocked.length) throw new EmailLockedError(blocked);
      }
      // E-posta onayı: deneme yönlendirmesi ve yönetici onayıyla gönderim hariç
      if (!r && !mode.approved && st.approval) {
        const customers = [opts.to, opts.cc, opts.bcc].flatMap(addresses).filter((e) => !st.allow.has(e));
        const kind = mailKind(opts);
        if (customers.length && !st.approvedKinds.has(kind)) return holdForApproval(opts, kind, customers);
      }
      try {
        const h: any = opts.headers;
        if (h && !Array.isArray(h) && TEMPLATE_HEADER in h) { const { [TEMPLATE_HEADER]: _k, ...rest } = h; void _k; opts = { ...opts, headers: rest }; }
        const info = await transport.sendMail(opts);
        recordMailResult(true);
        return info;
      } catch (e: any) {
        recordMailResult(false, e?.message || String(e));
        throw e;
      }
    },
  };
}

export function isEmailLockedError(err: unknown): boolean {
  return (err as any)?.code === "EMAIL_LOCKED";
}
