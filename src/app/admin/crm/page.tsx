"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Mail, Smartphone, CheckCircle, XCircle, MinusCircle, ArrowRight, Loader2 } from "lucide-react";

type LogEntry = {
  id: string;
  created_at: string;
  trigger: string | null;
  channel: string | null;
  status: string | null;
  recipient: string | null;
  error_message: string | null;
  order_id: string | null;
};

const triggerLabels: Record<string, string> = {
  order_placed: "Sipariş Alındı",
  order_paid: "Ödeme Onaylandı",
  order_shipped: "Kargoya Verildi",
  order_delivered: "Teslim Edildi",
  order_cancelled: "İptal Edildi",
};

function StatusBadge({ status }: { status: string | null }) {
  if (status === "sent") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 ring-1 ring-green-200 px-2 py-0.5 rounded-md">
      <CheckCircle size={11} /> Gönderildi
    </span>
  );
  if (status === "failed") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 ring-1 ring-red-200 px-2 py-0.5 rounded-md">
      <XCircle size={11} /> Başarısız
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 ring-1 ring-slate-200 px-2 py-0.5 rounded-md">
      <MinusCircle size={11} /> Atlandı
    </span>
  );
}

function ChannelIcon({ channel }: { channel: string | null }) {
  if (channel === "push") return <Smartphone size={14} className="text-purple-500" />;
  if (channel === "email") return <Mail size={14} className="text-blue-500" />;
  return <MinusCircle size={14} className="text-slate-400" />;
}

export default function CrmPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ sent: 0, failed: 0, push: 0, email: 0 });

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      const { data } = await supabase
        .from("notification_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      const entries = data || [];
      setLogs(entries);
      setStats({
        sent: entries.filter((e) => e.status === "sent").length,
        failed: entries.filter((e) => e.status === "failed").length,
        push: entries.filter((e) => e.channel === "push").length,
        email: entries.filter((e) => e.channel === "email").length,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Müşteri İletişim</h2>
          <p className="text-muted-foreground">Bildirim şablonları ve gönderim geçmişi.</p>
        </div>
        <Link href="/admin/crm/email-templates" className={buttonVariants({ variant: "default" }) + " gap-2"}>
          <Mail size={16} /> Email Şablonları <ArrowRight size={16} />
        </Link>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Gönderilen", value: stats.sent, icon: CheckCircle, color: "text-green-600" },
          { label: "Başarısız", value: stats.failed, icon: XCircle, color: "text-red-500" },
          { label: "Email", value: stats.email, icon: Mail, color: "text-blue-500" },
          { label: "Push", value: stats.push, icon: Smartphone, color: "text-purple-500" },
        ].map((s) => (
          <Card key={s.label} className="shadow-sm border-muted">
            <CardContent className="p-5 flex items-center gap-4">
              <s.icon size={28} className={s.color} />
              <div>
                <p className="text-2xl font-black">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Log tablosu */}
      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle>Gönderim Geçmişi</CardTitle>
          <CardDescription>Son 100 bildirim kaydı.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground border border-dashed rounded-lg">
              Henüz bildirim gönderilmemiş.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Tarih</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Tetikleyici</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Kanal</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Alıcı</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Durum</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Hata</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("tr-TR")}
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        {triggerLabels[log.trigger ?? ""] || log.trigger || "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1">
                          <ChannelIcon channel={log.channel} />
                          <span className="text-xs capitalize">{log.channel || "-"}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground max-w-[160px] truncate">
                        {log.recipient || "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="py-2.5 px-3 text-xs text-red-500 max-w-[200px] truncate">
                        {log.error_message || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
