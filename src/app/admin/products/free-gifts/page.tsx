import { redirect } from "next/navigation";

// Bedelsiz Ürünler artık Kuponlar paneline taşındı (sekme).
export default function FreeGiftsRedirect() {
  redirect("/admin/coupons?tab=gifts");
}
