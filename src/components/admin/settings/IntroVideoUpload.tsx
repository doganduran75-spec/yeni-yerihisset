"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";

// Mobil karşılama videosu: "Video yükle" (Supabase depolama › media kovası, yalnız yönetici).
// Seçilen video incelenir (süre, yön, boyut) → yüklenir → ayar HEMEN kaydedilir (Kaydet'e gerek yok)
// → daha önce yüklenen video silinir. Deploy gerekmez.
const MAX_BYTES = 25 * 1024 * 1024;

function probe(file: File): Promise<{ duration: number; w: number; h: number } | null> {
  return new Promise((res) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata"; v.muted = true; v.src = url;
    v.onloadedmetadata = () => { res({ duration: v.duration, w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(url); };
    v.onerror = () => { res(null); URL.revokeObjectURL(url); };
  });
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function IntroVideoUpload({ currentUrl, onUploaded }: { currentUrl: string; onUploaded: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  async function pick(file: File) {
    if (!/^video\/(mp4|webm)$/.test(file.type)) { siteAlert({ message: "Yalnız mp4 (ya da webm) video yüklenebilir.", tone: "danger" }); return; }
    if (file.size > MAX_BYTES) { siteAlert({ message: `Video ${(file.size / 1048576).toFixed(1)} MB — en çok 25 MB olabilir.`, tone: "danger" }); return; }
    const meta = await probe(file);
    if (!meta) { siteAlert({ message: "Video okunamadı; telefonlarda oynamayabilir. mp4 (H.264) olarak kaydedip tekrar dene.", tone: "danger" }); return; }
    const warns: string[] = [];
    if (meta.w > meta.h) warns.push("video yatay — telefonda kenarları kırpılır, dikey (9:16) önerilir");
    if (meta.duration > 15) warns.push(`video ${Math.round(meta.duration)} sn — 5–10 sn önerilir (en çok 9 sn gösterilir)`);
    if (file.size > 6 * 1048576) warns.push(`boyut ${(file.size / 1048576).toFixed(1)} MB — telefonda geç yüklenir, 3 MB altı önerilir`);
    if (warns.length && !(await siteConfirm({ title: "Yine de yüklensin mi?", message: warns.map((w) => `• ${w}`).join("\n"), confirmText: "Yükle" }))) return;

    setBusy(true); setProgress("Yükleniyor…");
    try {
      const path = `intro/intro-${Date.now()}.${file.type === "video/webm" ? "webm" : "mp4"}`;
      const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("media").getPublicUrl(path);
      setProgress("Kaydediliyor…");
      const res = await fetch("/api/admin/settings", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ settings: { intro_video_url: publicUrl, intro_video_enabled: true } }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error || "Ayar kaydedilemedi");
      // Önceki yüklenen videoyu sil (sitedeki /intro/... dosyasına dokunulmaz)
      const prev = /\/storage\/v1\/object\/public\/media\/(.+)$/.exec(currentUrl || "")?.[1];
      if (prev && prev !== path) await supabase.storage.from("media").remove([decodeURIComponent(prev)]).catch(() => {});
      onUploaded(publicUrl);
      siteAlert({ message: "Video yüklendi ve yayında. Telefonda ana sayfayı ?intro=1 ile açıp deneyebilirsin.", tone: "success" });
    } catch (e: any) {
      siteAlert({ title: "Yüklenemedi", message: e?.message || "Video yüklenemedi.", tone: "danger" });
    } finally {
      setBusy(false); setProgress("");
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input ref={input} type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
      <Button type="button" variant="outline" className="gap-2" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {busy ? progress : "Video yükle"}
      </Button>
      {currentUrl && (
        <video key={currentUrl} src={currentUrl} muted playsInline loop autoPlay className="h-40 aspect-[9/16] rounded-lg bg-black object-cover" />
      )}
    </div>
  );
}
