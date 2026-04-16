import { redirect } from "next/navigation";

export default function RolesRedirect() {
  redirect("/admin/settings?tab=roles");
}
