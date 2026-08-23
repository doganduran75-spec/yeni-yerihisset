"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Star, CheckCircle2, XCircle, Clock, Loader2, Eye, ChevronDown, ChevronUp,
  MessageSquare, Filter, Image as ImageIcon,
} from "lucide-react";

type Review = {
  id: string;
  order_id: string;
  user_id: string;
  rating_shipping: number;
  rating_quality: number;
  rating_communication: number;
  comment: string | null;
  images: string[];
  is_approved: boolean;
  admin_note: string | null;
  created_at: string;
  orders: {
    order_number: number | null;
  } | null;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

type FilterType = "all" | "pending" | "approved" | "rejected";

function StarRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-28 shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={13}
            className={i <= value ? "fill-amber-400 text-amber-400" : "text-slate-200"}
          />
        ))}
      </div>
      <span className="text-xs font-bold text-slate-700">{value}/5</span>
    </div>
  );
}

function avgRating(r: Review) {
  return ((r.rating_shipping + r.rating_quality + r.rating_communication) / 3).toFixed(1);
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from("order_reviews")
        .select(`
          id, order_id, user_id,
          rating_shipping, rating_quality, rating_communication,
          comment, images, is_approved, admin_note, created_at,
          orders (order_number),
          profiles (first_name, last_name, email)
        `)
        .order("created_at", { ascending: false });

      if (filter === "pending") query = query.eq("is_approved", false).is("admin_note", null);
      else if (filter === "approved") query = query.eq("is_approved", true);
      else if (filter === "rejected") query = query.eq("is_approved", false).not("admin_note", "is", null);

      const { data, error } = await query;
      if (!error) setReviews((data as Review[]) || []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  async function approveReview(id: string) {
    setActionLoading(id);
    await (supabase as any)
      .from("order_reviews")
      .update({ is_approved: true, admin_note: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    setActionLoading(null);
    fetchReviews();
  }

  async function rejectReview(id: string) {
    const note = adminNotes[id]?.trim() || "Yayınlanmadı";
    setActionLoading(id);
    await (supabase as any)
      .from("order_reviews")
      .update({ is_approved: false, admin_note: note, updated_at: new Date().toISOString() })
      .eq("id", id);
    setActionLoading(null);
    fetchReviews();
  }

  async function saveAdminNote(id: string) {
    const note = adminNotes[id] ?? "";
    await (supabase as any)
      .from("order_reviews")
      .update({ admin_note: note || null, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  const pendingCount = reviews.filter((r) => !r.is_approved && !r.admin_note).length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Ürün Yorumları</h2>
          <p className="text-muted-foreground">Müşteri yorumlarını inceleyin, onaylayın veya reddedin.</p>
        </div>
        {filter === "pending" && pendingCount > 0 && (
          <Badge className="bg-amber-500 text-white text-sm px-3 py-1 rounded-full">
            {pendingCount} onay bekliyor
          </Badge>
        )}
      </div>

      {/* Filtre bar */}
      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
              filter === f
                ? "bg-olive-600 text-white border-olive-600 shadow-sm"
                : "bg-white text-slate-600 border-slate-200 hover:border-olive-300"
            }`}
          >
            {f === "pending" && <Clock size={14} />}
            {f === "approved" && <CheckCircle2 size={14} />}
            {f === "rejected" && <XCircle size={14} />}
            {f === "all" && <Filter size={14} />}
            {f === "pending" ? "Onay Bekleyenler" :
             f === "approved" ? "Onaylananlar" :
             f === "rejected" ? "Reddedilenler" : "Tümü"}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="animate-spin h-7 w-7 text-muted-foreground" />
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Bu kategoride yorum bulunamadı.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => {
            const isExpanded = expandedId === review.id;
            const isLoading = actionLoading === review.id;
            const avg = avgRating(review);
            const customerName = [review.profiles?.first_name, review.profiles?.last_name].filter(Boolean).join(" ") || "—";

            return (
              <Card
                key={review.id}
                className={`transition-all ${
                  !review.is_approved && !review.admin_note
                    ? "border-amber-200 shadow-sm"
                    : review.is_approved
                    ? "border-green-100"
                    : "border-red-100 opacity-75"
                }`}
              >
                {/* Üst satır */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
                  onClick={() => setExpandedId(isExpanded ? null : review.id)}
                >
                  {/* Durum noktası */}
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    review.is_approved ? "bg-green-500" :
                    review.admin_note ? "bg-red-400" :
                    "bg-amber-400 animate-pulse"
                  }`} />

                  {/* Müşteri + sipariş */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{customerName}</span>
                      {review.orders?.order_number && (
                        <span className="text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          YH{review.orders.order_number}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {new Date(review.created_at).toLocaleDateString("tr-TR", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </span>
                    </div>
                    {review.comment && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{review.comment}</p>
                    )}
                  </div>

                  {/* Ortalama puan */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    <span className="text-sm font-bold text-slate-700">{avg}</span>
                  </div>

                  {/* Durum badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    review.is_approved ? "bg-green-100 text-green-700" :
                    review.admin_note ? "bg-red-50 text-red-600" :
                    "bg-amber-50 text-amber-700"
                  }`}>
                    {review.is_approved ? "Onaylı" : review.admin_note ? "Reddedildi" : "Bekliyor"}
                  </span>

                  {review.images?.length > 0 && (
                    <ImageIcon size={14} className="text-slate-300 shrink-0" />
                  )}

                  {isExpanded ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                </div>

                {/* Genişletilmiş içerik */}
                {isExpanded && (
                  <div className="border-t px-5 pb-5 pt-4 space-y-4">
                    {/* Puanlar */}
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                      <StarRow label="Kargo & Teslimat" value={review.rating_shipping} />
                      <StarRow label="Ürün Kalitesi" value={review.rating_quality} />
                      <StarRow label="İletişim" value={review.rating_communication} />
                    </div>

                    {/* Yorum metni */}
                    {review.comment && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">Yorum</p>
                        <p className="text-sm text-slate-700 bg-white border rounded-lg px-4 py-3 leading-relaxed">
                          {review.comment}
                        </p>
                      </div>
                    )}

                    {/* Görseller */}
                    {review.images?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Görseller</p>
                        <div className="flex gap-2 flex-wrap">
                          {review.images.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setLightboxImg(url)}
                              className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 hover:border-olive-400 transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Müşteri bilgisi */}
                    <div className="text-xs text-slate-400">
                      <span className="font-medium text-slate-500">Email:</span> {review.profiles?.email ?? "—"}
                    </div>

                    {/* Admin notu */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500">Admin Notu (ret sebebi)</label>
                      <textarea
                        rows={2}
                        placeholder="Reddetme gerekçesi veya iç not…"
                        value={adminNotes[review.id] ?? (review.admin_note || "")}
                        onChange={(e) => setAdminNotes((prev) => ({ ...prev, [review.id]: e.target.value }))}
                        onBlur={() => saveAdminNote(review.id)}
                        className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-olive-400 resize-none bg-amber-50"
                      />
                    </div>

                    {/* Aksiyonlar */}
                    <div className="flex gap-2 pt-1">
                      {!review.is_approved && (
                        <Button
                          size="sm"
                          className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                          disabled={isLoading}
                          onClick={() => approveReview(review.id)}
                        >
                          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                          Onayla
                        </Button>
                      )}
                      {review.is_approved && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                          disabled={isLoading}
                          onClick={() => rejectReview(review.id)}
                        >
                          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                          Onayı Kaldır
                        </Button>
                      )}
                      {!review.is_approved && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                          disabled={isLoading}
                          onClick={() => rejectReview(review.id)}
                        >
                          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                          Reddet
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxImg}
            alt=""
            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 rounded-full p-2"
            onClick={() => setLightboxImg(null)}
          >
            <XCircle size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
