/* eslint-disable @typescript-eslint/no-explicit-any */
// Site siparişi kargo olayları — tek kural: panelde "Kurye aldı" (/api/admin/orders/ship-flow) ve kargo entegrasyonu
// durum bildirimi (Basit Kargo webhook / sorgu, src/lib/kargonomi-flow.ts) aynı işi yapar.
//   pickedUp:  Kargoda + kargo e-postası (takip numarasıyla) — koşullu güncelleme: e-posta bir kez
//   delivered: Teslim edildi (delivered_at tetikleyicide) + teslim / "oldu mu?" e-postası — bir kez
import { sendOrderNotification } from "@/lib/notifications";

const SHIPPED = ["shipped", "delivered", "undelivered", "returned"];
type Sb = any;

export async function markPickedUp(sb: Sb, orderId: string, noteText: string, createdBy: string | null = null): Promise<{ ok: boolean; reason?: string }> {
  const { data: o } = await sb.from("orders")
    .select("id, user_id, channel, import_source, status, payment_status, shipment_status, packed_at, cargo_tracking_number, kargonomi_tracking_code, cargo_provider")
    .eq("id", orderId).maybeSingle();
  if (!o) return { ok: false, reason: "bulunamadı" };
  if ((o.channel || "site") !== "site" && !o.import_source) return { ok: false, reason: "pazaryeri" };
  if (o.status === "cancelled" || SHIPPED.includes(o.shipment_status || "")) return { ok: false, reason: "zaten kargoda ya da iptal" };
  const { data: done, error } = await sb.from("orders")
    .update({ shipment_status: "shipped", ...(o.packed_at ? {} : { packed_at: new Date().toISOString() }) })
    .eq("id", o.id).not("shipment_status", "in", `(${SHIPPED.join(",")})`).select("id");
  if (error) return { ok: false, reason: /PAYMENT_REQUIRED/.test(error.message) ? "ödeme alınmamış" : error.message };
  if (!done?.length) return { ok: false, reason: "zaten kargoda" };
  await sb.from("order_events").insert({ order_id: o.id, type: "note", note: noteText, created_by: createdBy });
  const code = o.cargo_tracking_number || o.kargonomi_tracking_code;
  await sendOrderNotification("order_shipped", { orderId: o.id, userId: o.user_id, ...(code ? { trackingNumber: o.cargo_provider ? `${code} (${o.cargo_provider})` : code } : {}) })
    .catch((e: any) => console.error("[ship-events] kargo e-postası", e?.message || e));
  return { ok: true };
}

export async function markDelivered(sb: Sb, orderId: string, noteText: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: o } = await sb.from("orders").select("id, user_id, channel, import_source, status, shipment_status").eq("id", orderId).maybeSingle();
  if (!o) return { ok: false, reason: "bulunamadı" };
  if ((o.channel || "site") !== "site" && !o.import_source) return { ok: false, reason: "pazaryeri" };
  if (o.status === "cancelled" || ["delivered", "undelivered", "returned"].includes(o.shipment_status || "")) return { ok: false, reason: "durum uygun değil" };
  const { data: done, error } = await sb.from("orders").update({ shipment_status: "delivered" })
    .eq("id", o.id).not("shipment_status", "in", "(delivered,undelivered,returned)").select("id");
  if (error) return { ok: false, reason: error.message };
  if (!done?.length) return { ok: false, reason: "zaten teslim" };
  await sb.from("order_events").insert({ order_id: o.id, type: "note", note: noteText, created_by: null });
  await sendOrderNotification("order_delivered", { orderId: o.id, userId: o.user_id })
    .catch((e: any) => console.error("[ship-events] teslim e-postası", e?.message || e));
  return { ok: true };
}
