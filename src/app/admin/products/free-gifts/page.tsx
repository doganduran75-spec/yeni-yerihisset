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
  Plus, Edit, Trash2, Loader2, Gift, Eye, EyeOff, Tag,
} from "lucide-react";

type Category = { id: string; name: string };
type Product   = { id: string; title: string; price: number; image_url: string | null };

type Rule = {
  id: string;
  name: string;
  trigger_category_id: string;
  gift_product_id: string;
  quantity_mode: "per_item" | "per_order" | "first_order";
  is_active: boolean;
  valid_until: string | null;
  selection_group: string | null;
  // joined
  categories: { name: string } | null;
  products:   { title: string; price: number; image_url: string | null } | null;
};

const MODE_LABELS: Record<string, string> = {
  per_item:    "Her ürün için 1 hediye",
  per_order:   "Siparişe 1 hediye",
  first_order: "İlk siparişe özel",
};

const EMPTY = {
  name: "",
  trigger_category_id: "",
  gift_product_id: "",
  quantity_mode: "per_order" as Rule["quantity_mode"],
  is_active: true,
  valid_until: "",
  selection_group: "",
};

export default function FreeGiftsPage() {
  const [rules, setRules]         = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [open, setOpen]           = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState({ ...EMPTY });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: c }, { data: p }] = await Promise.all([
      (supabase as any)
        .from("free_gift_rules")
        .select("*, categories:trigger_category_id(name), products:gift_product_id(title, price, image_url)")
        .order("created_at", { ascending: false }),
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("products").select("id, title, price, image_url").eq("is_active", true).order("title"),
    ]);
    setRules(r || []);
    setCategories(c || []);
    setProducts((p as any) || []);
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY });
    setOpen(true);
  }

  function openEdit(rule: Rule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      trigger_category_id: rule.trigger_category_id,
      gift_product_id: rule.gift_product_id,
      quantity_mode: rule.quantity_mode,
      is_active: rule.is_active,
      valid_until: rule.valid_until || "",
      selection_group: rule.selection_group || "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.trigger_category_id || !form.gift_product_id) {
      alert("Kural adı, tetikleyici kategori ve hediye ürün zorunlu.");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      valid_until: form.valid_until || null,
      selection_group: form.selection_group?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (editingId) {
      await (supabase as any).from("free_gift_rules").update(payload).eq("id", editingId);
    } else {
      await (supabase as any).from("free_gift_rules").insert(payload);
    }
    setSaving(false);
    setOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu kuralı silmek istediğinize emin misiniz?")) return;
    await (supabase as any).from("free_gift_rules").delete().eq("id", id);
    load();
  }

  async function toggleActive(rule: Rule) {
    await (supabase as any)
      .from("free_gift_rules")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id);
    setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bedelsiz Ürün Kuralları</h2>
          <p className="text-muted-foreground">
            Belirli kategoriler sepete eklendiğinde otomatik hediye verilir.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus size={16} /> Yeni Kural
        </Button>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Toplam Kural", value: rules.length },
          { label: "Aktif", value: rules.filter((r) => r.is_active).length },
          { label: "Pasif", value: rules.filter((r) => !r.is_active).length },
        ].map(({ label, value }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="flex items-center gap-3 pt-5 pb-5">
              <Gift size={20} className="text-olive-600" />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed rounded-xl border-slate-200 text-slate-400">
          Henüz hediye kuralı eklenmemiş.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card
              key={rule.id}
              className={`shadow-sm transition-opacity ${!rule.is_active ? "opacity-50" : ""}`}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Hediye ürün görseli */}
                    {rule.products?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={rule.products.image_url}
                        alt={rule.products.title}
                        className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-slate-100"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-olive-50 flex items-center justify-center flex-shrink-0">
                        <Gift size={22} className="text-olive-400" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-slate-900">{rule.name}</span>
                        {!rule.is_active && <Badge variant="secondary" className="text-[10px]">Pasif</Badge>}
                        {rule.valid_until && new Date(rule.valid_until) < new Date() && (
                          <Badge variant="destructive" className="text-[10px]">Süresi Doldu</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-sm text-slate-500">
                        {/* Tetikleyici kategori */}
                        <span className="flex items-center gap-1">
                          <Tag size={12} />
                          <span className="font-medium text-olive-700">{rule.categories?.name ?? "—"}</span>
                          <span>→</span>
                          <Gift size={12} className="text-olive-500" />
                          <span className="font-medium text-slate-700">{rule.products?.title ?? "—"}</span>
                          {rule.products?.price != null && (
                            <span className="text-[11px] text-slate-400 line-through">
                              ₺{rule.products.price.toLocaleString("tr-TR")}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] font-medium">
                          {MODE_LABELS[rule.quantity_mode]}
                        </Badge>
                        {rule.valid_until && (
                          <span className="text-xs text-slate-400">
                            Son: {new Date(rule.valid_until).toLocaleDateString("tr-TR")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Aksiyonlar */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      title={rule.is_active ? "Pasife Al" : "Aktive Et"}
                      onClick={() => toggleActive(rule)}
                    >
                      {rule.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                      <Edit size={14} />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(rule.id)}
                    >
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
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Kuralı Düzenle" : "Yeni Hediye Kuralı"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Kural adı */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Kural Adı *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Örn: Ayakkabı → Çanta Hediyesi"
              />
            </div>

            {/* Tetikleyici kategori */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tetikleyici Kategori *</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                value={form.trigger_category_id}
                onChange={(e) => setForm({ ...form, trigger_category_id: e.target.value })}
              >
                <option value="">Kategori seçin...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Bu kategorideki herhangi bir ürün sepete eklendiğinde kural tetiklenir.
              </p>
            </div>

            {/* Hediye ürün */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Hediye Ürün *</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                value={form.gift_product_id}
                onChange={(e) => setForm({ ...form, gift_product_id: e.target.value })}
              >
                <option value="">Ürün seçin...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} — ₺{p.price.toLocaleString("tr-TR")}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Ürünün fiyatı üstü çizili olarak gösterilir, müşteri bedelsiz alır.
              </p>
            </div>

            {/* Miktar modu */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Hediye Modu</label>
              <div className="space-y-2">
                {(["per_item", "per_order", "first_order"] as const).map((mode) => (
                  <label key={mode} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-100 hover:border-olive-200 transition-colors">
                    <input
                      type="radio"
                      name="quantity_mode"
                      value={mode}
                      checked={form.quantity_mode === mode}
                      onChange={() => setForm({ ...form, quantity_mode: mode })}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">{MODE_LABELS[mode]}</p>
                      <p className="text-xs text-muted-foreground">
                        {mode === "per_item" && "Sepette 3 ayakkabı varsa 3 hediye eklenir. Hediye tetikleyicinin altında görünür."}
                        {mode === "per_order" && "Kaç adet olursa olsun sipariş başına 1 hediye. Listenin en altında görünür."}
                        {mode === "first_order" && "Yalnızca üyenin ilk siparişinde geçerlidir."}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Seçim grubu (karşılıklı dışlama) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Seçim Grubu (opsiyonel)</label>
              <Input
                value={form.selection_group}
                onChange={(e) => setForm({ ...form, selection_group: e.target.value })}
                placeholder="ör. hediye-secimi"
              />
              <p className="text-xs text-muted-foreground">
                Aynı gruba yazılan ücretsiz ürünlerden müşteri yalnızca <strong>birini</strong> seçebilir
                (çanta ya da krem gibi). Boş bırakılırsa bu ödül bağımsızdır, diğerleriyle birlikte seçilebilir.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Son geçerlilik tarihi */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Son Geçerlilik Tarihi</label>
                <Input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                />
              </div>

              {/* Aktif */}
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Aktif</span>
                </label>
              </div>
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
