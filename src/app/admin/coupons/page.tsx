"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Plus, Pencil, Trash2, Ticket, Percent, DollarSign, Truck,
  Users, CheckCircle2, AlertCircle, UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Coupon = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: "percentage" | "fixed" | "free_shipping";
  amount: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  is_personal: boolean;
  max_uses: number | null;
  per_user_limit: number;
  used_count: number;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
};

const EMPTY: Omit<Coupon, "id" | "used_count"> = {
  code: "",
  name: "",
  description: "",
  type: "percentage",
  amount: 10,
  min_order_amount: 0,
  max_discount_amount: null,
  is_personal: false,
  max_uses: null,
  per_user_limit: 1,
  starts_at: new Date().toISOString().split("T")[0],
  expires_at: null,
  is_active: true,
};

const TYPE_LABEL: Record<string, string> = {
  percentage: "Yüzde %",
  fixed: "Sabit ₺",
  free_shipping: "Ücretsiz Kargo",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  percentage: <Percent size={12} />,
  fixed: <DollarSign size={12} />,
  free_shipping: <Truck size={12} />,
};

function formatExpiry(dt: string | null) {
  if (!dt) return "Süresiz";
  const d = new Date(dt);
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const label = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  if (diff < 0) return `Süresi Doldu (${label})`;
  if (diff <= 7) return `⚠ ${diff} gün (${label})`;
  return label;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> & { id?: string }>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [assignCouponId, setAssignCouponId] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => { fetchCoupons(); }, []);

  async function fetchCoupons() {
    const { data } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
    setCoupons(data || []);
    setLoading(false);
  }

  function openNew() {
    setEditingCoupon({ ...EMPTY, code: generateCode() });
    setDialogOpen(true);
  }

  function openEdit(c: Coupon) {
    setEditingCoupon({
      ...c,
      starts_at: c.starts_at ? c.starts_at.split("T")[0] : "",
      expires_at: c.expires_at ? c.expires_at.split("T")[0] : "",
    });
    setDialogOpen(true);
  }

  function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...editingCoupon,
        code: editingCoupon.code?.trim().toUpperCase(),
        amount: Number(editingCoupon.amount) || 0,
        min_order_amount: Number(editingCoupon.min_order_amount) || 0,
        max_discount_amount: editingCoupon.max_discount_amount ? Number(editingCoupon.max_discount_amount) : null,
        max_uses: editingCoupon.max_uses ? Number(editingCoupon.max_uses) : null,
        per_user_limit: Number(editingCoupon.per_user_limit) || 1,
        expires_at: editingCoupon.expires_at || null,
        starts_at: editingCoupon.starts_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      delete (payload as any).id;
      delete (payload as any).used_count;

      if (editingCoupon.id) {
        const { error } = await supabase.from("coupons").update(payload).eq("id", editingCoupon.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coupons").insert(payload);
        if (error) throw error;
      }
      setDialogOpen(false);
      fetchCoupons();
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu kuponu silmek istediğinize emin misiniz?")) return;
    await supabase.from("coupons").delete().eq("id", id);
    fetchCoupons();
  }

  async function handleAssign() {
    if (!assignEmail.trim() || !assignCouponId) return;
    setAssigning(true);
    try {
      // Email ile profil ara
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", assignEmail.trim().toLowerCase())
        .maybeSingle();
      if (!profile) throw new Error("Bu email ile kayıtlı üye bulunamadı");

      const { error } = await supabase.from("user_coupons").insert({
        user_id: profile.id,
        coupon_id: assignCouponId,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Bu kupon zaten bu üyeye atanmış");
        throw error;
      }

      // Bilgilendirme e-postası gönder ("Yeni Kupon Tanımlandı" şablonu)
      let emailNote = "";
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/coupons/notify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ userId: profile.id, couponId: assignCouponId }),
        });
        const d = await res.json();
        emailNote =
          d.status === "sent" ? "\nBilgilendirme e-postası gönderildi."
            : d.status === "skipped" ? "\n(E-posta gönderilmedi: şablon pasif ya da üyenin e-postası yok.)"
            : `\n(E-posta gönderilemedi: ${d.error || "hata"})`;
      } catch {
        emailNote = "\n(E-posta gönderilemedi.)";
      }

      alert("Kupon başarıyla üyeye atandı." + emailNote);
      setAssignOpen(false);
      setAssignEmail("");
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setAssigning(false);
    }
  }

  const totalActive = coupons.filter((c) => c.is_active).length;
  const totalUsed = coupons.reduce((s, c) => s + c.used_count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Kuponlar</h2>
          <p className="text-muted-foreground">İndirim kuponu oluşturun ve yönetin.</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus size={16} /> Yeni Kupon
        </Button>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-blue-50"><Ticket size={20} className="text-blue-600" /></div>
          <div><p className="text-2xl font-black">{coupons.length}</p><p className="text-xs text-muted-foreground">Toplam Kupon</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-green-50"><CheckCircle2 size={20} className="text-green-600" /></div>
          <div><p className="text-2xl font-black">{totalActive}</p><p className="text-xs text-muted-foreground">Aktif Kupon</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-purple-50"><Users size={20} className="text-purple-600" /></div>
          <div><p className="text-2xl font-black">{totalUsed}</p><p className="text-xs text-muted-foreground">Toplam Kullanım</p></div>
        </CardContent></Card>
      </div>

      {/* Tablo */}
      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-2xl border overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Kod</TableHead>
                <TableHead>Kupon Adı</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>İndirim</TableHead>
                <TableHead>Kullanım</TableHead>
                <TableHead>Son Geçerlilik</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Henüz kupon eklenmemiş</TableCell></TableRow>
              )}
              {coupons.map((c) => {
                const expired = c.expires_at && new Date(c.expires_at) < new Date();
                const soonExpiry = c.expires_at && !expired && Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 86400000) <= 7;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg text-sm tracking-widest">
                        {c.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-sm">{c.name}</p>
                        {c.is_personal && <span className="text-[10px] text-purple-600 font-bold bg-purple-50 px-1.5 rounded">KİŞİYE ÖZEL</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                        c.type === "percentage" && "bg-blue-50 text-blue-700",
                        c.type === "fixed" && "bg-green-50 text-green-700",
                        c.type === "free_shipping" && "bg-orange-50 text-orange-700",
                      )}>
                        {TYPE_ICON[c.type]} {TYPE_LABEL[c.type]}
                      </span>
                    </TableCell>
                    <TableCell className="font-bold">
                      {c.type === "percentage" ? `%${c.amount}` : c.type === "fixed" ? `₺${c.amount}` : "Ücretsiz"}
                      {c.min_order_amount > 0 && <p className="text-[10px] text-slate-400 font-normal">Min. ₺{c.min_order_amount}</p>}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{c.used_count}</span>
                      {c.max_uses && <span className="text-muted-foreground text-xs"> / {c.max_uses}</span>}
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-sm", expired && "text-red-600", soonExpiry && "text-amber-600")}>
                        {formatExpiry(c.expires_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.is_active && !expired ? "default" : "secondary"} className={c.is_active && !expired ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>
                        {c.is_active && !expired ? "Aktif" : expired ? "Süresi Doldu" : "Pasif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {c.is_personal && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-purple-600 hover:bg-purple-50"
                            title="Üyeye Ata"
                            onClick={() => { setAssignCouponId(c.id); setAssignOpen(true); }}>
                            <UserPlus size={14} />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)}>
                          <Pencil size={14} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => handleDelete(c.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Kupon Oluştur/Düzenle Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCoupon.id ? "Kuponu Düzenle" : "Yeni Kupon Oluştur"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Kupon Kodu *</label>
                <div className="flex gap-1">
                  <Input
                    value={editingCoupon.code || ""}
                    onChange={(e) => setEditingCoupon((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                    className="font-mono font-bold tracking-widest"
                    placeholder="INDIRIM10"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingCoupon((p) => ({ ...p, code: generateCode() }))}>
                    🎲
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Kupon Adı *</label>
                <Input value={editingCoupon.name || ""} onChange={(e) => setEditingCoupon((p) => ({ ...p, name: e.target.value }))} placeholder="Yaz İndirimi" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Açıklama</label>
              <Input value={editingCoupon.description || ""} onChange={(e) => setEditingCoupon((p) => ({ ...p, description: e.target.value }))} placeholder="İsteğe bağlı..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Kupon Tipi *</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editingCoupon.type || "percentage"}
                  onChange={(e) => setEditingCoupon((p) => ({ ...p, type: e.target.value as any }))}
                >
                  <option value="percentage">Yüzde İndirim (%)</option>
                  <option value="fixed">Sabit İndirim (₺)</option>
                  <option value="free_shipping">Ücretsiz Kargo</option>
                </select>
              </div>
              {editingCoupon.type !== "free_shipping" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">
                    {editingCoupon.type === "percentage" ? "İndirim Yüzdesi (%)" : "İndirim Tutarı (₺)"}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={editingCoupon.amount ?? ""}
                    onChange={(e) => setEditingCoupon((p) => ({ ...p, amount: Number(e.target.value) }))}
                    placeholder={editingCoupon.type === "percentage" ? "10" : "50"}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Minimum Sipariş (₺)</label>
                <Input type="number" min={0} value={editingCoupon.min_order_amount ?? 0} onChange={(e) => setEditingCoupon((p) => ({ ...p, min_order_amount: Number(e.target.value) }))} placeholder="0" />
              </div>
              {editingCoupon.type === "percentage" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Max İndirim (₺, opsiyonel)</label>
                  <Input type="number" min={0} value={editingCoupon.max_discount_amount ?? ""} onChange={(e) => setEditingCoupon((p) => ({ ...p, max_discount_amount: e.target.value ? Number(e.target.value) : null }))} placeholder="Sınırsız" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Toplam Kullanım Limiti</label>
                <Input type="number" min={1} value={editingCoupon.max_uses ?? ""} onChange={(e) => setEditingCoupon((p) => ({ ...p, max_uses: e.target.value ? Number(e.target.value) : null }))} placeholder="Sınırsız" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Kişi Başı Kullanım</label>
                <Input type="number" min={1} value={editingCoupon.per_user_limit ?? 1} onChange={(e) => setEditingCoupon((p) => ({ ...p, per_user_limit: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Başlangıç Tarihi</label>
                <Input type="date" value={(editingCoupon.starts_at || "").split("T")[0]} onChange={(e) => setEditingCoupon((p) => ({ ...p, starts_at: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Son Geçerlilik Tarihi</label>
                <Input type="date" value={(editingCoupon.expires_at || "").split("T")[0]} onChange={(e) => setEditingCoupon((p) => ({ ...p, expires_at: e.target.value || null }))} />
                <p className="text-[10px] text-muted-foreground">Boş = süresiz</p>
              </div>
            </div>

            <div className="flex gap-6 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={editingCoupon.is_active ?? true} onChange={(e) => setEditingCoupon((p) => ({ ...p, is_active: e.target.checked }))} className="h-4 w-4" />
                <span className="font-medium">Aktif</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={editingCoupon.is_personal ?? false} onChange={(e) => setEditingCoupon((p) => ({ ...p, is_personal: e.target.checked }))} className="h-4 w-4" />
                <span className="font-medium">Kişiye Özel</span>
                <span className="text-xs text-muted-foreground">(admin atar)</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingCoupon.id ? "Güncelle" : "Oluştur"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kullanıcıya Ata Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus size={18} /> Üyeye Ata</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Kuponu atamak istediğiniz üyenin email adresini girin.</p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Üye Email</label>
              <Input
                type="email"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
                placeholder="uye@example.com"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button variant="outline" onClick={() => setAssignOpen(false)}>İptal</Button>
              <Button onClick={handleAssign} disabled={assigning || !assignEmail} className="gap-2">
                {assigning && <Loader2 size={14} className="animate-spin" />}
                Ata
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
