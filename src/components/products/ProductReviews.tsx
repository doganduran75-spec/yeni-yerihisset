"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Star, MessageSquare, Loader2, User } from "lucide-react";

interface Review {
  id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
  images: string[];
}

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function fetchReviews() {
    setLoading(true);

    // Ayar: tüm yorumlar mı, ürüne özel mi?
    const { data: settingRow } = await (supabase as any)
      .from("settings")
      .select("product_reviews_show_all")
      .limit(1)
      .maybeSingle();
    const showAll = settingRow?.product_reviews_show_all ?? true;

    let query = (supabase as any)
      .from("order_reviews")
      .select(
        "id, comment, rating_shipping, rating_quality, rating_communication, images, created_at, profiles(first_name, last_name)"
      )
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (!showAll) query = query.eq("product_id", productId);

    const { data } = await query;

    const formatted: Review[] = ((data as any[]) ?? []).map((r) => {
      const nums = [r.rating_shipping, r.rating_quality, r.rating_communication].filter(
        (x) => typeof x === "number"
      ) as number[];
      const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 5;
      const p = r.profiles as { first_name?: string; last_name?: string } | null;
      const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Müşteri";
      return {
        id: r.id,
        user_name: name,
        rating: avg,
        comment: r.comment || "",
        created_at: r.created_at || new Date().toISOString(),
        images: Array.isArray(r.images) ? r.images : [],
      };
    });

    setReviews(formatted);
    setLoading(false);
  }

  const averageRating =
    reviews.length > 0
      ? reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length
      : 0;

  return (
    <div className="space-y-8 mt-16 pt-16 border-t border-slate-100">
      <div className="space-y-2">
        <h3 className="text-2xl font-black text-slate-900">Müşteri Yorumları</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center text-yellow-500">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                size={20}
                fill={s <= Math.round(averageRating) ? "currentColor" : "none"}
                className={s <= Math.round(averageRating) ? "text-yellow-500" : "text-slate-200"}
              />
            ))}
          </div>
          <span className="text-lg font-bold">{averageRating.toFixed(1)}</span>
          <span className="text-slate-400">({reviews.length} Değerlendirme)</span>
        </div>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-4">
            <Loader2 className="animate-spin" size={32} />
            <p>Yorumlar yükleniyor...</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed text-slate-400 space-y-4">
            <MessageSquare size={48} className="opacity-20" />
            <p className="font-medium">Henüz yorum yapılmamış.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                      <User size={20} />
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-900">{review.user_name}</h5>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        {new Date(review.created_at).toLocaleDateString("tr-TR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center text-yellow-500 gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={14}
                        fill={s <= review.rating ? "currentColor" : "none"}
                        className={s <= review.rating ? "text-yellow-500" : "text-slate-100"}
                      />
                    ))}
                  </div>
                </div>

                {review.comment && (
                  <p className="text-slate-600 leading-relaxed italic">&quot;{review.comment}&quot;</p>
                )}

                {review.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {review.images.map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={img}
                        alt={`Yorum görseli ${i + 1}`}
                        className="w-20 h-20 object-cover rounded-xl border border-slate-100"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
