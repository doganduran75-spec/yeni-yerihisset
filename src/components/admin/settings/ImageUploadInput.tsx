"use client";

// Görsel adresi kutusu + "Yükle" düğmesi (kullanıcı 2026-11-15: ana sayfa prensip görselleri panelden yüklenemiyordu).
// Dosya Supabase depolamasındaki "site" kovasına (home/…) yüklenir, adres kutuya yazılır; kaydetmek için sayfanın
// "Kaydet" düğmesi. Yalnız görsel, en çok 5 MB.
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const MAX = 5 * 1024 * 1024;

export default function ImageUploadInput({ value, onChange, folder = "home" }: { value: string; onChange: (v: string) => void; folder?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setErr(null);
    if (!/^image\//.test(file.type)) { setErr("Yalnız görsel dosyası yüklenebilir."); return; }
    if (file.size > MAX) { setErr("Dosya 5 MB'tan büyük."); return; }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("site").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      onChange(supabase.storage.from("site").getPublicUrl(path).data.publicUrl);
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setErr(`Yüklenemedi: ${e?.message || e}`);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Yükle
        </Button>
      </div>
      {value && /^(https?:\/\/|\/)/.test(value) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-20 rounded-md border bg-slate-50 object-contain" />
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
