/* eslint-disable @typescript-eslint/no-explicit-any */
// SATIŞ SONRASI E-POSTALARI (değişim / iade). Metinler canlıya almadan önce kullanıcıyla gözden geçirilecek.
// Test siparişlerine (@….test) e-posta gitmez (mail-guard), yöneticiye bildirim düşmez (isTestOrder).
import { createAdminClient } from "./supabase-admin";
import { escapeHtml, isTestOrder } from "./notifications";
import { sendSiteMail } from "./site-mail";
import { afterSaleUrl } from "./after-sale";

export const RETURN_METHOD_LABEL: Record<string, string> = {
  ups: "UPS adresten alım",
  surat: "Sürat Kargo şubesine teslim",
  aras: "Aras Kargo şubesine teslim",
};

const send = sendSiteMail;

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
    ? "UPS kargo görevlisi ürünü <b>adresinizden alacak</b>. Gelme saatini önceden bilemiyoruz; adreste teslim edecek biri olmalı. 5 gün içinde gelmezlerse bize yazın, Sürat ya da Aras şubesine bırakmanız için yeni kod gönderelim."
    : `Lütfen ürünü kargoya uygun şekilde paketleyip <b>${method === "surat" ? "Sürat Kargo" : "Aras Kargo"}</b> şubesine bırakın ve aşağıdaki kodu görevliye iletin. Kargo ücreti bize aittir.`;
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">${exchange ? "Değişim" : "İade"} kargo kodunuz hazır</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px">Merhaba${c.name ? ` ${c.name}` : ""}, <b>${c.label}</b> numaralı siparişiniz için ${exchange ? "geri göndereceğiniz ürünün" : "iadenizin"} kargo bilgisi hazır.</p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px">${how}</p>
    <div style="margin:0 0 16px;padding:14px 16px;border:1px dashed #84cc16;border-radius:12px;background:#f7fee7;text-align:center">
      <div style="font-size:12px;color:#4d7c0f">${escapeHtml(RETURN_METHOD_LABEL[method] ?? method)} · kargo kodu</div>
      <div style="font-size:24px;font-weight:800;letter-spacing:2px;color:#1a2e05;margin-top:4px">${escapeHtml(code)}</div>
    </div>
    <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 14px">Ürünü kutusuyla ve temiz göndermenizi rica ederiz. Bize ulaşınca ${exchange ? "değişiminizi tamamlayıp" : "iadenizi onaylayıp ödemenizi"} hemen ${exchange ? "haber veririz" : "iade ederiz"}. Gönderdiğinizi ayrıca bildirmenize gerek yok.</p>
    <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0;text-align:center">Talebinizi dilediğiniz zaman hesabınızdan ya da <a href="${afterSaleUrl(orderId)}" style="color:#6b7280">buradan</a> görüntüleyebilirsiniz.</p>`;
  return send(c.email, `${c.label} — ${exchange ? "değişim" : "iade"} kargo kodunuz`, body);
}

const p15 = (html: string, extra = "") => `<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px${extra}">${html}</p>`;
const tl = (v: number) => `₺${v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ul = (rows: string[]) => `<ul style="margin:0 0 14px;padding-left:20px;font-size:14px;color:#374151;line-height:1.7">${rows.map((r) => `<li>${r}</li>`).join("")}</ul>`;

/** Müşteriye: iade talebin alındı (kullanıcı 2026-11-26) — kod e-postası ayrıca gelir */
export async function sendReturnRequestedEmail(orderId: string, itemLabels: string[], method: string, bankTransfer: boolean) {
  const c = await orderCustomer(orderId);
  if (!c?.email) return { status: "failed" as const, error: "e-posta yok" };
  const how = method === "ups"
    ? "İade kargo kodunu kısa süre içinde e-postayla göndereceğiz; UPS görevlisi ürünü adresinden alacak."
    : `İade kargo kodunu kısa süre içinde e-postayla göndereceğiz; ürünü kodla birlikte <b>${method === "surat" ? "Sürat Kargo" : "Aras Kargo"}</b> şubesine bırakman yeterli.`;
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">İade talebini aldık</h1>
    ${p15(`Merhaba${c.name ? ` ${c.name}` : ""}, <b>${c.label}</b> siparişin için iade talebin bize ulaştı:`)}
    ${ul(itemLabels.map((l) => escapeHtml(l)))}
    ${p15(`${how} Kargo ücreti bize aittir.`)}
    ${p15(bankTransfer ? "Ürün bize ulaşınca ücret iaden yazdığın banka hesabına gönderilecek ve sana e-postayla haber vereceğiz." : "Ürün bize ulaşınca ücret iadeni yapıp sana e-postayla haber vereceğiz.", ";color:#6b7280;font-size:13px")}
    <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0;text-align:center">Talebini dilediğin zaman <a href="${afterSaleUrl(orderId)}" style="color:#6b7280">buradan</a> görüntüleyebilirsin.</p>`;
  return send(c.email, `${c.label} — iade talebin alındı`, body, undefined, "return_requested");
}

