"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Eye, EyeOff, Megaphone, MousePointerClick, Clock, RotateCcw, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type PopupConfig = {
  id: string;
  is_active: boolean;
  title: string;
  content: string;
  button_text: string;
  button_url: string;
  delay_seconds: number;
  cooldown_days: number;
};

const DEFAULT: PopupConfig = {
  id: "",
  is_active: false,
  title: "Hoş Geldiniz! 👋",
  content: "",
  button_text: "",
  button_url: "",
  delay_seconds: 3,
  cooldown_days: 7,
};

export default function PopupTab() {
  const [config, setConfig] = useState<PopupConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [impressionCount, setImpressionCount] = useState<number | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const [configRes, countRes] = await Promise.all([
        supabase.from("popup_config").select("*").order("created_at", { ascending: true }).limit(1),
        supabase.from("popup_impressions").select("id", { count: "exact", head: true }),
      ]);
      if (configRes.data && configRes.data.length > 0) setConfig({ ...DEFAULT, ...configRes.data[0] });
      if (countRes.count !== null) setImpressionCount(countRes.count);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function set(fields: Partial<PopupConfig>) {
    setConfig((prev) => ({ ...prev, ...fields }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...config,
        updated_at: new Date().toISOString(),
      };
      const { error } = config.id
        ? await supabase.from("popup_config").update(payload).eq("id", config.id)
        : await supabase.from("popup_config").insert(payload);
      if (error) throw error;
      alert("Popup ayarları kaydedildi.");
      fetchConfig();
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
      {/* Durum kartı */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => set({ is_active: !config.is_active })}
          className={cn(
            "col-span-1 sm:col-span-2 flex items-center justify-between p-5 rounded-2xl border-2 cursor-pointer transition-all select-none",
            config.is_active
              ? "border-green-300 bg-green-50"
              : "border-slate-200 bg-slate-50 hover:border-slate-300"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-xl", config.is_active ? "bg-green-100" : "bg-slate-200")}>
              <Megaphone size={18} className={config.is_active ? "text-green-600" : "text-slate-400"} />
            </div>
            <div>
              <p className={cn("font-bold text-sm", config.is_active ? "text-green-700" : "text-slate-600")}>
                {config.is_active ? "Popup Aktif" : "Popup Pasif"}
              </p>
              <p className="text-xs text-muted-foreground">
                {config.is_active ? "Giriş yapan üyelere gösteriliyor" : "Şu an kimseye gösterilmiyor"}
              </p>
            </div>
          </div>
          <div className={cn(
            "w-12 h-6 rounded-full transition-colors relative",
            config.is_active ? "bg-green-500" : "bg-slate-300"
          )}>
            <div className={cn(
              "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
              config.is_active ? "left-6" : "left-0.5"
            )} />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-slate-100 bg-slate-50 gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users size={14} />
            <span className="text-xs font-medium">Toplam Gösterim</span>
          </div>
          <p className="text-3xl font-black text-slate-800">
            {impressionCount !== null ? impressionCount.toLocaleString("tr") : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">benzersiz üye</p>
        </div>
      </div>

      {/* Zamanlama */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock size={16} className="text-blue-600" /> Zamanlama
          </CardTitle>
          <CardDescription>Popup'ın ne zaman ve ne sıklıkta gösterileceği.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Clock size={13} className="text-muted-foreground" />
              Giriş sonrası bekleme süresi
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={300}
                value={config.delay_seconds}
                onChange={(e) => set({ delay_seconds: Number(e.target.value) })}
                className="max-w-[120px]"
              />
              <span className="text-sm text-muted-foreground">saniye</span>
            </div>
            <p className="text-xs text-muted-foreground">Sayfa yüklendikten kaç saniye sonra açılacak. (0 = anında)</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <RotateCcw size={13} className="text-muted-foreground" />
              Tekrar gösterim süresi
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={365}
                value={config.cooldown_days}
                onChange={(e) => set({ cooldown_days: Number(e.target.value) })}
                className="max-w-[120px]"
              />
              <span className="text-sm text-muted-foreground">gün</span>
            </div>
            <p className="text-xs text-muted-foreground">Popup gösterildikten sonra aynı üyeye kaç gün sonra tekrar gösterilsin. (0 = her girişte)</p>
          </div>
        </CardContent>
      </Card>

      {/* İçerik */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone size={16} className="text-blue-600" /> İçerik
              </CardTitle>
              <CardDescription>Popup başlığı ve mesaj içeriği. HTML kullanabilirsiniz.</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowPreview((p) => !p)}
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPreview ? "Düzenle" : "Önizle"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Başlık</label>
            <Input
              value={config.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Hoş Geldiniz! 👋"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">İçerik (HTML destekli)</label>
            {showPreview ? (
              <div className="min-h-[180px] p-4 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 prose prose-sm max-w-none">
                {config.content ? (
                  <div dangerouslySetInnerHTML={{ __html: config.content }} />
                ) : (
                  <p className="text-muted-foreground italic text-sm">İçerik boş...</p>
                )}
              </div>
            ) : (
              <textarea
                value={config.content}
                onChange={(e) => set({ content: e.target.value })}
                placeholder={`<p>Özel <strong>kampanyalardan</strong> haberdar olmak için email listemize katılın.</p>\n<p>🎁 İlk alışverişinizde <strong>%10 indirim</strong> kazanın!</p>`}
                className="flex min-h-[180px] w-full rounded-xl border border-input bg-background px-3 py-3 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
            <p className="text-xs text-muted-foreground">
              HTML etiketleri desteklenir: &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;br&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;a href="..."&gt;, &lt;img&gt; vb.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* CTA Butonu */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MousePointerClick size={16} className="text-blue-600" /> Eylem Butonu (Opsiyonel)
          </CardTitle>
          <CardDescription>Popup'a bir yönlendirme butonu ekleyin. Boş bırakırsanız buton gösterilmez.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Buton Metni</label>
            <Input
              value={config.button_text}
              onChange={(e) => set({ button_text: e.target.value })}
              placeholder="Kampanyayı İncele →"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Yönlendirme URL</label>
            <Input
              value={config.button_url}
              onChange={(e) => set({ button_url: e.target.value })}
              placeholder="/kampanyalar"
            />
          </div>
        </CardContent>
      </Card>

      {/* Önizleme */}
      {showPreview && (
        <Card className="border-2 border-indigo-200">
          <CardHeader>
            <CardTitle className="text-sm text-indigo-700">Canlı Önizleme</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative bg-black/20 rounded-xl p-6 flex items-center justify-center min-h-[220px]">
              <div className="bg-white rounded-2xl shadow-2xl p-7 w-full max-w-sm relative">
                <button
                  type="button"
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold"
                >
                  ✕
                </button>
                {config.title && (
                  <h3 className="text-xl font-black text-slate-900 mb-3 pr-8">{config.title}</h3>
                )}
                {config.content && (
                  <div
                    className="text-sm text-slate-600 leading-relaxed mb-4 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: config.content }}
                  />
                )}
                {config.button_text && (
                  <div className="pt-1">
                    <span className="inline-block bg-blue-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
                      {config.button_text}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving} className="gap-2 px-8">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Kaydet
        </Button>
      </div>
    </form>
  );
}
