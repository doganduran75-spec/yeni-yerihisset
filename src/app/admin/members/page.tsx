"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Search, Mail, Phone, AtSign, Loader2, UserCog, Tags, X, Plus, UserPlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* -- Tipler ------------------------------------------- */
type Role = { id: string; name: string; slug: string };
type TagOption = { id: string; value: string; group_id: string };
type TagGroup = { id: string; name: string; options: TagOption[] };

type Member = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city: string | null;
  created_at: string;
  roleIds: string[];
  tagOptionIds: string[];
};

type Contact = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  instagram_handle: string | null;
  shoe_size: string | null;
  source_channel: string;
  status: string;
  note: string | null;
  created_at: string;
};

const SOURCE_LABELS: Record<string, string> = {
  email: "E-posta", instagram: "Instagram", whatsapp: "WhatsApp", phone: "Telefon",
  in_person: "Yüz yüze", lead_magnet: "Kampanya", stock_notify: "Stok bildirimi", other: "Diğer",
};

const ROLE_COLORS: Record<string, string> = {
  admin:     "bg-purple-100 text-purple-700 border-purple-200",
  uye:       "bg-slate-100 text-slate-700 border-slate-200",
  musteri:   "bg-green-100 text-green-700 border-green-200",
  affiliate: "bg-blue-100 text-blue-700 border-blue-200",
};
function roleColor(slug: string) {
  return ROLE_COLORS[slug] ?? "bg-amber-100 text-amber-700 border-amber-200";
}

const EMPTY_CONTACT = {
  full_name: "", email: "", phone: "", instagram_handle: "", shoe_size: "",
  source_channel: "instagram", status: "lead", note: "",
};

