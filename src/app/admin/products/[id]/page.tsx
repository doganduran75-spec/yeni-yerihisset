"use client";

import { useEffect, useState, use } from "react";
import { supabase } from "@/lib/supabase";
import ProductForm from "@/components/admin/products/ProductForm";
import { Loader2 } from "lucide-react";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProduct() {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          product_variants(
            id,
            sku,
            price,
            compare_at_price,
            stock,
            barcode,
            is_active,
            variant_option_id,
            trendyol_psf,
            trendyol_price,
            variant_options(value)
          )
        `)
        .eq('id', id)
        .single();

      if (data) setProduct(data);
      setLoading(false);
    }
    fetchProduct();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="text-slate-500 font-medium">Ürün bilgileri yükleniyor...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Ürün bulunamadı.</h1>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <ProductForm productId={id} initialData={product} />
    </div>
  );
}
