import { redirect } from "next/navigation";

// İş Ortağı Fırsatları artık İş Ortakları sayfasında sekme olarak yönetiliyor.
export default function OpportunitiesRedirect() {
  redirect("/admin/partners?tab=firsatlar");
}