export default function MembersPage() {
  const router = useRouter();
  const [members, setMembers]     = useState<Member[]>([]);
  const [contacts, setContacts]   = useState<Contact[]>([]);
  const [allRoles, setAllRoles]   = useState<Role[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [kind, setKind]           = useState<"all" | "member" | "contact">("all");

  // Üye rol/etiket dialog
  const [editing, setEditing]   = useState<Member | null>(null);
  const [saving, setSaving]     = useState(false);
  const [draftRoleIds, setDraftRoleIds]           = useState<string[]>([]);
  const [draftTagOptionIds, setDraftTagOptionIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch]                 = useState("");

  // Kişi ekle/düzenle dialog
  const [contactOpen, setContactOpen] = useState(false);
  const [contactId, setContactId]     = useState<string | null>(null);
  const [cForm, setCForm]             = useState({ ...EMPTY_CONTACT });
  const [cSaving, setCSaving]         = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [profilesRes, rolesRes, tagGroupsRes, userRolesRes, userTagsRes, contactsRes] = await Promise.all([
      supabase.from("profiles").select("id, email, first_name, last_name, phone, city, created_at").order("created_at", { ascending: false }),
      supabase.from("roles").select("id, name, slug").order("name"),
      supabase.from("member_tag_groups").select("id, name, member_tag_options(id, group_id, value)").order("created_at"),
      supabase.from("user_roles").select("user_id, role_id"),
      supabase.from("user_tags").select("user_id, tag_option_id"),
      (supabase as any).from("contacts").select("*").is("linked_user_id", null).order("created_at", { ascending: false }),
    ]);

    const profiles  = profilesRes.data  || [];
    const roles     = rolesRes.data     || [];
    const rawGroups = tagGroupsRes.data || [];
    const userRoles = userRolesRes.data || [];
    const userTags  = userTagsRes.data  || [];

    const roleMap = new Map<string, string[]>();
    const tagMap  = new Map<string, string[]>();
    userRoles.forEach((r: any) => roleMap.set(r.user_id, [...(roleMap.get(r.user_id) || []), r.role_id]));
    userTags.forEach((t: any) => tagMap.set(t.user_id, [...(tagMap.get(t.user_id) || []), t.tag_option_id]));

    setMembers(profiles.map((p: any) => ({
      ...p, roleIds: roleMap.get(p.id) || [], tagOptionIds: tagMap.get(p.id) || [],
    })));
    setAllRoles(roles as Role[]);
    setTagGroups(rawGroups.map((g: any) => ({ id: g.id, name: g.name, options: g.member_tag_options || [] })));
    setContacts((contactsRes.data as Contact[]) || []);
    setLoading(false);
  }

  /* -- Üye rol/etiket dialog --------------------------- */
  function openEdit(member: Member) {
    setEditing(member);
    setDraftRoleIds([...member.roleIds]);
    setDraftTagOptionIds([...member.tagOptionIds]);
    setTagSearch("");
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const toAddRoles    = draftRoleIds.filter(id => !editing.roleIds.includes(id));
    const toRemoveRoles = editing.roleIds.filter(id => !draftRoleIds.includes(id));
    const toAddTags    = draftTagOptionIds.filter(id => !editing.tagOptionIds.includes(id));
    const toRemoveTags = editing.tagOptionIds.filter(id => !draftTagOptionIds.includes(id));
    await Promise.all([
      ...toAddRoles.map(rid => supabase.from("user_roles").upsert({ user_id: editing.id, role_id: rid }, { onConflict: "user_id,role_id", ignoreDuplicates: true })),
      ...toRemoveRoles.map(rid => supabase.from("user_roles").delete().eq("user_id", editing.id).eq("role_id", rid)),
      ...toAddTags.map(tid => supabase.from("user_tags").upsert({ user_id: editing.id, tag_option_id: tid }, { onConflict: "user_id,tag_option_id", ignoreDuplicates: true })),
      ...toRemoveTags.map(tid => supabase.from("user_tags").delete().eq("user_id", editing.id).eq("tag_option_id", tid)),
    ]);
    setSaving(false);
    setEditing(null);
    fetchAll();
  }

  function toggleRole(id: string) { setDraftRoleIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]); }
  function toggleTag(id: string)  { setDraftTagOptionIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]); }

  /* -- Kişi ekle/düzenle ------------------------------- */
  function openNewContact() {
    setContactId(null);
    setCForm({ ...EMPTY_CONTACT });
    setContactOpen(true);
  }
  function openEditContact(c: Contact) {
    setContactId(c.id);
    setCForm({
      full_name: c.full_name ?? "", email: c.email ?? "", phone: c.phone ?? "",
      instagram_handle: c.instagram_handle ?? "", shoe_size: c.shoe_size ?? "",
      source_channel: c.source_channel, status: c.status, note: c.note ?? "",
    });
    setContactOpen(true);
  }

  async function saveContact() {
    const hasIdentity = cForm.full_name.trim() || cForm.email.trim() || cForm.phone.trim() || cForm.instagram_handle.trim();
    if (!hasIdentity) { alert("En az bir bilgi girin (isim, e-posta, telefon veya Instagram)."); return; }
    setCSaving(true);
    try {
      const payload: any = {
        full_name: cForm.full_name.trim() || null,
        email: cForm.email.trim().toLowerCase() || null,
        phone: cForm.phone.trim() || null,
        instagram_handle: cForm.instagram_handle.trim().replace(/^@/, "") || null,
        shoe_size: cForm.shoe_size.trim() || null,
        source_channel: cForm.source_channel,
        status: cForm.status,
        note: cForm.note.trim() || null,
      };

      // Yeni kayıtta basit mükerrer uyarısı
      if (!contactId && payload.email) {
        const { data: dupP } = await supabase.from("profiles").select("id").eq("email", payload.email).maybeSingle();
        if (dupP) { if (!confirm("Bu e-posta zaten kayıtlı bir ÜYE'ye ait. Yine de kişi eklensin mi?")) { setCSaving(false); return; } }
        const { data: dupC } = await (supabase as any).from("contacts").select("id").eq("email", payload.email).maybeSingle();
        if (dupC) { if (!confirm("Bu e-posta ile zaten bir kişi var. Yine de yeni kişi eklensin mi?")) { setCSaving(false); return; } }
      }

      if (contactId) {
        const { error } = await (supabase as any).from("contacts").update(payload).eq("id", contactId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("contacts").insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
      setContactOpen(false);
      fetchAll();
    } catch (e: any) {
      alert("Kaydedilemedi: " + (e?.message ?? "hata"));
    } finally {
      setCSaving(false);
    }
  }

  async function deleteContact() {
    if (!contactId) return;
    if (!confirm("Bu kişi kaydını silmek istediğinize emin misiniz?")) return;
    await (supabase as any).from("contacts").delete().eq("id", contactId);
    setContactOpen(false);
    fetchAll();
  }

  /* -- Birleşik liste ----------------------------------- */
  const allOptionsById = useMemo(() => {
    const m = new Map<string, TagOption & { groupName: string }>();
    tagGroups.forEach(g => g.options.forEach(o => m.set(o.id, { ...o, groupName: g.name })));
    return m;
  }, [tagGroups]);

  type Row =
    | { kind: "member"; created_at: string; member: Member }
    | { kind: "contact"; created_at: string; contact: Contact };

  const rows: Row[] = useMemo(() => {
    const r: Row[] = [];
    if (kind !== "contact") members.forEach(m => r.push({ kind: "member", created_at: m.created_at, member: m }));
    if (kind !== "member") contacts.forEach(c => r.push({ kind: "contact", created_at: c.created_at, contact: c }));
    r.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return r;
  }, [members, contacts, kind]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter(row => {
      if (row.kind === "member") {
        const m = row.member;
        return `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)
          || (m.email ?? "").toLowerCase().includes(q)
          || (m.phone ?? "").includes(q);
      } else {
        const c = row.contact;
        return (c.full_name ?? "").toLocaleLowerCase("tr-TR").includes(q)
          || (c.email ?? "").toLowerCase().includes(q)
          || (c.phone ?? "").includes(q)
          || (c.instagram_handle ?? "").toLowerCase().includes(q);
      }
    });
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Üyeler &amp; Kişiler</h2>
          <p className="text-muted-foreground">Markayla temas etmiş herkes tek yerde — üye olsun olmasın.</p>
        </div>
        <Button onClick={openNewContact} className="gap-2">
          <UserPlus size={16} /> Kişi Ekle
        </Button>
      </div>

      {/* Filtre + arama */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {([["all","Hepsi"],["member","Üyeler"],["contact","Kişiler"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                kind === k ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input placeholder="İsim / e-posta / telefon / Instagram ara..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader className="pb-3">
          <CardTitle>Liste</CardTitle>
          <CardDescription>{members.length} üye · {contacts.length} kişi</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground border-t text-sm">Kayıt bulunamadı.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Ad / İletişim</TableHead>
                  <TableHead>Tür & Roller</TableHead>
                  <TableHead>Etiket / Beden</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(row => {
                  if (row.kind === "member") {
                    const member = row.member;
                    const memberRoles = allRoles.filter(r => member.roleIds.includes(r.id));
                    const memberTags  = member.tagOptionIds.map(id => allOptionsById.get(id)).filter(Boolean);
                    return (
                      <TableRow key={"m" + member.id} className="group cursor-pointer hover:bg-slate-50/60" onClick={() => router.push(`/admin/members/${member.id}`)}>
                        <TableCell>
                          <div className="font-medium text-sm leading-tight">{member.first_name} {member.last_name}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"><Mail size={11} /> {member.email ?? "—"}</div>
                          {member.phone && <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"><Phone size={11} /> {member.phone}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge className="text-[10px] font-semibold border px-1.5 py-0 bg-green-50 text-green-700 border-green-200">Üye</Badge>
                            {memberRoles.map(r => (
                              <Badge key={r.id} className={cn("text-[10px] font-semibold border px-1.5 py-0", roleColor(r.slug))}>{r.name}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {memberTags.length ? memberTags.map(t => t && (
                              <Badge key={t.id} className="text-[10px] border bg-indigo-50 text-indigo-700 border-indigo-200 px-1.5 py-0">{t.groupName}: {t.value}</Badge>
                            )) : <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(member.created_at).toLocaleDateString("tr-TR")}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); openEdit(member); }} title="Rol ve Etiket Düzenle">
                            <UserCog size={15} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  // contact
                  const c = row.contact;
                  return (
                    <TableRow key={"c" + c.id} className="group cursor-pointer hover:bg-amber-50/40" onClick={() => openEditContact(c)}>
                      <TableCell>
                        <div className="font-medium text-sm leading-tight">{c.full_name || <span className="text-slate-400 italic">İsimsiz</span>}</div>
                        {c.email && <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"><Mail size={11} /> {c.email}</div>}
                        {c.instagram_handle && <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"><AtSign size={11} /> @{c.instagram_handle}</div>}
                        {c.phone && <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"><Phone size={11} /> {c.phone}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge className="text-[10px] font-semibold border px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-200">Henüz Üye değil</Badge>
                          <Badge className="text-[10px] border px-1.5 py-0 bg-slate-50 text-slate-600 border-slate-200">{SOURCE_LABELS[c.source_channel] ?? c.source_channel}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.shoe_size
                          ? <Badge className="text-[10px] border bg-indigo-50 text-indigo-700 border-indigo-200 px-1.5 py-0">Beden: {c.shoe_size}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(c.created_at).toLocaleDateString("tr-TR")}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); openEditContact(c); }} title="Kişiyi Düzenle">
                          <UserCog size={15} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* -- Üye rol/etiket dialog ----------------------- */}
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog size={18} />
              {editing?.first_name} {editing?.last_name}
              <span className="text-sm font-normal text-muted-foreground ml-1">{editing?.email}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><UserCog size={15} className="text-blue-600" /> Roller</div>
              <div className="flex flex-wrap gap-2">
                {allRoles.map(role => {
                  const active = draftRoleIds.includes(role.id);
                  return (
                    <button key={role.id} onClick={() => toggleRole(role.id)}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                        active ? cn(roleColor(role.slug), "shadow-sm") : "bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300")}>
                      {active ? "✓ " : ""}{role.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><Tags size={15} className="text-indigo-600" /> Etiketler</div>
              <div className="min-h-[36px] flex flex-wrap gap-1.5 p-2.5 rounded-xl border-2 border-slate-100 bg-slate-50/50">
                {draftTagOptionIds.length === 0 && <span className="text-xs text-muted-foreground italic self-center">Etiket yok</span>}
                {draftTagOptionIds.map(id => {
                  const opt = allOptionsById.get(id);
                  if (!opt) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-semibold">
                      <span className="text-indigo-400">{opt.groupName}:</span> {opt.value}
                      <button type="button" onClick={() => toggleTag(id)} className="ml-0.5 hover:text-red-500 transition-colors"><X size={10} /></button>
                    </span>
                  );
                })}
              </div>
              <div className="space-y-1.5">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="text" placeholder="Etiket ara ve ekle..." value={tagSearch} onChange={e => setTagSearch(e.target.value)}
                    className="w-full pl-7 pr-3 h-8 text-xs rounded-lg border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" />
                </div>
                {tagSearch.trim().length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-50">
                    {(() => {
                      const q = tagSearch.toLowerCase();
                      const results = tagGroups.flatMap(g =>
                        g.options.filter(o => !draftTagOptionIds.includes(o.id) && (o.value.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)))
                          .map(o => ({ ...o, groupName: g.name })));
                      if (results.length === 0) return <div className="px-3 py-2 text-xs text-muted-foreground italic">Sonuç yok.</div>;
                      return results.map(o => (
                        <button key={o.id} type="button" onClick={() => { toggleTag(o.id); setTagSearch(""); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-indigo-50 transition-colors text-left">
                          <Plus size={11} className="text-indigo-400 shrink-0" />
                          <span className="text-muted-foreground">{o.groupName}:</span>
                          <span className="font-medium">{o.value}</span>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={() => setEditing(null)}>İptal</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Kaydet
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* -- Kişi ekle/düzenle dialog -------------------- */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus size={18} /> {contactId ? "Kişiyi Düzenle" : "Yeni Kişi"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">Bilgilerin hepsi opsiyonel — elinde ne varsa gir (sadece Instagram bile olur).</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-semibold">Ad Soyad</label>
                <Input value={cForm.full_name} onChange={e => setCForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Ör. Ayşe Yılmaz" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">E-posta</label>
                <Input type="email" value={cForm.email} onChange={e => setCForm(f => ({ ...f, email: e.target.value }))} placeholder="ornek@mail.com" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Telefon</label>
                <Input value={cForm.phone} onChange={e => setCForm(f => ({ ...f, phone: e.target.value }))} placeholder="05xx..." />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Instagram</label>
                <Input value={cForm.instagram_handle} onChange={e => setCForm(f => ({ ...f, instagram_handle: e.target.value }))} placeholder="kullanici_adi" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Ayakkabı No</label>
                <Input value={cForm.shoe_size} onChange={e => setCForm(f => ({ ...f, shoe_size: e.target.value }))} placeholder="38" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Kaynak</label>
                <select value={cForm.source_channel} onChange={e => setCForm(f => ({ ...f, source_channel: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Durum</label>
                <select value={cForm.status} onChange={e => setCForm(f => ({ ...f, status: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="lead">İlgili</option>
                  <option value="contacted">Görüşüldü</option>
                  <option value="converted">Üyeye döndü</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Not</label>
              <textarea value={cForm.note} onChange={e => setCForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Ne konuşuldu, ne istiyor..." className="w-full min-h-[70px] rounded-xl border-2 border-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-olive-400" />
            </div>
          </div>
          <div className="flex justify-between gap-3 pt-3 border-t mt-3">
            {contactId ? (
              <Button variant="ghost" onClick={deleteContact} className="text-red-600 hover:bg-red-50 gap-1.5"><Trash2 size={14} /> Sil</Button>
            ) : <span />}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setContactOpen(false)}>İptal</Button>
              <Button onClick={saveContact} disabled={cSaving} className="gap-2">
                {cSaving && <Loader2 size={14} className="animate-spin" />} Kaydet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
