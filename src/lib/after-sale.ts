/* eslint-disable @typescript-eslint/no-explicit-any */
// SATIŞ SONRASI (migration 20261031000001): "Ayakkabın oldu mu?" → Oldu / Değişim / İade.
// Müşteri sayfası /deneme-sonucu giriş gerektirmez: bağlantıdaki r = sipariş kimliği + imza
// (teslim e-postasında gelir). Üye Hesabım'dan da açabilir (oturum + kendi siparişi).
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-admin";

import { TRIAL_DAYS, UPS_WAIT_DAYS } from "@/lib/order-next-step"; // 14 gün deneme · UPS 5 gün
export { TRIAL_DAYS, UPS_WAIT_DAYS };

const key = () => `after-sale:${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`;
const sig = (orderId: string) => createHmac("sha256", key()).update(orderId).digest("base64url").slice(0, 32);

export const afterSaleToken = (orderId: string) => `${orderId}.${sig(orderId)}`;

export function verifyAfterSaleToken(token: string): string | null {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/i.exec(String(token || ""));
  if (!m) return null;
  const a = Buffer.from(sig(m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
}

export function afterSaleUrl(orderId: string, choice?: "oldu" | "degisim" | "iade") {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");
  return `${site}/deneme-sonucu?r=${afterSaleToken(orderId)}${choice ? `&secim=${choice}` : ""}`;
}

/** TR IBAN: TR + 24 hane, mod-97 kontrolü */
export function validIban(raw: string): string | null {
  const s = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!/^TR\d{24}$/.test(s)) return null;
  const re = s.slice(4) + s.slice(0, 4);
  const num = re.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of num) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1 ? s : null;
}

export type AfterSaleView = {
  orderId: string;
  orderLabel: string;
  paymentMethod: string;
  fitStatus: string | null;
  deliveredAt: string | null;
  canAnswer: boolean;          // teslim edilmiş, site siparişi, 14 gün dolmamış, açık talep yok
  openCase: any | null;
  items: { id: string; product_id: string; variant_id: string | null; title: string; image: string | null; size: string; price: number; returned: number; exchange_of: string | null; slug: string | null }[];
};

export async function loadAfterSale(orderId: string): Promise<AfterSaleView | null> {
  const sb = createAdminClient() as any;
  const { data: o } = await sb.from("orders")
    .select("id, order_number, channel, import_source, status, payment_method, payment_status, shipment_status, fit_status, delivered_at")
    .eq("id", orderId).maybeSingle();
  if (!o || (o.channel || "site") !== "site" || o.import_source) return null;
  const { data: rows } = await sb.from("order_items")
    .select("id, product_id, variant_id, unit_price, variant_name, quantity, returned_qty, exchange_of, products(title, slug, image_url, images)")
    .eq("order_id", orderId).order("created_at");
  const { data: c } = await sb.from("order_cases").select("*").eq("order_id", orderId).is("closed_at", null).maybeSingle();
  const delivered = o.shipment_status === "delivered" && o.status !== "cancelled";
  const inWindow = !o.delivered_at || Date.now() - new Date(o.delivered_at).getTime() < TRIAL_DAYS * 86400000;
  return {
    orderId: o.id,
    orderLabel: o.order_number ? `YH${o.order_number}` : o.id.slice(0, 8).toUpperCase(),
    paymentMethod: o.payment_method,
    fitStatus: o.fit_status,
    deliveredAt: o.delivered_at,
    canAnswer: delivered && inWindow && !c && (o.fit_status === "trial" || o.fit_status === null),
    openCase: c ? { ...c, iban: c.iban ? `${String(c.iban).slice(0, 4)}…${String(c.iban).slice(-4)}` : null } : null,
    items: ((rows as any[]) || []).filter((i) => Number(i.unit_price) > 0).map((i) => ({
      id: i.id, product_id: i.product_id, variant_id: i.variant_id,
      title: i.products?.title ?? "Ürün",
      image: i.products?.image_url || i.products?.images?.[0] || null,
      slug: i.products?.slug ?? null,
      size: i.variant_name || "", price: Number(i.unit_price), returned: Number(i.returned_qty || 0), exchange_of: i.exchange_of,
    })),
  };
}

/**
 * Değişim önerileri: aynı ürünün stoktaki numaraları (istenen yöne göre önerilen işaretli);
 * önerilen numara bu üründe stokta yoksa kategorideki aynı numaralı, stokta olan ürünler.
 */
