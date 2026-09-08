"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Edit, Trash2, Loader2, Video } from "lucide-react";
import RichTextEditor from "@/components/admin/RichTextEditor";

type KBArticle = {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  content: string;
  video_url: string;
  kb_categories: { name: string } | null;
};

type KBCategory = {
  id: string;
  name: string;
};

export default function KBArticlesPage() {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    category_id: "",
    content: "",
    video_url: "",
  });

  useEffect(() => {
    fetchArticles();
    fetchCategories();
  }, []);

  async function fetchCategories() {
    const { data } = await supabase
      .from("kb_categories")
      .select("id, name")
      .order("name");
    setCategories(data || []);
  }

  async function fetchArticles() {
    try {
      const { data, error } = await supabase
        .from("kb_articles")
        .select("*, kb_categories(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setArticles((data || []) as KBArticle[]);
    } catch (error) {
      console.error("Error fetching articles:", error);
    } finally {
      setLoading(false);
    }
  }

  const generateSlug = (text: string) =>
    text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "")
      .replace(/--+/g, "-");

  async function handleSave() {
    if (!formData.title || !formData.category_id) return;
    setSaving(true);
    try {
      const slug = generateSlug(formData.title);
      const payload = { ...formData, slug, updated_at: new Date().toISOString() };

      if (editingId) {
        await supabase.from("kb_articles").update(payload).eq("id", editingId);
      } else {
        await supabase.from("kb_articles").insert(payload);
      }
      setIsDialogOpen(false);
      resetForm();
      fetchArticles();
    } catch (error) {
      console.error("Error saving article:", error);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setFormData({ title: "", category_id: "", content: "", video_url: "" });
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu makaleyi silmek istediğinize emin misiniz?")) return;
    await supabase.from("kb_articles").delete().eq("id", id);
    fetchArticles();
  }

  function openEdit(article: KBArticle) {
    setEditingId(article.id);
    setFormData({
      title: article.title,
      category_id: article.category_id,
      content: article.content,
      video_url: article.video_url,
    });
    setIsDialogOpen(true);
  }

  // HTML içerikten düz metin özeti çıkar
  function plainText(html: string, len = 120): string {
    if (!html) return "";
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > len ? text.slice(0, len) + "…" : text;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Bilgi Bankası Makaleleri
          </h2>
          <p className="text-muted-foreground">
            Eğitici içerikler, kılavuzlar ve yardım videoları paylaşın.
          </p>
        </div>

        <Button
          onClick={() => {
            resetForm();
            setIsDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus size={16} /> Yeni Makale Ekle
        </Button>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {/* disablePointerDismissal → backdrop tıklamasında kapanmaz */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen} disablePointerDismissal>
        <DialogContent
          className="sm:max-w-[860px] max-h-[92vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Makaleyi Düzenle" : "Yeni Makale Ekle"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Başlık + Kategori */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Başlık</label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="Örn: Siparişimi nasıl takip ederim?"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Kategori</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-olive-600"
                  value={formData.category_id}
                  onChange={(e) =>
                    setFormData({ ...formData, category_id: e.target.value })
                  }
                >
                  <option value="">Kategori Seçin...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Video URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Video URL (YouTube / Vimeo vb.)
              </label>
              <Input
                value={formData.video_url}
                onChange={(e) =>
                  setFormData({ ...formData, video_url: e.target.value })
                }
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>

            {/* İçerik — Rich Text Editor */}
            <div className="space-y-2">
              <label className="text-sm font-medium">İçerik</label>
              <RichTextEditor
                value={formData.content}
                onChange={(html) => setFormData({ ...formData, content: html })}
                placeholder="Makale içeriğini buraya yazın..."
                minHeight={320}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                resetForm();
              }}
            >
              İptal
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.title || !formData.category_id}
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin mr-2" />
              ) : null}
              {editingId ? "Kaydet" : "Paylaş"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Makale Kartları ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array(3)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-xl bg-slate-100 animate-pulse"
              />
            ))
        ) : articles.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl border-slate-200 text-slate-400 font-medium">
            Henüz bir makale eklenmemiş.
          </div>
        ) : (
          articles.map((article) => (
            <Card
              key={article.id}
              className="group relative overflow-hidden border-slate-200 hover:border-olive-400 transition-all hover:shadow-lg"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-olive-600 bg-olive-50 px-2 py-1 rounded">
                    {article.kb_categories?.name || "Genel"}
                  </span>
                  {article.video_url && (
                    <Video size={14} className="text-slate-400" />
                  )}
                </div>
                <CardTitle className="text-lg leading-tight group-hover:text-olive-600 transition-colors">
                  {article.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500 line-clamp-3 mb-4">
                  {plainText(article.content)}
                </p>
                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-50">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(article)}
                  >
                    <Edit size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(article.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
