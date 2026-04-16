"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Loader2, Upload, ImageIcon, Globe, Home, Check } from "lucide-react";

type ContentRow = {
  id: string;
  page: string;
  section: string;
  key: string;
  value: string;
  type: string;
  label: string;
  sort_order: number;
};

const PAGE_LABELS: Record<string, string> = {
  home: "Anasayfa",
  global: "Genel Ayarlar",
};

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero Bölümü",
  stats: "İstatistikler",
  brand: "Marka Bilgileri",
};

const PAGE_ICONS: Record<string, any> = {
  home: Home,
  global: Globe,
};

export default function SiteContentPage() {
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [activePage, setActivePage] = useState("home");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetchContent();
  }, []);

  async function fetchContent() {
    try {
      const { data, error } = await supabase
        .from("site_content")
        .select("*")
        .order("sort_order");
      if (error) {
        console.warn("site_content fetch error:", error.message);
        return;
      }
      if (data) {
        setRows(data as ContentRow[]);
        const map: Record<string, string> = {};
        data.forEach((r: ContentRow) => { map[r.key] = r.value ?? ""; });
        setValues(map);
      }
    } catch {
      // sessizce geç
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updates = rows
        .filter((r) => r.page === activePage)
        .map((r) => ({
          id: r.id,
          page: r.page,
          section: r.section,
          key: r.key,
          value: values[r.key] ?? r.value ?? "",
          type: r.type,
          label: r.label,
          sort_order: r.sort_order,
          updated_at: new Date().toISOString(),
        }));

      const { error } = await supabase
        .from("site_content")
        .upsert(updates, { onConflict: "page,key" });

      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      alert("Kayıt başarısız: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(key: string, file: File) {
    setUploading(key);
    try {
      const ext = file.name.split(".").pop();
      const path = `site/${key}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from("product-images")
        .getPublicUrl(path);
      setValues((prev) => ({ ...prev, [key]: publicUrl }));
    } catch (err: any) {
      alert("Görsel yükleme hatası: " + err.message);
    } finally {
      setUploading(null);
    }
  }

  const pages = [...new Set(rows.map((r) => r.page))];
  const pageRows = rows.filter((r) => r.page === activePage);
  const sections = [...new Set(pageRows.map((r) => r.section))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sayfa İçerikleri</h2>
          <p className="text-muted-foreground">
            Sayfadaki metinleri ve görselleri buradan düzenleyin.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className={`gap-2 px-6 font-bold transition-all ${
            saved ? "bg-green-600 hover:bg-green-600" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saved ? (
            <Check size={16} />
          ) : (
            <Save size={16} />
          )}
          {saved ? "Kaydedildi!" : "Değişiklikleri Kaydet"}
        </Button>
      </div>

      {/* Sayfa sekmeleri */}
      <div className="flex gap-2 border-b pb-0">
        {pages.map((page) => {
          const Icon = PAGE_ICONS[page] ?? Globe;
          return (
            <button
              key={page}
              onClick={() => setActivePage(page)}
              className={`flex items-center gap-2 px-5 py-3 font-bold text-sm transition-all border-b-2 -mb-px ${
                activePage === page
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={16} />
              {PAGE_LABELS[page] ?? page}
            </button>
          );
        })}
      </div>

      {/* Bölümler */}
      <div className="space-y-6">
        {sections.map((section) => {
          const sectionRows = pageRows
            .filter((r) => r.section === section)
            .sort((a, b) => a.sort_order - b.sort_order);

          return (
            <Card key={section} className="shadow-sm border-muted rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-50 py-4">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <span className="w-1.5 h-5 bg-blue-600 rounded-full" />
                  {SECTION_LABELS[section] ?? section}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                {sectionRows.map((row) => (
                  <div key={row.key} className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">
                      {row.label}
                      <span className="ml-2 text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {row.key}
                      </span>
                    </label>

                    {row.type === "image" ? (
                      <div className="space-y-3">
                        {/* Görsel önizleme */}
                        {values[row.key] && (
                          <div className="relative w-full max-w-sm aspect-video rounded-xl overflow-hidden border bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={values[row.key]}
                              alt={row.label}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        {!values[row.key] && (
                          <div className="w-full max-w-sm aspect-video rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50">
                            <ImageIcon size={32} className="text-slate-300" />
                          </div>
                        )}
                        <div className="flex gap-2 max-w-sm">
                          <Input
                            value={values[row.key] ?? ""}
                            onChange={(e) =>
                              setValues((prev) => ({ ...prev, [row.key]: e.target.value }))
                            }
                            placeholder="https://..."
                            className="h-10 text-sm font-medium flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 px-3 gap-2 whitespace-nowrap"
                            disabled={uploading === row.key}
                            onClick={() => fileRefs.current[row.key]?.click()}
                          >
                            {uploading === row.key ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Upload size={14} />
                            )}
                            Yükle
                          </Button>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={(el) => { fileRefs.current[row.key] = el; }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(row.key, file);
                            }}
                          />
                        </div>
                      </div>
                    ) : row.type === "textarea" ? (
                      <textarea
                        value={values[row.key] ?? ""}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [row.key]: e.target.value }))
                        }
                        rows={3}
                        className="w-full rounded-xl border border-input bg-slate-50/50 px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all resize-none"
                      />
                    ) : (
                      <Input
                        value={values[row.key] ?? ""}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [row.key]: e.target.value }))
                        }
                        className="h-10 font-medium max-w-lg"
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
