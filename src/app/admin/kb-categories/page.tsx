import { redirect } from "next/navigation";

export default function KBCategoriesRedirect() {
  redirect("/admin/settings?tab=kb-categories");
}
