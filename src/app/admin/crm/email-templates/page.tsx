"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Edit2, Mail, Loader2, ToggleLeft, ToggleRight } from "lucide-react";

type Template = {
  id: string;
  trigger: string;
  subject: string;
  is_active: boolean;
  updated_at: string;
};

const TRIGGERS = [
  { key: "order_placed", label: "Sipariş Alındı", desc: "Müşteri sipariş verdiğinde gönderilir.", color: "bg-blue-50 text-blue-700" },
  { key: "order_paid", label: "Ödeme Onaylandı", desc: "Ödeme başarıyla alındığında gönderilir.", color: "bg-cyan-50 text-cyan-700" },
  { key: "order_shipped", label: "Kargoya Verildi", desc: "Sipariş kargoya teslim edildiğinde gönderilir.", color: "bg-purple-50 text-purple-700" },
  { key: "order_delivered", label: "Teslim Edildi", desc: "Sipariş müşteriye ulaştığında gönderilir.", color: "bg-green-50 text-green-700" },
  { key: "order_cancelled", label: "İptal Edildi", desc: "Sipariş iptal edildiğinde gönderilir.", color: "bg-red-50 text-red-700" },
  { key: "coupon_assigned", label: "Yeni Kupon Tanımlandı", desc: "Bir üyeye indirim kuponu atandığında gönderilir.", color: "bg-amber-50 text-amber-700" },
];

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Record<string, Template>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    const { data } = await supabase
      .from("email_templates")
      .select("id, trigger, subject, is_active, updated_at");

    const map: Record<string, Template> = {};
    for (const t of data || []) map[t.trigger] = t;
    setTemplates(map);
    setLoading(false);
  }

  async function toggleActive(trigger: string, current: boolean) {
    setToggling(trigger);
    await supabase
      .from("email_templates")
      .update({ is_active: !current })
      .eq("trigger", trigger);
    setTemplates((prev) => ({
      ...prev,
      [trigger]: { ...prev[trigger], is_active: !current },
    }));
    setToggling(null);
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Email Şablonları</h2>
        <p className="text-muted-foreground">
          Sipariş durumu değiştiğinde müşterilere gönderilen email şablonlarını düzenleyin.
        </p>
      </div>

      <div className="space-y-3">
        {TRIGGERS.map(({ key, label, desc, color }) => {
          const tpl = templates[key];
          return (
            <Card key={key} className="shadow-sm border-muted">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ${color}`}>
                      {label}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 mb-0.5">
                        {tpl?.subject || <span className="text-muted-foreground italic">Konu yükleniyor...</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                      {tpl?.updated_at && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          Son düzenleme: {new Date(tpl.updated_at).toLocaleDateString("tr-TR")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => tpl && toggleActive(key, tpl.is_active)}
                      disabled={!tpl || toggling === key}
                      className="text-muted-foreground hover:text-slate-800 transition-colors disabled:opacity-40"
                      title={tpl?.is_active ? "Devre Dışı Bırak" : "Etkinleştir"}
                    >
                      {toggling === key ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : tpl?.is_active ? (
                        <ToggleRight size={24} className="text-green-600" />
                      ) : (
                        <ToggleLeft size={24} />
                      )}
                    </button>
                    <Link href={`/admin/crm/email-templates/${key}`} className={buttonVariants({ variant: "outline", size: "sm" }) + " gap-1.5"}>
                      <Edit2 size={13} /> Düzenle
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800">
        <strong>Kullanılabilir değişkenler:</strong>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{customer_name}}"}</code>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{order_id}}"}</code>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{order_total}}"}</code>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{order_date}}"}</code>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{order_items_html}}"}</code>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{shipping_address}}"}</code>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{tracking_html}}"}</code>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{store_name}}"}</code>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{store_email}}"}</code>{" "}
        <code className="bg-blue-100 px-1 rounded text-xs">{"{{store_url}}"}</code>
      </div>
    </div>
  );
}
