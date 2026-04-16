import { redirect } from "next/navigation";

export default function VariantsRedirect() {
  redirect("/admin/settings?tab=variants");
}
