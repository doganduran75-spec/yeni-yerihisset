"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Edit, Trash2, Loader2, ExternalLink,
  MousePointerClick, Eye, EyeOff, Building2, Users,
} from "lucide-react";

type Opportunity = {
  id: string;
  partner_name: string;
  title: string;
  description: string | null;
  image_url: string | null;
  url: string;
  discount_code: string | null;
  valid_until: string | null;
  is_active: boolean;
  click_count: number;
  allowed_role_slugs: string[] | null;
};

type Partner = {
  id: string;
  company_name: string;
};

type Role = {
  id: string;
  name: string;
  slug: string;
};

const EMPTY: Omit<Opportunity, "id" | "click_count"> = {
  partner_name: "", title: "", description: "", image_url: "",
  url: "", discount_code: "", valid_until: "", is_active: true,
  allowed_role_slugs: [],
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: oppsData }, { data: partnersData }, { data: rolesData }] = await Promise.all([
      (supabase as any).from("partner_opportunities").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("partners").select("id, company_name").order("company_name", { ascending: true }),
      (supabase as any).from("roles").select("id, name, slug").order("name", { ascending: true }),
    ]);
    setOpps(oppsData || []);
    setPartners(partnersData || []);
    setRoles(rolesData || []);
    setLoading(false);
  }

  function openAdd() { setEditingId(null); setForm({ ...EMPTY }); setOpen(true); }
  function openEdit(o: Opportunity) {
    setEditingId(o.id);
    setForm({
      partner_name: o.partner_name, title: o.title, description: o.description || "",
      image_url: o.image_url || "", url: o.url, discount_code: o.discount_code || "",
      valid_until: o.valid_until || "", is_active: o.is_active,
      allowed_role_slugs: o.allowed_role_slugs || [],
    });
    setOpen(true);
  }

  function toggleRoleSlug(slug: string) {
    const current = form.allowed_role_slugs || [];
    const updated = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug];
    setForm({ ...form, allowed_role_slugs: updated });
  }

  async function handleSave() {
    if (!form.partner_name || !form.title || !form.url) {
      alert("İş ortağı adı, başlık ve URL zorunlu.");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      valid_until: form.valid_until || null,
      discount_code: form.discount_code || null,
      image_url: form.image_url || null,
      description: form.description || null,
      allowed_role_slugs: form.allowed_role_slugs?.length ? form.allowed_role_slugs : [],
      updated_at: new Date().toISOString(),
    };
    if (editingId) {
      await (supabase as any).from("partner_opportunities").update(payload).eq("id", editingId);
    } else {
      await (supabase as any).from("partner_opportunities").insert(payload);
    }
    setSaving(false);
    setOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu fırsatı silmek istediğinize emin misiniz?")) return;
    await (supabase as any).from("partner_opportunities").delete().eq("id", id);
    load();
  }

  async function toggleActive(o: Opportunity) {
    await (supabase as any).from("partner_opportunities").update({ is_active: !o.is_active }).eq("id", o.id);
    setOpps((prev) => prev.map((x) => x.id === o.id ? { ...x, is_active: !x.is_active } : x));
  }

  function getRoleName(slug: string) {
    return roles.find((r) => r.slug === slug)?.name || slug;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">İş Ortağı Fırsatları</h2>
          <p className="text-muted-foreground">
            Ortaklarınızdan gelen fırsatları yönetin. Her tıklama otomatik sayılır.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus size={16} /> Yeni Fırsat
        </Button>
      </div>

      {/* İstatistik özeti */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Toplam Fırsat", value: opps.length, icon: Building2, color: "text-slate-600" },
          { label: "Aktif", value: opps.filter((o) => o.is_active).length, icon: Eye, color: "text-green-600" },
          { label: "Pasif", value: opps.filter((o) => !o.is_active).length, icon: EyeOff, color: "text-slate-400" },
          { label: "Toplam Tıklama", value: opps.reduce((s, o) => s + o.click_count, 0), icon: MousePointerClick, color: "text-olive-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="flex items-center gap-3 pt-5 pb-5">
              <Icon size={20} className={color} />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fırsat listesi */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
        </div>
      ) : opps.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed rounded-xl border-slate-200 text-slate-400">
          Henüz fırsat eklenmemiş.
        </div>
      ) : (
        <div className="space-y-3">
          {opps.map((o) => (
            <Card key={o.id} className={`shadow-sm transition-opacity ${!o.is_active ? "opacity-50" : ""}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Görsel */}
                    {o.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.image_url} alt={o.partner_name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-slate-100" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-olive-50 flex items-center justify-center flex-shrink-0">
                        <Building2 size={22} className="text-olive-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-olive-600 bg-olive-50 px-2 py-0.5 rounded">
                          {o.partner_name}
                        </span>
                        {!o.is_active && <Badge variant="secondary" className="text-[10px]">Pasif</Badge>}
                        {o.valid_until && new Date(o.valid_until) < new Date() && (
                          <Badge variant="destructive" className="text-[10px]">Süresi Doldu</Badge>
                        )}
                        {/* Rol rozetleri */}
                        {o.allowed_role_slugs && o.allowed_role_slugs.length > 0 ? (
                          o.allowed_role_slugs.map((slug) => (
                            <span key={slug} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                              <Users size={10} />
                              {getRoleName(slug)}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Users size={10} /> Herkese açık
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-slate-900 truncate">{o.title}</h3>
                      {o.description && <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{o.description}</p>}
                      <div className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1 text-xs text-olive-600 font-bold">
                          <MousePointerClick size={12} /> {o.click_count} tıklama
                        </span>
                        {o.discount_code && (
                          <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            {o.discount_code}
                          </span>
                        )}
                        {o.valid_until && (
                          <span className="text-xs text-slate-400">
                            Son: {new Date(o.valid_until).toLocaleDateString("tr-TR")}
                          </span>
                        )}
                      </div>
                      {/* Takip linki */}
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                        <span>Takip linki:</span>
                        <code className="bg-slate-50 px-1.5 py-0.5 rounded text-slate-600 select-all">
                          {SITE_URL}/api/opportunity/{o.id}
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* Aksiyonlar */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Linki Aç"
                      onClick={() => window.open(`/api/opportunity/${o.id}`, "_blank")}>
                      <ExternalLink size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title={o.is_active ? "Pasife Al" : "Aktive Et"}
                      onClick={() => toggleActive(o)}>
                      {o.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(o)}>
                      <Edit size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(o.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Modal */}
      <Dialog open={open} onOpenChange={setOpen} disablePointerDismissal>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Fırsatı Düzenle" : "Yeni Fırsat Ekle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">İş Ortağı Adı *</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.partner_name}
                  onChange={(e) => setForm({ ...form, partner_name: e.target.value })}
                >
                  <option value="">— Seçiniz —</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.company_name}>{p.company_name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fırsat Başlığı *</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn: %20 İndirim Kuponu" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Açıklama</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[70px] focus:outline-none"
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Fırsat hakkında kısa açıklama..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Hedef URL *</label>
                <Input value={form.url ?? ""} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://partner.com/indirim" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Kupon Kodu</label>
                <Input value={form.discount_code ?? ""} onChange={(e) => setForm({ ...form, discount_code: e.target.value })} placeholder="YERIHISSET20" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Görsel URL</label>
                <Input value={form.image_url ?? ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Son Geçerlilik Tarihi</label>
                <Input type="date" value={form.valid_until ?? ""} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
              </div>
            </div>

            {/* Roller — Tanımlar > Roller altından besleniyor */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Users size={14} className="text-indigo-500" />
                Erişim Rolleri
              </label>
              <p className="text-xs text-slate-400">
                Seçili roller bu fırsata erişebilir. Hiçbiri seçilmezse fırsat herkese açık olur.
              </p>
              {roles.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Tanımlar &gt; Roller kısmından rol ekleyebilirsiniz.</p>
              ) : (
                <div className="flex flex-wrap gap-2 p-3 rounded-md border border-input bg-background">
                  {roles.map((role) => {
                    const checked = (form.allowed_role_slugs || []).includes(role.slug);
                    return (
                      <label
                        key={role.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-sm transition-colors select-none ${
                          checked
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={() => toggleRoleSlug(role.slug)}
                        />
                        {checked && <span className="text-indigo-500 text-xs">✓</span>}
                        {role.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
              <label htmlFor="is_active" className="text-sm font-medium cursor-pointer">Aktif (sitede görünsün)</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              {editingId ? "Güncelle" : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
