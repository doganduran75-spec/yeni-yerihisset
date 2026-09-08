import { redirect } from "next/navigation";

// Bilgi Bankası artık Sayfa İçerikleri sayfasında sekme olarak yönetiliyor.
export default function KBArticlesRedirect() {
  redirect("/admin/site-content?tab=kb");
}