/** Müşteriye: iade tamamlandı — ürün geldi, ücret (ve kredi) iade edildi (kullanıcı 2026-11-26) */
export async function sendReturnCompletedEmail(orderId: string, r: { cash: number; method: string; credit: number }) {
  const c = await orderCustomer(orderId);
  if (!c?.email) return { status: "failed" as const, error: "e-posta yok" };
  const sb = createAdminClient() as any;
  const { data: its } = await sb.from("order_items").select("title, variant_name, returned_qty, products(title)").eq("order_id", orderId);
  const back = ((its as any[]) || []).filter((i) => Number(i.returned_qty || 0) > 0)
    .map((i) => escapeHtml(`${i.products?.title ?? i.title ?? "Ürün"}${i.variant_name ? ` (${i.variant_name})` : ""}${Number(i.returned_qty) > 1 ? ` × ${i.returned_qty}` : ""}`));
  const lines: string[] = [];
  if (r.cash > 0) {
    if (["iyzico", "card"].includes(r.method)) lines.push(`<b>${tl(r.cash)}</b> kartına iade edildi. Bankana bağlı olarak genellikle <b>1–14 iş günü</b> içinde kart hesabında görünür.`);
    else if (r.method === "bank_transfer") lines.push(`<b>${tl(r.cash)}</b> banka hesabına havale/EFT ile gönderildi. Genellikle <b>1–3 iş günü</b> içinde hesabında görünür.`);
    else if (r.method === "cash") lines.push(`<b>${tl(r.cash)}</b> nakit olarak iade edildi.`);
    else lines.push(`<b>${tl(r.cash)}</b> iade edildi.`);
  }
  if (r.credit > 0) lines.push(`<b>${tl(r.credit)}</b> YeriHisset Kredisi hesabına geri yüklendi; bir sonraki alışverişinde kullanabilirsin.`);
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">İaden tamamlandı</h1>
    ${p15(`Merhaba${c.name ? ` ${c.name}` : ""}, <b>${c.label}</b> siparişin için gönderdiğin ${back.length > 1 ? "ürünler" : "ürün"} bize ulaştı ve iade işlemlerin tamamlandı.`)}
    ${back.length ? ul(back) : ""}
    ${lines.map((l) => p15(l)).join("")}
    ${p15("Bir sorun olursa bu e-postayı yanıtlaman yeterli. Seni yeniden görmeyi umuyoruz.", ";color:#6b7280;font-size:13px")}`;
  return send(c.email, `${c.label} — iaden tamamlandı`, body, undefined, "return_completed");
}

/** Müşteriye: değişim talebin alındı (kullanıcı 2026-11-26) */
export async function sendExchangeRequestedEmail(orderId: string, lines: string[], waiting: boolean) {
  const c = await orderCustomer(orderId);
  if (!c?.email) return { status: "failed" as const, error: "e-posta yok" };
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">Değişim talebini aldık</h1>
    ${p15(`Merhaba${c.name ? ` ${c.name}` : ""}, <b>${c.label}</b> siparişin için değişim talebin bize ulaştı:`)}
    ${ul(lines.map((l) => escapeHtml(l)))}
    ${p15(waiting
      ? "İstediğin numara şu an stokta yok. Stoğa girer girmez sana ayırıp kargoya veriyoruz; kargoya verince e-postayla haber vereceğiz."
      : "Yeni numaranı kısa süre içinde kargoya veriyoruz; kargoya verince e-postayla haber vereceğiz.")}
    ${p15("Elindeki ürünü şimdi göndermene gerek yok: yeni numara gelince ikisini de dene, hangisinin olduğunu bize söyle. Kargo ücretleri bize aittir.", ";color:#6b7280;font-size:13px")}
    <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0;text-align:center">Talebini dilediğin zaman <a href="${afterSaleUrl(orderId)}" style="color:#6b7280">buradan</a> görüntüleyebilirsin.</p>`;
  return send(c.email, `${c.label} — değişim talebin alındı`, body, undefined, "exchange_requested");
}

/** Müşteriye: değişimdeki yeni numara kargoya verildi (kullanıcı 2026-11-26) */
export async function sendAltShippedEmail(orderId: string, lines: string[], tracking: string | null) {
  const c = await orderCustomer(orderId);
  if (!c?.email) return { status: "failed" as const, error: "e-posta yok" };
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">Yeni numaran yola çıktı 🚚</h1>
    ${p15(`Merhaba${c.name ? ` ${c.name}` : ""}, <b>${c.label}</b> siparişin için değişim ürünün kargoya verildi:`)}
    ${ul(lines.map((l) => escapeHtml(l)))}
    ${tracking ? `<div style="margin:0 0 16px;padding:12px 16px;border:1px dashed #84cc16;border-radius:12px;background:#f7fee7;text-align:center">
      <div style="font-size:12px;color:#4d7c0f">Kargo takip no</div>
      <div style="font-size:18px;font-weight:800;letter-spacing:1px;color:#1a2e05;margin-top:4px">${escapeHtml(tracking)}</div>
    </div>` : ""}
    ${p15("Ulaşınca ikisini de evde, günün farklı saatlerinde dene. Hangisini tuttuğunu sormak için sana ayrıca e-posta göndereceğiz.")}`;
  return send(c.email, `${c.label} — yeni numaran yola çıktı`, body, undefined, "alt_shipped");
}

/** Müşteriye: değişimin tamamlandı — geri gönderdiği ürün bize ulaştı (kullanıcı 2026-11-26) */
export async function sendExchangeCompletedEmail(orderId: string, keptLabel: string | null) {
  const c = await orderCustomer(orderId);
  if (!c?.email) return { status: "failed" as const, error: "e-posta yok" };
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">Değişimin tamamlandı ✅</h1>
    ${p15(`Merhaba${c.name ? ` ${c.name}` : ""}, <b>${c.label}</b> siparişin için geri gönderdiğin ürün bize ulaştı; değişimin tamamlandı.`)}
    ${keptLabel ? p15(`Sende kalan: <b>${escapeHtml(keptLabel)}</b>`) : ""}
    ${p15("İyi günlerde giy! Bir sorun olursa bu e-postayı yanıtlaman yeterli.", ";color:#6b7280;font-size:13px")}`;
  return send(c.email, `${c.label} — değişimin tamamlandı`, body, undefined, "exchange_completed");
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
