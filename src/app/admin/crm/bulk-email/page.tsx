"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Send, Loader2, Users, Tag, Mail, CheckCircle2, AlertCircle,
  BarChart2, RefreshCw, UserCheck, UserX, Filter, Square,
} from "lucide-react";
import RichTextEditor from "@/components/admin/RichTextEditor";

type TagGroup = { id: string; name: string; options: { id: string; value: string }[] };
type Campaign = { id: string; campaign_slug: string; subject: string; recipient_count: number; sent_at: string; status?: string };
type Member = { id: string; firstName: string; lastName: string; email: string; lastEmailAt: string | null };

type QueueProgress = {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  done: boolean;
  errors: string[];
};

// Kaç gün önce formatı
function daysAgo(dateStr: string | null): { label: string; days: number } {
  if (!dateStr) return { label: "—", days: Infinity };
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (diff === 0) return { label: "Bugün", days: 0 };
  if (diff === 1) return { label: "Dün", days: 1 };
  return { label: `${diff} gün önce`, days: diff };
}

export default function BulkEmailPage() {
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // Kuyruk/ilerleme state
  const [progress, setProgress] = useState<QueueProgress | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);

  // Alıcı listesi state
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [dayFilter, setDayFilter] = useState(3);

  const [form, setForm] = useState({
    campaign: "",
    subject: "",
    html_body: "",
    recipient_type: "all" as "all" | "tag",
    tag_option_id: "",
  });

  useEffect(() => {
    async function load() {
      const [{ data: tg }, { data: c }] = await Promise.all([
        supabase.from("member_tag_groups").select("id, name, member_tag_options(id, value)").order("name"),
        (supabase as any).from("email_campaigns")
          .select("id, campaign_slug, subject, recipient_count, sent_at, status")
          .order("sent_at", { ascending: false }).limit(20),
      ]);
      setTagGroups((tg || []).map((g: any) => ({ id: g.id, name: g.name, options: g.member_tag_options || [] })));
      setCampaigns((c as any) || []);
      setLoading(false);
    }
    load();
  }, []);

  // Polling: sıradaki batch'i işle
  async function startPolling(campaignId: string, total: number, token: string) {
    stoppingRef.current = false;

    const processBatch = async () => {
      if (stoppingRef.current) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        return;
      }

      try {
        const res = await fetch("/api/crm/process-queue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ campaignId, batchSize: 5 }),
        });
        const data = await res.json();

        if (data.cancelled) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setSending(false);
          return;
        }

        setProgress((prev) => {
          const prevSent = prev?.sent ?? 0;
          const prevFailed = prev?.failed ?? 0;
          const newSent = prevSent + (data.sent ?? 0);
          const newFailed = prevFailed + (data.failed ?? 0);
          const errors = [...(prev?.errors ?? []), ...(data.errors ?? [])];
          return {
            campaignId,
            total,
            sent: newSent,
            failed: newFailed,
            remaining: data.remaining ?? 0,
            done: data.done ?? false,
            errors,
          };
        });

        if (data.done) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setSending(false);
          // Kampanyaları yenile
          const { data: newC } = await (supabase as any).from("email_campaigns")
            .select("id, campaign_slug, subject, recipient_count, sent_at, status")
            .order("sent_at", { ascending: false }).limit(20);
          setCampaigns((newC as any) || []);
        }
      } catch {
        // Hata durumunda polling devam eder
      }
    };

    // İlk batch hemen başlasın
    await processBatch();

    // Sonrakiler her 4 saniyede bir
    pollingRef.current = setInterval(processBatch, 4000);
  }

  async function stopCampaign() {
    if (!progress?.campaignId) return;
    stoppingRef.current = true;
    if (pollingRef.current) clearInterval(pollingRef.current);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/crm/process-queue", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ campaignId: progress.campaignId }),
      });
    } catch {}

    setSending(false);
    setProgress((prev) => prev ? { ...prev, done: true } : prev);
  }

  // Grup değişince listeyi sıfırla
  useEffect(() => {
    setMembers([]);
    setSelectedIds(new Set());
    setMembersLoaded(false);
    setShowPreview(false);
  }, [form.recipient_type, form.tag_option_id]);

  async function loadMembers() {
    setMembersLoading(true);
    setMembersLoaded(false);
    setShowPreview(false);
    try {
      let profiles: { id: string; first_name: string; last_name: string; email: string }[] = [];

      if (form.recipient_type === "all") {
        const { data } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .not("email", "is", null)
          .neq("email", "");
        profiles = (data as any) || [];
      } else if (form.recipient_type === "tag" && form.tag_option_id) {
        const { data } = await (supabase as any)
          .from("user_tags")
          .select("profiles(id, first_name, last_name, email)")
          .eq("tag_option_id", form.tag_option_id);
        profiles = ((data as any) || [])
          .map((d: any) => d.profiles)
          .filter((p: any) => p && p.email);
      }

      // Son email tarihlerini iki kaynaktan birleştir:
      // 1) notification_log  → sipariş/sistem mailleri
      // 2) email_queue       → toplu kampanya mailleri
      const userIds = profiles.map((p) => p.id);
      const emailList = profiles.map((p) => p.email).filter(Boolean);

      // email → user_id eşlemesi (email_queue email bazlı çalışır)
      const emailToUserId: Record<string, string> = {};
      profiles.forEach((p) => { if (p.email) emailToUserId[p.email] = p.id; });

      // user_id → en son email tarihi
      const lastEmailMap: Record<string, string> = {};

      // 1. notification_log (sipariş mailleri)
      if (userIds.length > 0) {
        const { data: logs } = await (supabase as any)
          .from("notification_log")
          .select("user_id, created_at")
          .in("user_id", userIds)
          .eq("channel", "email")
          .eq("status", "sent")
          .order("created_at", { ascending: false });

        ((logs as any[]) || []).forEach((log: any) => {
          if (!lastEmailMap[log.user_id]) lastEmailMap[log.user_id] = log.created_at;
        });
      }

      // 2. email_queue (toplu kampanya mailleri)
      if (emailList.length > 0) {
        const { data: queueLogs } = await (supabase as any)
          .from("email_queue")
          .select("recipient_email, sent_at")
          .in("recipient_email", emailList)
          .eq("status", "sent")
          .order("sent_at", { ascending: false });

        ((queueLogs as any[]) || []).forEach((row: any) => {
          const uid = emailToUserId[row.recipient_email];
          if (!uid || !row.sent_at) return;
          // İki kaynaktan en güncel tarihi al
          if (!lastEmailMap[uid] || row.sent_at > lastEmailMap[uid]) {
            lastEmailMap[uid] = row.sent_at;
          }
        });
      }

      const list: Member[] = profiles.map((p) => ({
        id: p.id,
        firstName: p.first_name || "",
        lastName: p.last_name || "",
        email: p.email || "",
        lastEmailAt: lastEmailMap[p.id] ?? null,
      }));

      setMembers(list);
      setSelectedIds(new Set(list.map((m) => m.id)));
      setMembersLoaded(true);
    } finally {
      setMembersLoading(false);
    }
  }

  // dayFilter gün içinde email gönderilenleri otomatik deselect
  function autoDeselect() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dayFilter);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      members.forEach((m) => {
        if (m.lastEmailAt && new Date(m.lastEmailAt) > cutoff) next.delete(m.id);
      });
      return next;
    });
  }

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedIds(new Set(members.map((m) => m.id))); }
  function deselectAll() { setSelectedIds(new Set()); }

  // Önizleme için seçili üyeler
  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.has(m.id)),
    [members, selectedIds]
  );

  async function handleSend() {
    if (!form.campaign || !form.subject || !form.html_body) {
      alert("Kampanya adı, konu ve içerik zorunlu.");
      return;
    }
    if (membersLoaded && selectedMembers.length === 0) {
      alert("Gönderilecek alıcı seçilmedi.");
      return;
    }
    setSending(true);
    setProgress(null);
    stoppingRef.current = false;

    try {
      const body: any = {
        campaign: form.campaign.toLowerCase().replace(/\s+/g, "-"),
        subject: form.subject,
        html_body: form.html_body,
      };

      if (membersLoaded) {
        body.recipient_type = "manual";
        body.emails = selectedMembers.map((m) => m.email);
      } else {
        body.recipient_type = form.recipient_type;
        if (form.recipient_type === "tag") body.tag_option_id = form.tag_option_id;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/crm/bulk-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.ok) {
        // Kuyruğa alındı — ilerleme başlat
        setProgress({
          campaignId: data.campaignId,
          total: data.total,
          sent: 0,
          failed: 0,
          remaining: data.total,
          done: false,
          errors: [],
        });
        await startPolling(data.campaignId, data.total, session?.access_token ?? "");
      } else {
        alert(data.error || "Kuyruğa alma başarısız.");
        setSending(false);
      }
    } catch {
      alert("Gönderim sırasında hata oluştu.");
      setSending(false);
    }
  }

  if (loading) return (
    <div className="flex h-[400px] items-center justify-center">
      <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Toplu Email Gönderimi</h2>
        <p className="text-muted-foreground">
          Üyelerinize kampanya emaili gönderin. Her link otomatik UTM takip parametresi alır.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sol: Form */}
        <div className="lg:col-span-2 space-y-5">

          {/* Kampanya Bilgileri */}
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
                    <span className="ml-1 text-[10px] text-slate-400 font-normal">(utm_campaign)</span>
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
            </CardContent>
          </Card>

          {/* Alıcı Grubu */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users size={16} /> Alıcı Grubu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: "all", label: "Tüm Üyeler", icon: Users },
                  { value: "tag", label: "Etikete Göre", icon: Tag },
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  value={form.tag_option_id}
                  onChange={(e) => setForm({ ...form, tag_option_id: e.target.value })}
                >
                  <option value="">Etiket Seçin...</option>
                  {tagGroups.map((g) =>
                    g.options.map((o) => (
                      <option key={o.id} value={o.id}>{g.name}: {o.value}</option>
                    ))
                  )}
                </select>
              )}

              <Button
                variant="outline"
                className="gap-2"
                disabled={membersLoading || (form.recipient_type === "tag" && !form.tag_option_id)}
                onClick={loadMembers}
              >
                {membersLoading
                  ? <><Loader2 size={14} className="animate-spin" /> Yükleniyor…</>
                  : <><RefreshCw size={14} /> Üyeleri Yükle</>}
              </Button>

              {/* Üye listesi */}
              {membersLoaded && (
                <div className="space-y-3">
                  {/* Araç çubuğu */}
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-lg border">
                    <span className="text-sm font-semibold text-slate-700">
                      {members.length} üye yüklendi
                    </span>
                    <div className="flex gap-1 ml-auto">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={selectAll}>
                        <UserCheck size={12} /> Tümünü Seç
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={deselectAll}>
                        <UserX size={12} /> Tümünü Kaldır
                      </Button>
                    </div>
                  </div>

                  {/* Günlük filtre */}
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Filter size={14} className="text-amber-600 shrink-0" />
                    <span className="text-sm text-amber-800 font-medium">Son</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={dayFilter}
                      onChange={(e) => setDayFilter(Number(e.target.value))}
                      className="w-14 h-7 text-sm text-center border border-amber-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <span className="text-sm text-amber-800 font-medium">gün içinde email gönderilenleri deselect et</span>
                    <Button size="sm" className="h-7 text-xs ml-auto bg-amber-500 hover:bg-amber-600 gap-1" onClick={autoDeselect}>
                      <Filter size={11} /> Uygula
                    </Button>
                  </div>

                  {/* Tablo */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="w-10 px-3 py-2 text-left">
                              <input
                                type="checkbox"
                                checked={selectedIds.size === members.length && members.length > 0}
                                onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                                className="rounded"
                              />
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-xs text-slate-500">Ad Soyad</th>
                            <th className="px-3 py-2 text-left font-semibold text-xs text-slate-500">Email</th>
                            <th className="px-3 py-2 text-left font-semibold text-xs text-slate-500 w-32">Son Email</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {members.map((m) => {
                            const { label, days } = daysAgo(m.lastEmailAt);
                            const isSelected = selectedIds.has(m.id);
                            const isRecent = days < dayFilter;
                            return (
                              <tr
                                key={m.id}
                                onClick={() => toggleMember(m.id)}
                                className={`cursor-pointer transition-colors ${isSelected ? "bg-white hover:bg-slate-50" : "bg-slate-50/80 text-slate-400 hover:bg-slate-100"}`}
                              >
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="rounded pointer-events-none"
                                  />
                                </td>
                                <td className="px-3 py-2 font-medium text-slate-800">
                                  {m.firstName} {m.lastName}
                                </td>
                                <td className="px-3 py-2 text-slate-500 font-mono text-xs">{m.email}</td>
                                <td className="px-3 py-2">
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                    m.lastEmailAt === null ? "text-slate-400" :
                                    isRecent ? "bg-red-50 text-red-600" :
                                    days < 14 ? "bg-amber-50 text-amber-600" :
                                    "bg-green-50 text-green-600"
                                  }`}>
                                    {label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Alt özet */}
                    <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        <span className="font-semibold text-slate-700">{selectedIds.size}</span> / {members.length} üye seçili
                      </span>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1 bg-olive-600 hover:bg-olive-700"
                        disabled={selectedIds.size === 0}
                        onClick={() => setShowPreview(true)}
                      >
                        <CheckCircle2 size={12} /> Alıcı Listesi Oluştur
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Alıcı listesi önizleme */}
              {showPreview && selectedMembers.length > 0 && (
                <div className="border border-olive-200 rounded-lg overflow-hidden">
                  <div className="bg-olive-50 px-3 py-2 flex items-center justify-between border-b border-olive-200">
                    <span className="text-sm font-bold text-olive-800">
                      ✅ Alıcı Listesi — {selectedMembers.length} kişiye gönderilecek
                    </span>
                    <button
                      onClick={() => setShowPreview(false)}
                      className="text-xs text-olive-600 hover:text-olive-800 underline"
                    >
                      Düzenle
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y">
                    {selectedMembers.map((m) => (
                      <div key={m.id} className="px-3 py-1.5 flex items-center justify-between">
                        <span className="text-sm font-medium">{m.firstName} {m.lastName}</span>
                        <span className="text-xs font-mono text-slate-400">{m.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email İçeriği */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email İçeriği</CardTitle>
            </CardHeader>
            <CardContent>
              <RichTextEditor
                value={form.html_body}
                onChange={(html) => setForm({ ...form, html_body: html })}
                placeholder="Email içeriğini buraya yazın…"
                minHeight={280}
              />
            </CardContent>
          </Card>

          {/* İlerleme paneli */}
          {progress && (
            <div className="border rounded-xl overflow-hidden">
              <div className={`px-4 py-3 flex items-center justify-between ${
                progress.done ? (progress.failed > 0 ? "bg-amber-50 border-b border-amber-100" : "bg-green-50 border-b border-green-100") : "bg-slate-50 border-b"
              }`}>
                <div className="flex items-center gap-2">
                  {progress.done ? (
                    progress.failed > 0
                      ? <AlertCircle size={16} className="text-amber-600" />
                      : <CheckCircle2 size={16} className="text-green-600" />
                  ) : (
                    <Loader2 size={16} className="animate-spin text-olive-600" />
                  )}
                  <span className="text-sm font-semibold text-slate-800">
                    {progress.done
                      ? (stoppingRef.current ? "Gönderim durduruldu" : "Gönderim tamamlandı")
                      : `Gönderiliyor… (${progress.remaining} kaldı)`}
                  </span>
                </div>
                {!progress.done && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50"
                    onClick={stopCampaign}
                  >
                    <Square size={11} /> Durdur
                  </Button>
                )}
              </div>

              {/* Progress bar */}
              <div className="px-4 pt-3 pb-1">
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      progress.failed > 0 ? "bg-amber-400" : "bg-olive-500"
                    }`}
                    style={{
                      width: progress.total > 0
                        ? `${Math.round(((progress.sent + progress.failed) / progress.total) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>

              {/* Sayılar */}
              <div className="px-4 py-3 flex items-center gap-6 text-sm">
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle2 size={14} />
                  <span className="font-semibold">{progress.sent}</span>
                  <span className="text-slate-400">gönderildi</span>
                </div>
                {progress.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-red-500">
                    <AlertCircle size={14} />
                    <span className="font-semibold">{progress.failed}</span>
                    <span className="text-slate-400">başarısız</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-slate-500 ml-auto">
                  <span className="font-semibold">{progress.sent + progress.failed}</span>
                  <span>/ {progress.total} toplam</span>
                </div>
              </div>

              {/* Hata detayları */}
              {progress.errors.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1 max-h-28 overflow-y-auto">
                    <p className="text-xs font-bold text-red-700 sticky top-0 bg-red-50">Hata Detayları ({progress.errors.length}):</p>
                    {progress.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-600 font-mono break-all">{e}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end">
            <Button
              onClick={handleSend}
              disabled={sending}
              className="gap-2 bg-olive-600 hover:bg-olive-700"
            >
              {sending
                ? <><Loader2 size={16} className="animate-spin" /> Kuyruğa alınıyor…</>
                : <><Send size={16} /> {membersLoaded ? `${selectedMembers.length} Kişiye Gönder` : "Gönder"}</>}
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
                      <span className="text-[10px] text-slate-400">{c.recipient_count} kişi</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[10px] text-slate-400">
                        {new Date(c.sent_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                      {c.status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          c.status === "sent" ? "bg-green-50 text-green-600" :
                          c.status === "sending" ? "bg-blue-50 text-blue-600" :
                          c.status === "queued" ? "bg-amber-50 text-amber-600" :
                          c.status === "partial" ? "bg-orange-50 text-orange-600" :
                          c.status === "cancelled" ? "bg-slate-100 text-slate-500" :
                          "bg-slate-50 text-slate-400"
                        }`}>
                          {c.status === "sent" ? "✓ Gönderildi" :
                           c.status === "sending" ? "⏳ Gönderiliyor" :
                           c.status === "queued" ? "🕐 Kuyrukta" :
                           c.status === "partial" ? "⚠ Kısmi" :
                           c.status === "cancelled" ? "✕ İptal" :
                           c.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-50 border-slate-100">
            <CardContent className="pt-4 pb-4 space-y-2">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Renk Kılavuzu</p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium text-[10px]">3 gün önce</span>
                  <span className="text-slate-500">Yakın zamanda email aldı</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium text-[10px]">10 gün önce</span>
                  <span className="text-slate-500">Son 2 haftada email aldı</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium text-[10px]">20 gün önce</span>
                  <span className="text-slate-500">Gönderim için uygun</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[10px]">—</span>
                  <span className="text-slate-500">Hiç email gönderilmedi</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-olive-50 border-olive-100">
            <CardContent className="pt-4 pb-4 space-y-2">
              <p className="text-xs font-bold text-olive-700 uppercase tracking-wide">UTM Takibi</p>
              <code className="text-[10px] bg-white text-olive-800 px-2 py-1 rounded block leading-5">
                utm_source=newsletter<br />
                utm_medium=email<br />
                utm_campaign=<em>kampanya-adi</em>
              </code>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
