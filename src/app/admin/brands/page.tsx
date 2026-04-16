import { redirect } from "next/navigation";

export default function BrandsRedirect() {
  redirect("/admin/settings?tab=brands");
}
