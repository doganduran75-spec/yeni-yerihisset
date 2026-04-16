import { redirect } from "next/navigation";

export default function CategoriesRedirect() {
  redirect("/admin/settings?tab=categories");
}
