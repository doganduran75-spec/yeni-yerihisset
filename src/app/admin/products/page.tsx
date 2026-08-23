"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Plus, Edit, Trash2, Search, Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatPriceDisplay } from "@/lib/product-price";

type Product = {
  id: string;
  title: string;
  price: number;
  stock: number;
  is_active: boolean;
  category: { id: string, name: string } | null;
  brand: { id: string, name: string } | null;
  images: string[];
  description?: string;
  has_variants: boolean;
  product_variants?: { price: number; is_active: boolean | null }[];
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchBrands();
  }, []);

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('id, name');
    setCategories(data || []);
  }

  async function fetchBrands() {
    const { data } = await supabase.from('brands').select('id, name');
    setBrands(data || []);
  }

  async function fetchProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          title,
          price,
          stock,
          is_active,
          has_variants,
          categories(id, name),
          brands(id, name),
          description,
          images,
          product_variants(price, is_active)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted = (data as any[]).map(item => ({
        ...item,
        category: item.categories,
        brand: item.brands
      }));
      setProducts(formatted || []);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory ? (p.category as any)?.id === selectedCategory : true;
    const matchesBrand = selectedBrand ? (p.brand as any)?.id === selectedBrand : true;
    return matchesSearch && matchesCategory && matchesBrand;
  });

  async function handleExportExcel() {
    setExporting(true);
    try {
      // Tüm varyantları tam detayıyla çek
      const { data, error } = await (supabase as any)
        .from("products")
        .select(`
          title,
          is_active,
          categories(name),
          brands(name),
          product_variants(
            sku,
            barcode,
            price,
            compare_at_price,
            stock,
            trendyol_psf,
            trendyol_price,
            is_active,
            variant_options(value)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows: Record<string, string | number>[] = [];

      for (const product of (data as any[])) {
        const variants: any[] = product.product_variants ?? [];

        if (variants.length === 0) {
          // Varyant yoksa ürün bazında tek satır
          rows.push({
            "SKU": "",
            "Ürün Adı": product.title ?? "",
            "Değer": "",
            "Stok": "",
            "Fiyat": "",
            "Barkod": "",
            "T.PSF": "",
            "T.Fiyat": "",
            "Aktif mi?": product.is_active ? "Evet" : "Hayır",
          });
        } else {
          for (const v of variants) {
            rows.push({
              "SKU": v.sku ?? "",
              "Ürün Adı": product.title ?? "",
              "Değer": v.variant_options?.value ?? "",
              "Stok": v.stock ?? 0,
              "Fiyat": v.price ?? "",
              "Barkod": v.barcode ?? "",
              "T.PSF": v.trendyol_psf ?? "",
              "T.Fiyat": v.trendyol_price ?? "",
              "Aktif mi?": v.is_active === false ? "Hayır" : "Evet",
            });
          }
        }
      }

      // xlsx ile dosya oluştur — dinamik import (SSR güvenliği)
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ["SKU", "Ürün Adı", "Değer", "Stok", "Fiyat", "Barkod", "T.PSF", "T.Fiyat", "Aktif mi?"],
      });

      // Sütun genişlikleri
      ws["!cols"] = [
        { wch: 18 }, // SKU
        { wch: 40 }, // Ürün Adı
        { wch: 14 }, // Değer
        { wch: 8  }, // Stok
        { wch: 10 }, // Fiyat
        { wch: 16 }, // Barkod
        { wch: 10 }, // T.PSF
        { wch: 10 }, // T.Fiyat
        { wch: 10 }, // Aktif mi?
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ürünler");

      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `yerihisset-urunler-${date}.xlsx`);
    } catch (err) {
      console.error("Export hatası:", err);
      alert("Excel dışa aktarma sırasında hata oluştu.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteProduct(id: string, title: string) {
    if (!confirm(`"${title}" ürününü silmek istediğinize emin misiniz?`)) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      fetchProducts();
    } catch (error: any) {
      console.error("Error deleting product:", error);
      // FK kısıtı: ürün sipariş geçmişine bağlı, silinemez
      if (error?.code === "23503") {
        const deactivate = confirm(
          `"${title}" ürününün sipariş geçmişi bulunduğu için silinemez.\n\nBunun yerine ürünü pasife almak ister misiniz? (Mağazada görünmez, siparişler korunur)`
        );
        if (deactivate) {
          const { error: deactivateError } = await supabase
            .from('products')
            .update({ is_active: false })
            .eq('id', id);
          if (deactivateError) {
            alert("Hata: " + deactivateError.message);
          } else {
            fetchProducts();
          }
        }
      } else {
        alert("Silme hatası: " + (error?.message || "Bilinmeyen hata"));
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
           <h2 className="text-3xl font-bold tracking-tight">Ürünler</h2>
           <p className="text-muted-foreground">Mağazanızdaki tüm ürünleri yönetin.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
            onClick={handleExportExcel}
            disabled={exporting || loading}
          >
            {exporting
              ? <><Loader2 size={15} className="animate-spin" /> Hazırlanıyor…</>
              : <><Download size={15} /> Excel İndir</>}
          </Button>
          <Link href="/admin/products/new">
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Plus size={16} /> Yeni Ürün Ekle
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative">
          <Input 
            placeholder="Ürün ara..." 
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /> 
        </div>
        <select 
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="">Tüm Kategoriler</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select 
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedBrand}
          onChange={(e) => setSelectedBrand(e.target.value)}
        >
          <option value="">Tüm Markalar</option>
          {brands.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle>Ürün Listesi</CardTitle>
          <CardDescription>Sistemdeki tüm ürünleriniz burada listelenir.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">Yükleniyor...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg">
               Kriterlere uygun ürün bulunamadı.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün Adı</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Fiyat</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.title}</TableCell>
                    <TableCell>{product.brand?.name || '-'}</TableCell>
                    <TableCell>{product.category?.name || 'Kategorisiz'}</TableCell>
                    <TableCell>{formatPriceDisplay(product)}</TableCell>
                    <TableCell>
                      {product.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-bold text-green-700 ring-1 ring-inset ring-green-600/20">AKTİF</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-inset ring-slate-600/20">PASİF</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/products/${product.id}`}>
                          <Button variant="outline" size="sm" className="h-8 px-3 border-blue-100 text-blue-600 hover:bg-blue-50">
                            <Edit size={14} className="mr-1" /> Düzenle
                          </Button>
                        </Link>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteProduct(product.id, product.title)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
