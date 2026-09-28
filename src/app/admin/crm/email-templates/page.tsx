import { redirect } from "next/navigation";

// E-posta şablonları Ayarlar altına taşındı (eski adres/bookmark bozulmasın)
export default function EmailTemplatesRedirect() {
  redirect("/admin/settings?tab=email-templates");
}
