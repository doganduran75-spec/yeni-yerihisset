"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Check, Loader2, RefreshCw, Plus, Search, AtSign, MessageCircle } from "lucide-react";

// WhatsApp linki (TR numaralarını uluslararası formata çevir)
function waLink(phone?: string | null): string | null {
  let d = (phone || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "90" + d.slice(1);
  else if (d.length === 10) d = "90" + d;
  return `https://wa.me/${d}`;
}
function igLink(handle?: string | null): string | null {
  const h = (handle || "").replace(/^@/, "").trim();
  return h ? `https://instagram.com/${h}` : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

type Notification = {
  id: string;
  product_id: string;
  variant_id: string | null;
  user_id: string | null;
  email: string | null;
  phone: string | null;
  contact_id: string | null;
  instagram: string | null;
  status: "pending" | "notified";
  created_at: string;
  notified_at: string | null;
  product_title?: string;
  variant_value?: string;
  contact_name?: string | null;
  contact_instagram?: string | null;
  contact_phone?: string | null;
};

// Satılabilir birim: ürün ya da varyant (stok dahil)
type Unit = {
  productId: string;
  variantId: string;     // "" = varyantsız ürün
  title: string;
  variantLabel: string;  // "" ya da "Beden: 42"
  sku: string;
  stock: number;
  search: string;        // başlık + varyant + sku (çok-kelimeli)
};

// Türkçe-duyarsız normalize
function normTr(s: string): string {
  return (s || "").toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("İ", "i").replaceAll("ş", "s")
    .replaceAll("ğ", "g").replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c");
}

export default function StockNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [marking, setMarking] = useState<string | null>(null);

  // Manuel ekleme
  const [units, setUnits] = useState<Unit[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [pSearch, setPSearch] = useState("");
  const [form, setForm] = useState({ productId: "", variantId: "", name: "", email: "", instagram: "", phone: "" });
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [filter]);

  useEffect(() => { fetchProducts(); }, []);

  async function fetchProducts() {
    const { data } = await (supabase as any)
      .from("products")
      .select("id, title, stock, product_variants(id, sku, stock, variant_options(value, variant_groups(name)))")
      .eq("is_active", true)
      .order("title");
    const us: Unit[] = [];
    for (const p of (data as any[]) || []) {
      const vs = p.product_variants || [];
      if (vs.length > 0) {
        for (const v of vs) {
          const val = v.variant_options?.value ?? "";
          const gn = v.variant_options?.variant_groups?.name ?? "";
          const label = val ? (gn ? `${gn}: ${val}` : val) : "Varyant";
          us.push({
            productId: p.id, variantId: v.id, title: p.title, variantLabel: label,
            sku: v.sku ?? "", stock: Number(v.stock ?? 0),
            search: normTr([p.title, gn, val, v.sku].filter(Boolean).join(" ")),
          });
        }
      } else {
        us.push({
          productId: p.id, variantId: "", title: p.title, variantLabel: "",
          sku: "", stock: Number(p.stock ?? 0), search: normTr(p.title),
        });
      }
    }
    setUnits(us);
  }

  async function fetchNotifications() {
    setLoading(true);
    try {
      // EMBED YOK — ana sorgu yalın; ilişkiler ayrı çekilir (embed hataları
      // tüm listeyi boş bırakmasın). Hata olursa ekranda gösterilir.
      let query = (supabase as any)
        .from("stock_notifications")
        .select("id, product_id, variant_id, user_id, email, phone, contact_id, instagram, status, created_at, notified_at")
        .order("created_at", { ascending: false });
      if (filter === "pending") query = query.eq("status", "pending");

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data as any[]) || [];

      // Ürün başlıkları
      const pids = [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[];
      const pmap = new Map<string, string>();
      if (pids.length) {
        const { data: ps } = await (supabase as any).from("products").select("id, title").in("id", pids);
        (ps as any[] || []).forEach((p) => pmap.set(p.id, p.title));
      }

      // Varyant değerleri (embed'i yalıtılmış — hata olursa yut)
      const vids = [...new Set(rows.map((r) => r.variant_id).filter(Boolean))] as string[];
      const vmap = new Map<string, string | null>();
      if (vids.length) {
        try {
          const { data: vs } = await (supabase as any)
            .from("product_variants").select("id, variant_options(value)").in("id", vids);
          (vs as any[] || []).forEach((v) => vmap.set(v.id, v.variant_options?.value ?? null));
        } catch { /* varyant etiketi kritik değil */ }
      }

      // Kişiler
      const cids = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))] as string[];
      const cmap = new Map<string, any>();
      if (cids.length) {
        const { data: cs } = await (supabase as any)
          .from("contacts").select("id, full_name, instagram_handle, phone").in("id", cids);
        (cs as any[] || []).forEach((c) => cmap.set(c.id, c));
      }

      const formatted = rows.map((n: any) => {
        const c = n.contact_id ? cmap.get(n.contact_id) : null;
        return {
          ...n,
          product_title: pmap.get(n.product_id) ?? "—",
          variant_value: n.variant_id ? (vmap.get(n.variant_id) ?? null) : null,
          contact_name: c?.full_name ?? null,
          contact_instagram: c?.instagram_handle ?? null,
          contact_phone: c?.phone ?? null,
        };
      });

      setNotifications(formatted);
      setLoadError(null);
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || "Liste yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function markAsNotified(id: string) {
    setMarking(id);
    try {
      const { error } = await supabase
        .from("stock_notifications")
        .update({ status: "notified", notified_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setNotifications((prev) => prev.filter((n) => (filter === "pending" ? n.id !== id : true)).map((n) =>
        n.id === id ? { ...n, status: "notified", notified_at: new Date().toISOString() } : n
      ));
    } finally {
      setMarking(null);
    }
  }

  async function markAllAsNotified() {
    if (!confirm("Bekleyen tüm bildirimler 'Bildirildi' olarak işaretlensin mi?")) return;
    const pendingIds = notifications.filter((n) => n.status === "pending").map((n) => n.id);
    if (!pendingIds.length) return;

    const { error } = await supabase
      .from("stock_notifications")
      .update({ status: "notified", notified_at: new Date().toISOString() })
      .in("id", pendingIds);

    if (!error) fetchNotifications();
  }

  const pendingCount = notifications.filter((n) => n.status === "pending").length;

  function contactDisplay(n: Notification) {
    if (n.contact_name) return n.contact_name;
    if (n.email) return n.email;
    if (n.contact_instagram || n.instagram) return "@" + (n.contact_instagram || n.instagram);
    if (n.phone) return n.phone;
    if (n.user_id) return <span className="text-slate-400 text-xs italic">Kayıtlı üye</span>;
    return "—";
  }

  const filteredUnits = (() => {
    const tokens = normTr(pSearch).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return units.slice(0, 30);
    return units.filter((u) => tokens.every((t) => u.search.includes(t))).slice(0, 30);
  })();
  const selectedUnit = units.find((u) => u.productId === form.productId && (u.variantId || "") === (form.variantId || ""));

  async function saveManual() {
    if (!form.productId) { alert("Bir ürün seçin."); return; }
    const hasIdentity = form.name.trim() || form.email.trim() || form.instagram.trim() || form.phone.trim();
    if (!hasIdentity) { alert("Kişi için en az bir bilgi girin (isim, e-posta, Instagram veya telefon)."); return; }
    setAddSaving(true);
    try {
      const email = form.email.trim().toLowerCase() || null;
      const instagram = form.instagram.trim().replace(/^@/, "") || null;
      const phone = form.phone.trim() || null;

      // Kişiyi bul (email) ya da oluştur
      let contactId: string | null = null;
      if (email) {
        const { data: existing } = await (supabase as any).from("contacts").select("id").eq("email", email).maybeSingle();
        if (existing) contactId = existing.id;
      }
      if (!contactId) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: created, error: cErr } = await (supabase as any).from("contacts").insert({
          full_name: form.name.trim() || null,
          email, phone, instagram_handle: instagram,
          source_channel: "stock_notify",
          note: `Stok bildirimi: ${selectedUnit?.title ?? ""}${selectedUnit?.variantLabel ? " · " + selectedUnit.variantLabel : ""}`,
          created_by: user?.id ?? null,
        }).select("id").single();
        if (cErr) throw cErr;
        contactId = created.id;
      }

      const { error: nErr } = await (supabase as any).from("stock_notifications").insert({
        product_id: form.productId,
        variant_id: form.variantId || null,
        contact_id: contactId,
        email, phone, instagram,
        status: "pending",
      });
      if (nErr) throw nErr;

      setAddOpen(false);
      setForm({ productId: "", variantId: "", name: "", email: "", instagram: "", phone: "" });
      setPSearch("");
      fetchNotifications();
    } catch (e: any) {
      alert("Eklenemedi: " + (e?.message ?? "hata"));
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell size={24} className="text-amber-500" />
            Stok Bildirimleri
          </h2>
          <p className="text-muted-foreground">
            Stok girişinde haberdar edilmek isteyen kişiler.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Manuel Ekle
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotifications}
            className="gap-2"
          >
            <RefreshCw size={14} /> Yenile
          </Button>
          {pendingCount > 0 && (
            <Button
              size="sm"
              className="gap-2 bg-green-600 hover:bg-green-700"
              onClick={markAllAsNotified}
            >
              <Check size={14} /> Tümünü Bildirildi İşaretle ({pendingCount})
            </Button>
          )}
        </div>
      </div>

      {/* İstatistik */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Bell size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">{pendingCount}</p>
              <p className="text-xs text-slate-500 font-medium">Bekleyen</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <Check size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">
                {notifications.filter((n) => n.status === "notified").length}
              </p>
              <p className="text-xs text-slate-500 font-medium">Bildirildi</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtre */}
      <div className="flex gap-2">
        {(["pending", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f === "pending" ? "Bekleyenler" : "Tümü"}
          </button>
        ))}
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle>Bildirim Talepleri</CardTitle>
          <CardDescription>
            {filter === "pending" ? "Henüz bildirilmemiş talepler" : "Tüm bildirim talepleri"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Liste yüklenemedi: {loadError}
            </div>
          )}
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground border border-dashed rounded-xl">
              <Bell size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Bekleyen bildirim talebi yok.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Varyasyon</TableHead>
                  <TableHead>İletişim</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {n.product_title}
                    </TableCell>
                    <TableCell>
                      {n.variant_value ? (
                        <Badge variant="outline" className="text-blue-600 border-blue-100 bg-blue-50">
                          {n.variant_value}
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{contactDisplay(n)}</div>
                      {(() => {
                        const wa = waLink(n.phone || n.contact_phone);
                        const ig = igLink(n.contact_instagram || n.instagram);
                        const hasEmail = !!n.email;
                        if (!wa && !ig) return null;
                        return (
                          <div className="flex items-center gap-1.5 mt-1">
                            {!hasEmail && <span className="text-[9px] font-bold text-teal-600 uppercase">Elden:</span>}
                            {wa && (
                              <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp'tan yaz"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 hover:bg-green-100 rounded-md px-1.5 py-0.5">
                                <MessageCircle size={11} /> WhatsApp
                              </a>
                            )}
                            {ig && (
                              <a href={ig} target="_blank" rel="noopener noreferrer" title="Instagram'dan yaz"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-pink-700 bg-pink-50 hover:bg-pink-100 rounded-md px-1.5 py-0.5">
                                <AtSign size={11} /> Instagram
                              </a>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(n.created_at).toLocaleDateString("tr-TR", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      {n.status === "pending" ? (
                        <Badge className="bg-amber-100 text-amber-700 border-none hover:bg-amber-100">
                          Bekliyor
                        </Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-700 border-none hover:bg-green-100">
                          Bildirildi
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {n.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 text-green-600 border-green-100 hover:bg-green-50"
                          disabled={marking === n.id}
                          onClick={() => markAsNotified(n.id)}
                        >
                          {marking === n.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} className="mr-1" />
                          )}
                          Bildirildi
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Manuel ekleme modalı */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[720px] max-h-[90vh] overflow-y-auto top-[5vh] translate-y-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bell size={18} /> Manuel Stok Bildirimi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Bir ürün seç ve isteyen kişinin bilgisini gir. Kişi otomatik olarak &quot;Kişiler&quot;e (Üyeler ekranı) eklenir.
            </p>

            {/* Ürün/varyant seçimi — çok-kelimeli, stoklu (sipariş girişi gibi) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Ürün / Varyant *</label>
              {selectedUnit ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium truncate block">{selectedUnit.title}{selectedUnit.variantLabel ? ` · ${selectedUnit.variantLabel}` : ""}</span>
                    <span className={`text-[11px] font-bold ${selectedUnit.stock > 0 ? "text-green-600" : "text-red-500"}`}>
                      {selectedUnit.stock > 0 ? `Stok ${selectedUnit.stock} — zaten var, bildirim gereksiz olabilir` : "Tükendi"}
                    </span>
                  </span>
                  <button className="text-xs text-blue-600 font-bold shrink-0" onClick={() => setForm(f => ({ ...f, productId: "", variantId: "" }))}>Değiştir</button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder='Ara: "bot kahve 42"…' className="pl-9 h-10" />
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 divide-y">
                    {filteredUnits.map(u => (
                      <button
                        key={`${u.productId}_${u.variantId}`}
                        onClick={() => setForm(f => ({ ...f, productId: u.productId, variantId: u.variantId }))}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between gap-2"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-slate-800 block truncate">{u.title}{u.variantLabel ? ` · ${u.variantLabel}` : ""}</span>
                          {u.sku && <span className="text-slate-400">{u.sku}</span>}
                        </span>
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${u.stock <= 0 ? "bg-red-100 text-red-600" : u.stock <= 3 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                          {u.stock <= 0 ? "Tükendi" : `Stok ${u.stock}`}
                        </span>
                      </button>
                    ))}
                    {filteredUnits.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Sonuç yok.</div>}
                  </div>
                </>
              )}
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-slate-600">Kişi bilgileri (en az biri)</p>
              <div className="grid grid-cols-2 gap-3">
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ad Soyad" />
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="E-posta" />
                <div className="relative">
                  <AtSign size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="Instagram" className="pl-7" />
                </div>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Telefon" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t mt-3">
            <Button variant="outline" onClick={() => setAddOpen(false)}>İptal</Button>
            <Button onClick={saveManual} disabled={addSaving} className="gap-2">
              {addSaving && <Loader2 size={14} className="animate-spin" />} Ekle
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
