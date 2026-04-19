"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Send, Loader2, Users, Tag, Mail, CheckCircle2, AlertCircle, BarChart2
} from "lucide-react";
import RichTextEditor from "@/components/admin/RichTextEditor";

type TagGroup = { id: string; name: string; options: { id: string; value: string }[] };
type Campaign = {
  id: string; campaign_slug: string; subject: string;
  recipient_count: number; sent_at: string;
};

export default function BulkEmailPage() {
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const [form, setForm] = useState({
    campaign: "",
    subject: "",
    html_body: "",
    recipient_type: "all" as "all" | "tag" | "manual",
    tag_option_id: "",
    manual_emails: "",
  });

  useEffect(() => {
    async function load() {
      const [{ data: tg }, { data: c }] = await Promise.all([
        supabase.from("member_tag_groups").select("id, name, member_tag_options(id, value)").order("name"),
        (supabase as any).from("email_campaigns").select("id, campaign_slug, subject, recipient_count, sent_at").order("sent_at", { ascending: false }).limit(20),
      ]);
      setTagGroups((tg || []).map((g: any) => ({ id: g.id, name: g.name, options: g.member_tag_options || [] })));
      setCampaigns((c as any) || []);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSend() {
    if (!form.campaign || !form.subject || !form.html_body) {
      alert("Kampanya adı, konu ve içerik zorunlu.");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const body: any = {
        campaign: form.campaign.toLowerCase().replace(/\s+/g, "-"),
        subject: form.subject,
        html_body: form.html_body,
        recipient_type: form.recipient_type,
      };
      if (form.recipient_type === "tag") body.tag_option_id = form.tag_option_id;
      if (form.recipient_type === "manual") {
        body.emails = form.manual_emails.split(/[\n,;]/).map((e) => e.trim()).filter(Boolean);
      }

      const res = await fetch("/api/crm/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ sent: data.sent, failed: data.failed, total: data.total });
        // Kampanya listesini güncelle
        const { data: newC } = await (supabase as any).from("email_campaigns")
          .select("id, campaign_slug, subject, recipient_count, sent_at")
          .order("sent_at", { ascending: false }).limit(20);
        setCampaigns((newC as any) || []);
      } else {
        alert(data.error || "Gönderim başarısız.");
      }
    } catch (e) {
      alert("Gönderim sırasında hata oluştu.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return (
    <div className="flex h-[400px] items-center justify-center">
      <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Toplu Email Gönderimi</h2>
        <p className="text-muted-foreground">
          Üyelerinize kampanya emaili gönderin. Her link otomatik UTM takip parametresi alır.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sol: Form */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail size={16} /> Kampanya Bilgileri
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Kampanya Adı
                    <span className="ml-1 text-[10px] text-slate-400 font-normal">(utm_campaign değeri)</span>
                  </label>
                  <Input
                    placeholder="örn: yeni-urun-mayis-2026"
                    value={form.campaign}
                    onChange={(e) => setForm({ ...form, campaign: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Konusu</label>
                  <Input
                    placeholder="Yeni Koleksiyon Geldi! 🎉"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  />
                </div>
              </div>

              {/* Alıcı tipi */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Alıcı Grubu</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: "all", label: "Tüm Üyeler", icon: Users },
                    { value: "tag", label: "Etikete Göre", icon: Tag },
                    { value: "manual", label: "Manuel Liste", icon: Mail },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, recipient_type: value as any })}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                        form.recipient_type === value
                          ? "bg-olive-600 text-white border-olive-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-olive-300"
                      }`}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>

                {form.recipient_type === "tag" && (
                  <select
                    className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                    value={form.tag_option_id}
                    onChange={(e) => setForm({ ...form, tag_option_id: e.target.value })}
                  >
                    <option value="">Etiket Seçin...</option>
                    {tagGroups.map((g) =>
                      g.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {g.name}: {o.value}
                        </option>
                      ))
                    )}
                  </select>
                )}

                {form.recipient_type === "manual" && (
                  <textarea
                    className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus:outline-none"
                    placeholder="Email adreslerini virgül, noktalı virgül veya yeni satırla ayırın..."
                    value={form.manual_emails}
                    onChange={(e) => setForm({ ...form, manual_emails: e.target.value })}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email İçeriği</CardTitle>
            </CardHeader>
            <CardContent>
              <RichTextEditor
                value={form.html_body}
                onChange={(html) => setForm({ ...form, html_body: html })}
                placeholder="Email içeriğini buraya yazın. Eklediğiniz her link otomatik olarak utm_source=newsletter&utm_medium=email&utm_campaign=... parametresi alır."
                minHeight={280}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            {result && (
              <div className={`flex items-center gap-2 text-sm font-medium ${result.failed > 0 ? "text-amber-600" : "text-green-600"}`}>
                {result.failed > 0
                  ? <AlertCircle size={16} />
                  : <CheckCircle2 size={16} />}
                {result.sent} başarılı, {result.failed} başarısız / {result.total} toplam
              </div>
            )}
            <Button
              onClick={handleSend}
              disabled={sending}
              className="ml-auto gap-2 bg-olive-600 hover:bg-olive-700"
            >
              {sending
                ? <><Loader2 size={16} className="animate-spin" /> Gönderiliyor...</>
                : <><Send size={16} /> Gönder</>}
            </Button>
          </div>
        </div>

        {/* Sağ: Geçmiş kampanyalar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 size={16} /> Önceki Kampanyalar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz kampanya gönderilmemiş.</p>
              ) : (
                campaigns.map((c) => (
                  <div key={c.id} className="border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.subject}</p>
                    <div className="flex items-center justify-between mt-1">
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {c.campaign_slug}
                      </Badge>
                      <span className="text-[10px] text-slate-400">
                        {c.recipient_count} kişi
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(c.sent_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-olive-50 border-olive-100">
            <CardContent className="pt-4 pb-4 space-y-2">
              <p className="text-xs font-bold text-olive-700 uppercase tracking-wide">UTM Takibi</p>
              <p className="text-xs text-olive-600 leading-relaxed">
                Her emaildeki link otomatik olarak şu parametreleri alır:
              </p>
              <code className="text-[10px] bg-white text-olive-800 px-2 py-1 rounded block leading-5">
                utm_source=newsletter<br />
                utm_medium=email<br />
                utm_campaign=<em>kampanya-adi</em>
              </code>
              <p className="text-xs text-olive-600 leading-relaxed">
                GA4 → Acquisition → Traffic Acquisition'dan kampanya bazlı ziyaretçi ve satışları görebilirsiniz.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
