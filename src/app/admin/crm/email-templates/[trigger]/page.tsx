"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

const TRIGGER_LABELS: Record<string, string> = {
  order_placed: "Sipariş Alındı",
  order_paid: "Ödeme Onaylandı",
  order_shipped: "Kargoya Verildi",
  order_delivered: "Teslim Edildi",
  order_cancelled: "İptal Edildi",
};

export default function EditTemplatePage({ params }: { params: Promise<{ trigger: string }> }) {
  const { trigger } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({ subject: "", body_html: "", is_active: true });

  useEffect(() => {
    fetchTemplate();
  }, [trigger]);

  async function fetchTemplate() {
    const { data } = await supabase
      .from("email_templates")
      .select("subject, body_html, is_active")
      .eq("trigger", trigger)
      .single();

    if (data) {
      setForm({ subject: data.subject, body_html: data.body_html, is_active: data.is_active });
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("email_templates")
      .update({
        subject: form.subject,
        body_html: form.body_html,
        is_active: form.is_active,
      })
      .eq("trigger", trigger);

    setSaving(false);
    if (error) {
      alert("Kayıt sırasında bir hata oluştu: " + error.message);
    } else {
      router.push("/admin/crm/email-templates");
    }
  }

  // Basit preview wrapper — notifications.ts'deki buildEmailDocument'in hafif versiyonu
  const previewHtml = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#1d4ed8;padding:28px 40px;text-align:center;">
            <span style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-1px;">Yeri<span style="color:#93c5fd;">Hisset</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            ${form.body_html
              .replace(/\{\{customer_name\}\}/g, "Ayşe Yılmaz")
              .replace(/\{\{order_id\}\}/g, "A1B2C3D4")
              .replace(/\{\{order_date\}\}/g, "11.04.2026")
              .replace(/\{\{order_total\}\}/g, "₺459.90")
              .replace(/\{\{order_items_html\}\}/g, '<p style="color:#64748b;font-size:13px;">[Ürün listesi burada görünür]</p>')
              .replace(/\{\{shipping_address\}\}/g, "Kadıköy, İstanbul")
              .replace(/\{\{tracking_html\}\}/g, '<p style="color:#64748b;font-size:13px;">[Kargo takip bilgisi burada görünür]</p>')
              .replace(/\{\{store_name\}\}/g, "YeriHisset")
              .replace(/\{\{store_email\}\}/g, "info@yerihisset.com")
              .replace(/\{\{store_url\}\}/g, "#")}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">© 2026 YeriHisset. Tüm hakları saklıdır.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/crm/email-templates" className={buttonVariants({ variant: "ghost", size: "icon" }) + " shrink-0"}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Şablon Düzenle — {TRIGGER_LABELS[trigger] ?? trigger}
          </h2>
          <p className="text-muted-foreground text-sm">Konu satırını ve HTML gövdeyi düzenleyin.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle>Şablon Bilgileri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Konu Satırı</label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Siparişiniz Alındı! 🎉 - #{{order_id}}"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">HTML Gövde</label>
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                >
                  {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showPreview ? "Editöre Dön" : "Önizle"}
                </button>
              </div>

              {showPreview ? (
                <div className="border rounded-lg overflow-hidden h-[500px]">
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-full"
                    title="Email Önizleme"
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : (
                <textarea
                  className="flex min-h-[400px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={form.body_html}
                  onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                  placeholder="<p>HTML içerik buraya...</p>"
                  spellCheck={false}
                />
              )}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="is_active" className="text-sm font-medium cursor-pointer">
                Şablon aktif (devre dışı bırakırsanız bu tetikleyici için bildirim gönderilmez)
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push("/admin/crm/email-templates")}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={saving} className="gap-2 px-8">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Kaydet
          </Button>
        </div>
      </form>
    </div>
  );
}