export async function exchangeOptions(orderId: string, itemId: string, dir: "up" | "down" | "same") {
  const sb = createAdminClient() as any;
  const { data: it } = await sb.from("order_items").select("id, product_id, variant_id, unit_price, variant_name").eq("id", itemId).eq("order_id", orderId).maybeSingle();
  if (!it) return null;
  const { data: prod } = await sb.from("products").select("id, title, category_id").eq("id", it.product_id).maybeSingle();
  const { data: vars } = await sb.from("product_variants")
    .select("id, stock, is_active, price, variant_options(value)").eq("product_id", it.product_id);
  const sizeNum = (v: string) => Number(String(v || "").replace(",", ".").match(/\d+(\.\d+)?/)?.[0] ?? NaN);
  const cur = sizeNum(it.variant_name);
  const target = Number.isFinite(cur) ? (dir === "up" ? cur + 1 : dir === "down" ? cur - 1 : cur) : NaN;
  const same = ((vars as any[]) || [])
    .filter((v) => v.is_active !== false && v.id !== it.variant_id)
    .map((v) => ({ variant_id: v.id, product_id: it.product_id, title: prod?.title ?? "", size: v.variant_options?.value ?? "", stock: Number(v.stock || 0), price: Number(v.price) }))
    .sort((a, b) => sizeNum(a.size) - sizeNum(b.size));
  const suggested = same.find((v) => sizeNum(v.size) === target) ?? null;

  let others: any[] = [];
  if (Number.isFinite(target) && (!suggested || suggested.stock < 1) && prod?.category_id) {
    const { data: cand } = await sb.from("product_variants")
      .select("id, stock, price, is_active, product_id, variant_options(value), products!inner(id, title, slug, image_url, images, is_active, category_id)")
      .eq("products.category_id", prod.category_id).eq("products.is_active", true).gt("stock", 0).neq("product_id", it.product_id).limit(200);
    others = ((cand as any[]) || [])
      .filter((v) => v.is_active !== false && sizeNum(v.variant_options?.value) === target)
      .slice(0, 12)
      .map((v) => ({ variant_id: v.id, product_id: v.product_id, title: v.products?.title ?? "", size: v.variant_options?.value ?? "", stock: Number(v.stock || 0), price: Number(v.price), image: v.products?.image_url || v.products?.images?.[0] || null }));
  }
  return { current: it.variant_name, target: Number.isFinite(target) ? String(target) : null, suggested, same, others };
}

/**
 * Teslim e-postasına eklenen kutu: acele etmeden evde dene + Oldu / Değişim / İade düğmeleri.
 * Metin canlıya almadan önce kullanıcıyla gözden geçirilecek (go-live listesi).
 */
export function fitBoxHtml(orderId: string): string {
  const btn = (href: string, label: string, bg: string, fg = "#fff", border = bg) =>
    `<a href="${href}" style="display:inline-block;margin:4px;background:${bg};color:${fg};border:1px solid ${border};text-decoration:none;padding:11px 18px;border-radius:12px;font-weight:700;font-size:14px">${label}</a>`;
  return `
    <div style="margin:22px 0 4px;padding:18px;border:1px solid #d9f99d;background:#f7fee7;border-radius:14px">
      <p style="margin:0 0 8px;font-size:16px;font-weight:800;color:#365314">Acele yok — ayakkabın içine sinsin 👣</p>
      <p style="margin:0 0 10px;font-size:14px;color:#3f6212;line-height:1.6">
        Ayakkabını birkaç gün evde, günün farklı saatlerinde giyip dene. Ayaklar gün içinde biraz şişer; akşam da rahat ediyorsan doğru numaradır.
        Denerken evin içinde, temiz zeminde giymeni öneririz ki gerekirse değişim ya da iade sorunsuz olsun.
      </p>
      <p style="margin:0 0 6px;font-size:14px;color:#365314;font-weight:700">Hazır olduğunda bize söyle: ayakkabın oldu mu?</p>
      <div style="text-align:center;margin:8px 0 0">
        ${btn(afterSaleUrl(orderId, "oldu"), "Oldu, çok rahat", "#4d7c0f")}
        ${btn(afterSaleUrl(orderId, "degisim"), "Numara değişimi", "#ffffff", "#365314", "#a3e635")}
        ${btn(afterSaleUrl(orderId, "iade"), "İade etmek istiyorum", "#ffffff", "#6b7280", "#d1d5db")}
      </div>
      <p style="margin:10px 0 0;font-size:12px;color:#65a30d;text-align:center">Değişim ve iade için ${TRIAL_DAYS} günün var.</p>
    </div>`;
}
