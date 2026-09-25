"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Truck, Plus, Trash2, Loader2, Save } from "lucide-react";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";

const EMPTY = { id: "", name: "", description: "", fee: "", free_over: "", is_active: true, sort_order: 0 };

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function ShippingMethodsManager() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<any>({ ...EMPTY });
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/shipping-methods", { headers: await authHeaders() });
    const d = await res.json();
    if (d.ok) setRows(d.methods);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(method: any) {
    setSavingId(method.id || "new");
    const res = await fetch("/api/admin/shipping-methods", {
      method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ action: "save", method }),
    });
    const d = await res.json();
    setSavingId(null);
    if (!res.ok || !d.ok) { siteAlert({ title: "Kaydedilemedi", message: d.error || "Kargo yöntemi kaydedilemedi.", tone: "danger" }); return; }
    if (!method.id) setDraft({ ...EMPTY });
    load();
  }

  async function remove(id: string) {
    if (!(await siteConfirm({ title: "Kargo yöntemini sil", message: "Bu kargo yöntemi silinsin mi? Geçmiş siparişlerdeki kargo bilgisi etkilenmez.", confirmText: "Sil", tone: "danger" }))) return;
    const res = await fetch("/api/admin/shipping-methods", {
      method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ action: "delete", id }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) siteAlert({ title: "Silinemedi", message: d.error || "Kargo yöntemi silinemedi.", tone: "danger" });
    load();
  }

  return (
    <Card className="shadow-sm border-muted">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Truck size={18} /> Kargo Yöntemleri</CardTitle>
        <CardDescription>Checkout'ta müşterinin seçeceği kargo yöntemleri. “Belirli tutar üstü ücretsiz” için free_over gir (boş = ücretsiz yok).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Başlık satırı */}
            <div className="hidden md:grid grid-cols-[1fr_1fr_90px_110px_70px_auto] gap-2 px-1 text-[10px] font-bold uppercase text-muted-foreground">
              <span>Ad</span><span>Açıklama</span><span>Ücret ₺</span><span>Üstü Ücretsiz</span><span>Aktif</span><span></span>
            </div>
            {rows.map((r, i) => (
              <div key={r.id} className="grid grid-cols-2 md:grid-cols-[1fr_1fr_90px_110px_70px_auto] gap-2 items-center border rounded-xl p-2">
                <Input value={r.name} onChange={(e) => setRows((x) => x.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} className="h-9 text-sm" />
                <Input value={r.description ?? ""} onChange={(e) => setRows((x) => x.map((y, j) => j === i ? { ...y, description: e.target.value } : y))} className="h-9 text-sm" placeholder="opsiyonel" />
                <Input type="number" step="0.01" value={r.fee} onChange={(e) => setRows((x) => x.map((y, j) => j === i ? { ...y, fee: e.target.value } : y))} className="h-9 text-sm" />
                <Input type="number" step="0.01" value={r.free_over ?? ""} onChange={(e) => setRows((x) => x.map((y, j) => j === i ? { ...y, free_over: e.target.value } : y))} className="h-9 text-sm" placeholder="—" />
                <label className="flex items-center gap-1.5 text-xs font-bold">
                  <input type="checkbox" checked={!!r.is_active} onChange={(e) => setRows((x) => x.map((y, j) => j === i ? { ...y, is_active: e.target.checked } : y))} /> Aktif
                </label>
                <div className="flex gap-1 justify-end">
                  <Button size="sm" className="h-9 gap-1" disabled={savingId === r.id} onClick={() => save(r)}>
                    {savingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 text-red-600 border-red-200" onClick={() => remove(r.id)}><Trash2 size={14} /></Button>
                </div>
              </div>
            ))}

            {/* Yeni ekle */}
            <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_90px_110px_70px_auto] gap-2 items-center border-2 border-dashed rounded-xl p-2 bg-slate-50/50">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-9 text-sm" placeholder="Aynı Gün Kurye" />
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="h-9 text-sm" placeholder="Açıklama" />
              <Input type="number" step="0.01" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} className="h-9 text-sm" placeholder="0" />
              <Input type="number" step="0.01" value={draft.free_over} onChange={(e) => setDraft({ ...draft, free_over: e.target.value })} className="h-9 text-sm" placeholder="—" />
              <label className="flex items-center gap-1.5 text-xs font-bold">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Aktif
              </label>
              <Button size="sm" className="h-9 gap-1 bg-olive-600" disabled={savingId === "new" || !draft.name.trim()} onClick={() => save(draft)}>
                {savingId === "new" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ekle
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
