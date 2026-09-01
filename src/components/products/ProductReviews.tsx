"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Star, MessageSquare, Loader2, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "../ui/textarea";

interface Review {
  id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newReview, setNewReview] = useState({
    user_name: "",
    rating: 5,
    comment: ""
  });

  useEffect(() => {
    fetchReviews();
  }, [productId]);

  async function fetchReviews() {
    const { data } = await supabase
      .from("product_reviews")
      .select("*")
      .eq("product_id", productId)
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (data) {
      const formattedReviews: Review[] = data.map(r => ({
        id: r.id,
        user_name: r.user_name || "Anonim",
        rating: r.rating || 5,
        comment: r.comment || "",
        created_at: r.created_at || new Date().toISOString()
      }));
      setReviews(formattedReviews);
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newReview.comment || !newReview.user_name) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("product_reviews").insert([{
        product_id: productId,
        user_name: newReview.user_name,
        rating: newReview.rating,
        comment: newReview.comment,
        is_approved: true // For now keep it true as requested for "activation"
      }]);

      if (error) throw error;
      
      setNewReview({ user_name: "", rating: 5, comment: "" });
      fetchReviews();
    } catch (error) {
      console.error("Error submitting review:", error);
      alert("Yorum gönderilirken hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  }

  const averageRating = reviews.length > 0 
    ? reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length 
    : 0;

  return (
    <div className="space-y-12 mt-16 pt-16 border-t border-slate-100">
      <div className="grid md:grid-cols-3 gap-12">
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-slate-900">Müşteri Yorumları</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center text-yellow-500">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={20} fill={s <= Math.round(averageRating) ? "currentColor" : "none"} className={s <= Math.round(averageRating) ? "text-yellow-500" : "text-slate-200"} />
                ))}
              </div>
              <span className="text-lg font-bold">{averageRating.toFixed(1)}</span>
              <span className="text-slate-400">({reviews.length} Değerlendirme)</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="bg-slate-50 p-6 rounded-3xl space-y-4 border border-slate-100">
            <h4 className="font-bold text-slate-900">Yorum Yaz</h4>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Adınız</label>
              <Input
                placeholder="Adınız Soyadınız"
                value={newReview.user_name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewReview({...newReview, user_name: e.target.value})}
                required
                onInvalid={(e) => (e.currentTarget as HTMLInputElement).setCustomValidity("Lütfen adınızı yazın.")}
                onInput={(e) => (e.currentTarget as HTMLInputElement).setCustomValidity("")}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Puanınız</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNewReview({...newReview, rating: s})}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star size={24} fill={s <= newReview.rating ? "#EAB308" : "none"} className={s <= newReview.rating ? "text-yellow-500" : "text-slate-300"} />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Yorumunuz</label>
              <Textarea
                placeholder="Ürün hakkındaki düşünceleriniz..."
                value={newReview.comment}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewReview({...newReview, comment: e.target.value})}
                required
                onInvalid={(e) => (e.currentTarget as HTMLTextAreaElement).setCustomValidity("Lütfen yorumunuzu yazın.")}
                onInput={(e) => (e.currentTarget as HTMLTextAreaElement).setCustomValidity("")}
                className="min-h-[100px]"
              />
            </div>
            <Button disabled={submitting} type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-700 font-bold gap-2">
              {submitting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              Yorumu Gönder
            </Button>
          </form>
        </div>

        <div className="md:col-span-2 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-4">
              <Loader2 className="animate-spin" size={32} />
              <p>Yorumlar yükleniyor...</p>
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed text-slate-400 space-y-4">
              <MessageSquare size={48} className="opacity-20" />
              <p className="font-medium">Henüz yorum yapılmamış. İlk yorumu siz yapın!</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {reviews.map((review) => (
                <div key={review.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                        <User size={20} />
                      </div>
                      <div>
                        <h5 className="font-bold text-slate-900">{review.user_name}</h5>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(review.created_at).toLocaleDateString('tr-TR')}</p>
                      </div>
                    </div>
                    <div className="flex items-center text-yellow-500 gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} size={14} fill={s <= review.rating ? "currentColor" : "none"} className={s <= review.rating ? "text-yellow-500" : "text-slate-100"} />
                      ))}
                    </div>
                  </div>
                  <p className="text-slate-600 leading-relaxed italic">"{review.comment}"</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
