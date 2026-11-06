// İPTAL NEDENLERİ (kullanıcı 2026-11-06) — yönetici iptal penceresinde seçer (zorunlu), müşteriye giden iptal
// e-postasında karşılığı yazar (src/lib/notifications.ts buildCancelInfoHtml). "Diğer"de müşteriye not zorunlu.
// Kayıt: orders.cancel_reason + orders.cancel_customer_note (MIG 20261171).
export const CANCEL_REASONS: { key: string; label: string; customer: string }[] = [
  { key: "stock", label: "Stokta kalmadı", customer: "Siparişindeki ürün stoklarımızda kalmadığı için siparişini iptal etmek zorunda kaldık. Bunun için özür dileriz." },
  { key: "customer", label: "Müşteri istedi", customer: "İsteğin üzerine siparişini iptal ettik." },
  { key: "payment", label: "Ödeme gelmedi", customer: "Ödemen bize ulaşmadığı için siparişini iptal ettik." },
  { key: "address", label: "Adres / teslimat sorunu", customer: "Teslimat adresiyle ilgili bir sorun nedeniyle siparişini iptal etmek zorunda kaldık." },
  { key: "other", label: "Diğer (müşteriye notu yaz)", customer: "" },
];

export const cancelReason = (key?: string | null) => CANCEL_REASONS.find((r) => r.key === key) || null;
