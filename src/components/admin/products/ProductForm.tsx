"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, Upload, X, ChevronLeft, Save, Copy, ImagePlus, GripVertical } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { sortByVariantValue } from "@/lib/variant-sort";

interface ProductFormProps {
  productId?: string;
  initialData?: any;
}

export default function ProductForm({ productId, initialData }: ProductFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [variantGroups, setVariantGroups] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: "",
    price: "",
    stock: "",
    category_id: "",
    brand_id: "",
    short_description: "",
    description: "",
    images: [] as string[],
    tags: [] as string[],
    has_variants: false,
    selected_group_id: "",
    variants: [] as any[],
    variants_have_images: false, // Her varyasyon için ayrı foto?
    is_active: true,
  });
  const [uploadingVariantIdx, setUploadingVariantIdx] = useState<number | null>(null);

  const [tagInput, setTagInput] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchMetadata();
    if (initialData) {
      setFormData({
        ...initialData,
        price: initialData.price?.toString() || "",
        stock: initialData.stock?.toString() || "",
        category_id: initialData.category_id || "",
        brand_id: initialData.brand_id || "",
        short_description: initialData.short_description || "",
        tags: initialData.tags || [],
        variants: sortByVariantValue(
          initialData.product_variants?.map((v: any) => ({
            ...v,
            price: v.price?.toString() || "",
            compare_at_price: v.compare_at_price?.toString() || "",
            stock: v.stock?.toString() || "",
            barcode: v.barcode || "",
            trendyol_psf: v.trendyol_psf?.toString() || "",
            trendyol_price: v.trendyol_price?.toString() || "",
            value: v.variant_options?.value,
            image_url: v.image_url || "",
          })) || [],
          (v) => v.value
        ),
        variants_have_images:
          initialData.product_variants?.some((v: any) => v.image_url) || false,
      });
    }
  }, [initialData]);

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = tagInput.trim().replace(",", "");
      if (tag && !formData.tags.includes(tag)) {
        setFormData({ ...formData, tags: [...formData.tags, tag] });
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tagToRemove) });
  };

  function handleImageDragOver(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === toIdx) return;
    const imgs = [...formData.images];
    const [moved] = imgs.splice(dragIndex, 1);
    imgs.splice(toIdx, 0, moved);
    setFormData((p) => ({ ...p, images: imgs }));
    setDragIndex(toIdx);
  }

  async function fetchMetadata() {
    const [cats, brnds, vgrps] = await Promise.all([
      supabase.from("categories").select("id, name"),
      supabase.from("brands").select("id, name"),
      supabase.from("variant_groups").select("id, name, variant_options(id, value)"),
    ]);
    setCategories(cats.data || []);
    setBrands(brnds.data || []);
    setVariantGroups(vgrps.data || []);
  }

  const turkishToSlug = (text: string) => {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[ğĞ]/g, "g")
      .replace(/[üÜ]/g, "u")
      .replace(/[şŞ]/g, "s")
      .replace(/[ıİ]/g, "i")
      .replace(/[öÖ]/g, "o")
      .replace(/[çÇ]/g, "c")
      .replace(/[^\w-]+/g, "")
      .replace(/--+/g, "-");
  };

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newImages = [...formData.images];
      for (const file of Array.from(files)) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { error: uploadError } = await supabase.storage.from("product-images").upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(filePath);
        newImages.push(publicUrl);
      }
      setFormData((prev) => ({ ...prev, images: newImages }));
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Görsel yüklenirken hata oluştu.");
    } finally {
      setUploading(false);
    }
  }

  async function handleVariantImageUpload(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVariantIdx(idx);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `products/variants/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(filePath, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(filePath);
      handleVariantChange(idx, "image_url", publicUrl);
    } catch {
      alert("Görsel yüklenirken hata oluştu.");
    } finally {
      setUploadingVariantIdx(null);
    }
  }

  function handleVariantChange(index: number, field: string, value: any) {
    const newVariants = [...formData.variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setFormData((prev) => ({ ...prev, variants: newVariants }));
  }

  function handleGroupSelect(groupId: string) {
    const group = variantGroups.find((g) => g.id === groupId);
    if (!group) return;

    const initialVariants = sortByVariantValue(group.variant_options, (o: any) => o.value).map((opt: any) => ({
      variant_option_id: opt.id,
      value: opt.value,
      sku: "",
      barcode: "",
      price: formData.price || "0",
      compare_at_price: "",
      stock: "0",
      trendyol_psf: "",
      trendyol_price: "",
      is_active: true,
      image_url: "",
    }));

    setFormData((prev) => ({ ...prev, selected_group_id: groupId, variants: initialVariants }));
  }

  async function handleClone() {
    if (!confirm("Bu ürünü kopyalamak istediğinize emin misiniz?")) return;

    setLoading(true);
    try {
      const baseTitle = `${formData.title} (Kopya)`;
      const baseSlug = `${turkishToSlug(formData.title)}-kopya-${Math.random().toString(36).substring(2, 7)}`;

      const payload = {
        title: baseTitle,
        slug: baseSlug,
        price: parseFloat(formData.price) || 0,
        stock: parseInt(formData.stock) || 0,
        category_id: formData.category_id || null,
        brand_id: formData.brand_id || null,
        short_description: formData.short_description,
        description: formData.description,
        images: formData.images,
        tags: formData.tags,
        is_active: false,
        has_variants: formData.has_variants,
      };

      const { data, error } = await supabase.from("products").insert(payload).select().single();
      if (error) throw error;

      const newProductId = data.id;

      if (formData.has_variants && newProductId) {
        const variantsPayload = formData.variants.map((v) => ({
          product_id: newProductId,
          variant_option_id: v.variant_option_id,
          sku: `${v.sku || `${baseTitle.slice(0, 3)}-${v.value}`}-${Math.random().toString(36).substring(2, 5)}`,
          barcode: v.barcode || null,
          price: parseFloat(v.price) || 0,
          compare_at_price: v.compare_at_price !== "" ? parseFloat(v.compare_at_price) : null,
          stock: parseInt(v.stock) || 0,
          trendyol_psf: v.trendyol_psf !== "" ? parseFloat(v.trendyol_psf) : null,
          trendyol_price: v.trendyol_price !== "" ? parseFloat(v.trendyol_price) : null,
          is_active: v.is_active,
          image_url: formData.variants_have_images ? (v.image_url || null) : null,
        }));

        const { data: savedVariants, error: variantError } = await supabase.from("product_variants").insert(variantsPayload).select();
        if (variantError) throw variantError;
      }

      alert("Ürün başarıyla kopyalandı. Yeni ürüne yönlendiriliyorsunuz.");
      router.push(`/admin/products/${newProductId}`);
      router.refresh();
    } catch (error: any) {
      alert("Kopyalama sırasında hata oluştu: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const slug = turkishToSlug(formData.title);
      const payload = {
        title: formData.title,
        slug: slug,
        price: parseFloat(formData.price) || 0,
        stock: parseInt(formData.stock) || 0,
        category_id: formData.category_id || null,
        brand_id: formData.brand_id || null,
        short_description: formData.short_description,
        description: formData.description,
        images: formData.images,
        tags: formData.tags,
        is_active: formData.is_active,
        has_variants: formData.has_variants,
      };

      let finalId = productId;

      if (productId) {
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select().single();
        if (error) throw error;
        finalId = data.id;
      }

      if (formData.has_variants && finalId) {
        // Mevcut varyasyonları sil (cascade ile variant_tag_assignments da silinir)
        if (productId) {
          await supabase.from("product_variants").delete().eq("product_id", productId);
        }

        const variantsPayload = formData.variants.map((v) => ({
          product_id: finalId,
          variant_option_id: v.variant_option_id,
          sku: v.sku || `${formData.title.slice(0, 3)}-${v.value}`,
          barcode: v.barcode || null,
          price: parseFloat(v.price) || 0,
          compare_at_price: v.compare_at_price !== "" ? parseFloat(v.compare_at_price) : null,
          stock: parseInt(v.stock) || 0,
          trendyol_psf: v.trendyol_psf !== "" ? parseFloat(v.trendyol_psf) : null,
          trendyol_price: v.trendyol_price !== "" ? parseFloat(v.trendyol_price) : null,
          is_active: v.is_active,
          image_url: formData.variants_have_images ? (v.image_url || null) : null,
        }));

        const { data: savedVariants, error: variantError } = await supabase
          .from("product_variants")
          .insert(variantsPayload)
          .select();
        if (variantError) throw variantError;
      }

      router.push("/admin/products");
      router.refresh();
    } catch (error: any) {
      alert("Hata: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10 pb-20">
      {/* ── Sticky Header ── */}
      <div className="flex items-center justify-between sticky top-0 z-20 bg-white/80 backdrop-blur-md py-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/admin/products" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">{productId ? "Ürünü Düzenle" : "Yeni Ürün Ekle"}</h1>
            <p className="text-sm text-muted-foreground">{formData.title || "Ürün Detayları"}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>Vazgeç</Button>
          {productId && (
            <Button type="button" variant="secondary" onClick={handleClone} className="font-bold gap-2 px-6" disabled={loading}>
              <Copy size={16} /> Ürünü Kopyala
            </Button>
          )}
          <Button type="submit" disabled={loading || uploading} className="bg-blue-600 hover:bg-blue-700 font-bold px-8">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {productId ? "Değişiklikleri Kaydet" : "Ürünü Oluştur"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-6">
        {/* ── Left column ── */}
        <div className="space-y-6">
          {/* Temel Bilgiler */}
          <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
              Temel Bilgiler
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Ürün Adı</label>
                <Input
                  required
                  className="h-12 text-lg font-medium"
                  placeholder="Ürün adını girin..."
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Kısa Açıklama</label>
                <textarea
                  className="flex min-h-[110px] w-full rounded-2xl border-2 border-slate-100 bg-slate-50/30 px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all font-medium"
                  placeholder="Ürünün üst kısmında görünecek kısa tanıtım..."
                  value={formData.short_description}
                  onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                />
                <p className="text-xs text-slate-400">Ürün sayfasında başlığın altında, varyasyon/sepet bölümünden önce görünür.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Detaylı Açıklama</label>
                <textarea
                  className="flex min-h-[400px] w-full rounded-2xl border-2 border-slate-100 bg-slate-50/30 px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all font-medium"
                  placeholder="Ürünün detaylı açıklaması (sayfanın en altında görünür)..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
                <p className="text-xs text-slate-400">Müşteri yorumlarının altında, sayfanın en altında görünür.</p>
              </div>
            </div>
          </section>

          {/* Varyasyonlar */}
          <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
                Varyasyonlar
              </h3>
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
                <input
                  type="checkbox"
                  id="has_variants_check"
                  className="h-4 w-4 rounded pointer-events-auto"
                  checked={formData.has_variants}
                  onChange={(e) => setFormData({ ...formData, has_variants: e.target.checked })}
                />
                <label htmlFor="has_variants_check" className="text-xs font-bold select-none cursor-pointer">
                  Varyasyonlu Ürün
                </label>
              </div>
            </div>

            {formData.has_variants ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Varyasyon Grubu</label>
                  <select
                    className="flex h-12 w-full rounded-xl border border-input bg-slate-50/50 px-3 py-2 text-sm"
                    value={formData.selected_group_id}
                    onChange={(e) => handleGroupSelect(e.target.value)}
                  >
                    <option value="">Grup Seçin...</option>
                    {variantGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                {formData.variants.length > 0 && (
                  <>
                    <div className="border rounded-2xl overflow-x-auto shadow-sm">
                      <Table className="table-fixed w-full text-sm">
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="w-14 text-center">Değer</TableHead>
                            <TableHead className="w-24">
                              <span className="flex flex-col leading-tight">
                                <span className="line-through decoration-red-400">PSF (₺)</span>
                                <span className="text-[10px] font-normal text-slate-400 no-underline">Üstü Çizili</span>
                              </span>
                            </TableHead>
                            <TableHead className="w-24">Fiyat (₺)</TableHead>
                            <TableHead className="w-16">Stok</TableHead>
                            <TableHead className="w-32">SKU</TableHead>
                            <TableHead className="w-32">Barkod</TableHead>
                            <TableHead className="w-28">
                              <span className="flex flex-col leading-tight">
                                <span>T. PSF</span>
                                <span className="text-[10px] font-normal text-slate-400">Piy. Satış</span>
                              </span>
                            </TableHead>
                            <TableHead className="w-28">
                              <span className="flex flex-col leading-tight">
                                <span>T. Fiyat</span>
                                <span className="text-[10px] font-normal text-slate-400">Satış Fiy.</span>
                              </span>
                            </TableHead>
                            <TableHead className="w-10 text-center">Aktif</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.variants.map((v, idx) => (
                            <TableRow key={v.id || idx}>
                              <TableCell className="font-black text-blue-600 text-center">{v.value}</TableCell>
                              <TableCell>
                                <Input type="number" step="0.01" className="h-8 w-full px-2 text-sm text-slate-400" placeholder="—" value={v.compare_at_price} onChange={(e) => handleVariantChange(idx, "compare_at_price", e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Input type="number" step="0.01" className="h-8 w-full px-2 text-sm" value={v.price} onChange={(e) => handleVariantChange(idx, "price", e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Input type="number" className="h-8 w-full px-2 text-sm" value={v.stock} onChange={(e) => handleVariantChange(idx, "stock", e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 w-full px-2 text-sm" value={v.sku} onChange={(e) => handleVariantChange(idx, "sku", e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 w-full px-2 text-sm" value={v.barcode} onChange={(e) => handleVariantChange(idx, "barcode", e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Input type="number" step="0.01" className="h-8 w-full px-2 text-sm" placeholder="—" value={v.trendyol_psf} onChange={(e) => handleVariantChange(idx, "trendyol_psf", e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Input type="number" step="0.01" className="h-8 w-full px-2 text-sm" placeholder="—" value={v.trendyol_price} onChange={(e) => handleVariantChange(idx, "trendyol_price", e.target.value)} />
                              </TableCell>
                              <TableCell className="text-center">
                                <input type="checkbox" checked={v.is_active} onChange={(e) => handleVariantChange(idx, "is_active", e.target.checked)} className="h-4 w-4" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* ── Varyasyon görseli sorusu ── */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-slate-50 rounded-2xl border">
                      <span className="text-sm font-medium shrink-0">Her varyasyon için farklı fotoğraf var mı?</span>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="variants_have_images"
                            checked={!formData.variants_have_images}
                            onChange={() => setFormData({ ...formData, variants_have_images: false })}
                            className="h-4 w-4"
                          />
                          <span className="text-sm text-slate-600">Hayır — aynı fotoğrafı kullanır</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="variants_have_images"
                            checked={formData.variants_have_images}
                            onChange={() => setFormData({ ...formData, variants_have_images: true })}
                            className="h-4 w-4"
                          />
                          <span className="text-sm text-slate-600">Evet — her varyasyonun ayrı fotoğrafı var</span>
                        </label>
                      </div>
                    </div>

                    {/* ── Per-variant image grid ── */}
                    {formData.variants_have_images && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <p className="text-sm font-medium text-slate-700">Varyasyon Fotoğrafları</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {formData.variants.map((v, idx) => (
                            <div key={v.id || idx} className="space-y-2">
                              <p className="text-xs font-bold text-blue-600 text-center truncate">{v.value}</p>
                              <div className="relative aspect-square rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden group hover:border-blue-400 transition-colors">
                                {v.image_url ? (
                                  <>
                                    <img src={v.image_url} alt={v.value} className="w-full h-full object-cover" />
                                    <button
                                      type="button"
                                      onClick={() => handleVariantChange(idx, "image_url", "")}
                                      className="absolute top-1.5 right-1.5 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow"
                                    >
                                      <X size={10} />
                                    </button>
                                  </>
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400 group-hover:text-blue-500 transition-colors">
                                    {uploadingVariantIdx === idx ? (
                                      <Loader2 size={20} className="animate-spin" />
                                    ) : (
                                      <>
                                        <ImagePlus size={20} />
                                        <span className="text-[10px] font-bold">Fotoğraf Ekle</span>
                                      </>
                                    )}
                                  </div>
                                )}
                                {uploadingVariantIdx !== idx && (
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={(e) => handleVariantImageUpload(idx, e)}
                                    disabled={uploadingVariantIdx !== null}
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-6 animate-in fade-in">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fiyat (₺)</label>
                  <Input type="number" step="0.01" className="h-12" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Stok Adedi</label>
                  <Input type="number" className="h-12" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-4">
          {/* Yayınlama */}
          <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
              Yayınlama
            </h3>
            <div className="space-y-4">
              <div className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${formData.is_active ? "border-green-100 bg-green-50" : "border-slate-100 bg-slate-50"}`}>
                <span className={`text-sm font-bold ${formData.is_active ? "text-green-700" : "text-slate-500"}`}>
                  {formData.is_active ? "SATIŞA AÇIK" : "TASLAK / GİZLİ"}
                </span>
                <input
                  type="checkbox"
                  className="h-6 w-6 rounded-full"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
              </div>
              <div className="space-y-2 pt-2 text-xs text-slate-500 italic p-2 bg-blue-50 rounded-xl">
                * Ürün yayınlandığında mağazada görünecektir.
              </div>
            </div>
          </section>

          {/* Organizasyon */}
          <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
              Organizasyon
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Kategori</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-slate-50/50 px-3 py-2 text-sm"
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                >
                  <option value="">Kategori Seçin</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Marka</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-slate-50/50 px-3 py-2 text-sm"
                  value={formData.brand_id}
                  onChange={(e) => setFormData({ ...formData, brand_id: e.target.value })}
                >
                  <option value="">Marka Seçin</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Görseller */}
          <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
              Görseller
            </h3>
            <p className="text-[11px] text-slate-400">Sürükle-bırak ile sıralayın. İlk görsel kapak fotoğrafı olur.</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Yükleme butonu */}
              <div className="relative aspect-square border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer group">
                {uploading ? <Loader2 size={24} className="animate-spin text-blue-600" /> : <Upload size={24} className="text-slate-400 group-hover:text-blue-600 transition-colors" />}
                <span className="text-[10px] font-bold text-slate-500 text-center px-2">Görsel Yükle</span>
                <input type="file" multiple accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} disabled={uploading} />
              </div>

              {/* Görseller — sürükle/bırak sırala */}
              {formData.images.map((url, idx) => (
                <div
                  key={url}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => handleImageDragOver(e, idx)}
                  onDragEnd={() => setDragIndex(null)}
                  className={cn(
                    "relative aspect-square rounded-2xl overflow-hidden border group shadow-sm cursor-grab active:cursor-grabbing transition-all",
                    dragIndex === idx ? "opacity-40 scale-95 border-blue-400 border-2" : "hover:scale-[1.02]"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" />

                  {/* Kapak rozeti */}
                  {idx === 0 && (
                    <span className="absolute bottom-1.5 left-1.5 text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-full shadow">
                      KAPAK
                    </span>
                  )}

                  {/* Sıra numarası */}
                  <span className="absolute top-1.5 left-1.5 text-[9px] font-black bg-black/40 text-white w-4 h-4 rounded-full flex items-center justify-center">
                    {idx + 1}
                  </span>

                  {/* Drag handle */}
                  <div className="absolute top-1.5 right-7 p-0.5 bg-black/30 text-white rounded opacity-0 group-hover:opacity-100 transition-all">
                    <GripVertical size={11} />
                  </div>

                  {/* Sil butonu */}
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                    className="absolute top-1.5 right-1.5 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Etiketler (SEO/arama) */}
          <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
              Etiketler
            </h3>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 min-h-[40px] p-2 rounded-2xl border-2 border-slate-100 bg-slate-50/30">
                {formData.tags.map((tag, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[11px] font-bold">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-blue-900 transition-colors">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {formData.tags.length === 0 && <span className="text-[11px] text-slate-400 italic">Etiket yok...</span>}
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="Etiket ekle..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  className="h-10 rounded-xl text-sm"
                />
              </div>
            </div>
          </section>

        </div>
      </div>
    </form>
  );
}
