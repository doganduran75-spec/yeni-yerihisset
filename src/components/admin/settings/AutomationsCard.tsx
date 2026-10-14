"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Ayarlar › E-posta Şablonları › Otomatik e-postalar: Yorum isteme + Seni özledik (src/lib/review-winback.ts).
// Değerler settings.review_request / settings.winback'te; kodda sabit yok → veri toplandıkça sorular değişebilir.
// Genel puan ve yorum kutusu her zaman sorulur; buradaki sorular onlara ek (en çok 6).
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert } from "@/components/ui/site-dialog";
import { Loader2, Plus, Trash2, Star, Gift } from "lucide-react";

type Q = { key: string; label: string; type: "stars" | "choice"; options?: string[] };

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
const slug = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

export default function AutomationsCard() {
  const [rr, setRr] = useState<{ enabled: boolean; delay_days: number; questions: Q[] } | null>(null);
  const [wb, setWb] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/admin/settings", { headers: await authHeaders(), cache: "no-store" });
      const s = (await r.json().catch(() => ({})))?.settings || {};
      setRr({ enabled: s.review_request?.enabled !== false, delay_days: Number(s.review_request?.delay_days) || 15, questions: s.review_request?.questions || [] });
      setWb({ enabled: s.winback?.enabled !== false, idle_days: 90, wait_hours: 2, percent: 10, valid_days: 10, cooldown_days: 180, ...(s.winback || {}) });
    })();
  }, []);

  async function save(kind: "review_request" | "winback", value: any) {
    setBusy(kind);
    try {
      const r = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ settings: { [kind]: value } }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Kaydedilemedi");
      siteAlert({ message: "Kaydedildi.", tone: "success" });
    } catch (e: any) { siteAlert({ title: "Kaydedilemedi", message: e?.message, tone: "danger" }); }
    finally { setBusy(null); }
  }

  if (!rr || !wb) return null;
  const setQ = (i: number, patch: Partial<Q>) => setRr({ ...rr, questions: rr.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  return (
    <Card className="shadow-sm border-muted">
      <CardHeader>
        <CardTitle>Otomatik e-postalar</CardTitle>
        <CardDescription>Metinleri yukarıdaki şablonlardan, zamanlamayı ve içeriği buradan değiştirirsin. Saatte bir kontrol edilir.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {/* Yorum isteme */}
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <b className="flex items-center gap-1.5"><Star size={16} className="text-amber-500" /> Yorum isteme</b>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={rr.enabled} onChange={(e) => setRr({ ...rr, enabled: e.target.checked })} /> Açık</label>
            <label className="flex items-center gap-1.5 text-xs">Kullanmaya başladıktan
              <Input type="number" min={1} value={rr.delay_days} onChange={(e) => setRr({ ...rr, delay_days: num(e.target.value) || 1 })} className="h-8 w-16 text-xs" /> gün sonra</label>
          </div>
          <p className="text-xs text-muted-foreground">Kullanmaya başlama: müşterinin “Oldu” dediği gün; cevap vermediyse deneme süresinin bittiği gün. Tek e-posta gider, hatırlatma yok. <b>Genel puan</b> ve <b>yorum kutusu</b> her zaman var; aşağıdaki sorular onlara ek.</p>
          <div className="space-y-2">
            {rr.questions.map((q, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input value={q.label} onChange={(e) => setQ(i, { label: e.target.value, ...(q.key ? {} : { key: slug(e.target.value) }) })} placeholder="Soru (ör. Rahatlık)" className="h-8 w-44 text-xs" />
                <select value={q.type} onChange={(e) => setQ(i, { type: e.target.value as Q["type"], options: e.target.value === "choice" ? q.options || ["", ""] : undefined })} className="h-8 rounded-md border px-1 bg-white text-xs">
                  <option value="stars">Yıldız (1–5)</option><option value="choice">Seçenek</option>
                </select>
                {q.type === "choice" && (
                  <Input value={(q.options || []).join(", ")} onChange={(e) => setQ(i, { options: e.target.value.split(",").map((x) => x.trim()) })} placeholder="Seçenekler, virgülle: Küçük geldi, Tam oldu, Büyük geldi" className="h-8 flex-1 min-w-[220px] text-xs" />
                )}
                <button type="button" title="Soruyu kaldır" onClick={() => setRr({ ...rr, questions: rr.questions.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
            {rr.questions.length < 6 && (
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setRr({ ...rr, questions: [...rr.questions, { key: `q${Date.now().toString(36)}`, label: "", type: "stars" }] })}><Plus size={14} /> Soru ekle</Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Soruyu değiştirmek eski cevapları bozmaz: her cevap, sorulduğu andaki soru metniyle saklanır.</p>
          <Button size="sm" disabled={busy === "review_request"} onClick={() => save("review_request", {
            enabled: rr.enabled, delay_days: rr.delay_days,
            questions: rr.questions.filter((q) => q.label.trim()).map((q) => ({ ...q, key: q.key || slug(q.label), label: q.label.trim(), ...(q.type === "choice" ? { options: (q.options || []).map((o) => o.trim()).filter(Boolean) } : {}) })),
          })}>{busy === "review_request" && <Loader2 size={14} className="animate-spin mr-1" />} Kaydet</Button>
        </div>

        {/* Seni özledik */}
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <b className="flex items-center gap-1.5"><Gift size={16} className="text-lime-600" /> Seni özledik (geri dönen üye)</b>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={wb.enabled} onChange={(e) => setWb({ ...wb, enabled: e.target.checked })} /> Açık</label>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <label className="flex items-center gap-1.5"><Input type="number" min={7} value={wb.idle_days} onChange={(e) => setWb({ ...wb, idle_days: num(e.target.value) })} className="h-8 w-16 text-xs" /> gün gelmeyip dönen</label>
            <label className="flex items-center gap-1.5"><Input type="number" min={0} value={wb.wait_hours} onChange={(e) => setWb({ ...wb, wait_hours: num(e.target.value) })} className="h-8 w-14 text-xs" /> saat içinde almazsa</label>
            <label className="flex items-center gap-1.5">%<Input type="number" min={1} max={90} value={wb.percent} onChange={(e) => setWb({ ...wb, percent: num(e.target.value) })} className="h-8 w-14 text-xs" /> indirim</label>
            <label className="flex items-center gap-1.5"><Input type="number" min={1} value={wb.valid_days} onChange={(e) => setWb({ ...wb, valid_days: num(e.target.value) })} className="h-8 w-14 text-xs" /> gün geçerli</label>
            <label className="flex items-center gap-1.5">aynı kişiye en erken <Input type="number" min={1} value={wb.cooldown_days} onChange={(e) => setWb({ ...wb, cooldown_days: num(e.target.value) })} className="h-8 w-16 text-xs" /> gün sonra</label>
          </div>
          <p className="text-xs text-muted-foreground">Yalnız kampanya izni olan üyelere. Kupon kişiye özel, tek kullanımlık; hesabına otomatik tanımlanır (ödeme sayfasında hazır görünür).</p>
          <Button size="sm" disabled={busy === "winback"} onClick={() => save("winback", wb)}>{busy === "winback" && <Loader2 size={14} className="animate-spin mr-1" />} Kaydet</Button>
        </div>
      </CardContent>
    </Card>
  );
}
