"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Search, Mail, Phone, Loader2, UserCog, Tags, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Tipler ─────────────────────────────────────────── */

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
  roleIds: string[];   // atanmış role id'leri
  tagOptionIds: string[]; // atanmış tag_option id'leri
};

/* ── Renk paleti rollere göre ───────────────────────── */
const ROLE_COLORS: Record<string, string> = {
  admin:     "bg-purple-100 text-purple-700 border-purple-200",
  uye:       "bg-slate-100 text-slate-700 border-slate-200",
  musteri:   "bg-green-100 text-green-700 border-green-200",
  affiliate: "bg-blue-100 text-blue-700 border-blue-200",
};
function roleColor(slug: string) {
  return ROLE_COLORS[slug] ?? "bg-amber-100 text-amber-700 border-amber-200";
}

/* ── Bileşen ─────────────────────────────────────────── */

export default function MembersPage() {
  const router = useRouter();
  const [members, setMembers]     = useState<Member[]>([]);
  const [allRoles, setAllRoles]   = useState<Role[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");

  // Edit dialog
  const [editing, setEditing]   = useState<Member | null>(null);
  const [saving, setSaving]     = useState(false);
  // local draft for dialog
  const [draftRoleIds, setDraftRoleIds]           = useState<string[]>([]);
  const [draftTagOptionIds, setDraftTagOptionIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch]                 = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  /* ── Veri çekme ─────────────────────────────────────── */

  async function fetchAll() {
    setLoading(true);

    const [profilesRes, rolesRes, tagGroupsRes, userRolesRes, userTagsRes] = await Promise.all([
      supabase.from("profiles").select("id, email, first_name, last_name, phone, city, created_at").order("created_at", { ascending: false }),
      supabase.from("roles").select("id, name, slug").order("name"),
      supabase.from("member_tag_groups").select("id, name, member_tag_options(id, group_id, value)").order("created_at"),
      supabase.from("user_roles").select("user_id, role_id"),
      supabase.from("user_tags").select("user_id, tag_option_id"),
    ]);

    const profiles  = profilesRes.data  || [];
    const roles     = rolesRes.data     || [];
    const rawGroups = tagGroupsRes.data || [];
    const userRoles = userRolesRes.data || [];
    const userTags  = userTagsRes.data  || [];

    // Üye başına rol & tag id'lerini map'e al
    const roleMap = new Map<string, string[]>();
    const tagMap  = new Map<string, string[]>();
    userRoles.forEach((r: any) => {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) || []), r.role_id]);
    });
    userTags.forEach((t: any) => {
      tagMap.set(t.user_id, [...(tagMap.get(t.user_id) || []), t.tag_option_id]);
    });

    setMembers(profiles.map((p: any) => ({
      ...p,
      roleIds: roleMap.get(p.id) || [],
      tagOptionIds: tagMap.get(p.id) || [],
    })));
    setAllRoles(roles as Role[]);
    setTagGroups(rawGroups.map((g: any) => ({ id: g.id, name: g.name, options: g.member_tag_options || [] })));
    setLoading(false);
  }

  /* ── Dialog aç ─────────────────────────────────────── */

  function openEdit(member: Member) {
    setEditing(member);
    setDraftRoleIds([...member.roleIds]);
    setDraftTagOptionIds([...member.tagOptionIds]);
    setTagSearch("");
  }

  /* ── Kaydet ─────────────────────────────────────────── */

  async function handleSave() {
    if (!editing) return;
    setSaving(true);

    // Eklenecek / silinecek roller
    const toAddRoles    = draftRoleIds.filter(id => !editing.roleIds.includes(id));
    const toRemoveRoles = editing.roleIds.filter(id => !draftRoleIds.includes(id));

    // Eklenecek / silinecek etiketler
    const toAddTags    = draftTagOptionIds.filter(id => !editing.tagOptionIds.includes(id));
    const toRemoveTags = editing.tagOptionIds.filter(id => !draftTagOptionIds.includes(id));

    await Promise.all([
      ...toAddRoles.map(rid =>
        supabase.from("user_roles").upsert({ user_id: editing.id, role_id: rid }, { onConflict: "user_id,role_id", ignoreDuplicates: true })
      ),
      ...toRemoveRoles.map(rid =>
        supabase.from("user_roles").delete().eq("user_id", editing.id).eq("role_id", rid)
      ),
      ...toAddTags.map(tid =>
        supabase.from("user_tags").upsert({ user_id: editing.id, tag_option_id: tid }, { onConflict: "user_id,tag_option_id", ignoreDuplicates: true })
      ),
      ...toRemoveTags.map(tid =>
        supabase.from("user_tags").delete().eq("user_id", editing.id).eq("tag_option_id", tid)
      ),
    ]);

    setSaving(false);
    setEditing(null);
    fetchAll();
  }

  /* ── Toggle helpers ─────────────────────────────────── */

  function toggleRole(id: string) {
    setDraftRoleIds(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  }

  function toggleTag(id: string) {
    setDraftTagOptionIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  }

  /* ── Filtre ─────────────────────────────────────────── */

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (
      `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q)
    );
  });

  /* ── Render ─────────────────────────────────────────── */

  // All tag options flat map (id → option)
  const allOptionsById = new Map<string, TagOption & { groupName: string }>();
  tagGroups.forEach(g => g.options.forEach(o => allOptionsById.set(o.id, { ...o, groupName: g.name })));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Üyeler</h2>
        <p className="text-muted-foreground">Kayıtlı kullanıcıların rollerini ve etiketlerini yönetin.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input
          placeholder="İsim veya e-posta ara..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader className="pb-3">
          <CardTitle>Üye Listesi</CardTitle>
          <CardDescription>{members.length} kayıtlı üye</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground border-t text-sm">Üye bulunamadı.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Ad / E-posta</TableHead>
                  <TableHead>Telefon / Şehir</TableHead>
                  <TableHead>Roller</TableHead>
                  <TableHead>Etiketler</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(member => {
                  const memberRoles = allRoles.filter(r => member.roleIds.includes(r.id));
                  const memberTags  = member.tagOptionIds.map(id => allOptionsById.get(id)).filter(Boolean);

                  return (
                    <TableRow
                      key={member.id}
                      className="group cursor-pointer hover:bg-slate-50/60"
                      onClick={() => router.push(`/admin/members/${member.id}`)}
                    >
                      <TableCell>
                        <div className="font-medium text-sm leading-tight">
                          {member.first_name} {member.last_name}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Mail size={11} /> {member.email ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {member.phone && (
                          <div className="flex items-center gap-1 text-xs">
                            <Phone size={11} /> {member.phone}
                          </div>
                        )}
                        {member.city && <div className="text-xs mt-0.5">{member.city}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {memberRoles.length ? memberRoles.map(r => (
                            <Badge
                              key={r.id}
                              className={cn("text-[10px] font-semibold border px-1.5 py-0", roleColor(r.slug))}
                            >
                              {r.name}
                            </Badge>
                          )) : <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {memberTags.length ? memberTags.map(t => t && (
                            <Badge key={t.id} className="text-[10px] border bg-indigo-50 text-indigo-700 border-indigo-200 px-1.5 py-0">
                              {t.groupName}: {t.value}
                            </Badge>
                          )) : <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(member.created_at).toLocaleDateString("tr-TR")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); openEdit(member); }}
                          title="Rol ve Etiket Düzenle"
                        >
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

      {/* ── Edit Dialog ─────────────────────────────────── */}
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
            {/* Roller */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <UserCog size={15} className="text-blue-600" /> Roller
              </div>
              <div className="flex flex-wrap gap-2">
                {allRoles.map(role => {
                  const active = draftRoleIds.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      onClick={() => toggleRole(role.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                        active
                          ? cn(roleColor(role.slug), "shadow-sm")
                          : "bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300"
                      )}
                    >
                      {active ? "✓ " : ""}{role.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Etiketler */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Tags size={15} className="text-indigo-600" /> Etiketler
              </div>

              {/* Mevcut etiketler — X ile kaldır */}
              <div className="min-h-[36px] flex flex-wrap gap-1.5 p-2.5 rounded-xl border-2 border-slate-100 bg-slate-50/50">
                {draftTagOptionIds.length === 0 && (
                  <span className="text-xs text-muted-foreground italic self-center">Etiket yok</span>
                )}
                {draftTagOptionIds.map(id => {
                  const opt = allOptionsById.get(id);
                  if (!opt) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-semibold"
                    >
                      <span className="text-indigo-400">{opt.groupName}:</span> {opt.value}
                      <button
                        type="button"
                        onClick={() => toggleTag(id)}
                        className="ml-0.5 hover:text-red-500 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
              </div>

              {/* Etiket ekle — arama ile */}
              <div className="space-y-1.5">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Etiket ara ve ekle..."
                    value={tagSearch}
                    onChange={e => setTagSearch(e.target.value)}
                    className="w-full pl-7 pr-3 h-8 text-xs rounded-lg border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  />
                </div>
                {tagSearch.trim().length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-50">
                    {(() => {
                      const q = tagSearch.toLowerCase();
                      const results = tagGroups.flatMap(g =>
                        g.options
                          .filter(o =>
                            !draftTagOptionIds.includes(o.id) &&
                            (o.value.toLowerCase().includes(q) || g.name.toLowerCase().includes(q))
                          )
                          .map(o => ({ ...o, groupName: g.name }))
                      );
                      if (results.length === 0) return (
                        <div className="px-3 py-2 text-xs text-muted-foreground italic">Sonuç yok.</div>
                      );
                      return results.map(o => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => { toggleTag(o.id); setTagSearch(""); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-indigo-50 transition-colors text-left"
                        >
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Kaydet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
