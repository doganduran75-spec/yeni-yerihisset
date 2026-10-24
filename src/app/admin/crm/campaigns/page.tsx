"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// CRM › KAMPANYALAR (kullanıcı kararları 2026-10-24): 1) kitle 2) kişiye özel kupon (süre atandığı andan)
// 3) e-posta (yalnız kampanya izni olana) 4) gönder → rapor. Sunucu: /api/admin/crm/campaigns
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Ticket, Mail, Send, BarChart2, RefreshCw } from "lucide-react";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";

type Person = { user_id: string; email: string; first_name: string | null; last_name: string | null; consent: boolean;
  last_order_at: string | null; order_count: number; last_mailed_at: string | null; active_coupons: string | null };
type Opt = { id: string; name: string };

async function api(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/admin/crm/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
const tl = (n: number) => `₺${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;

function Chips({ list, sel, onChange }: { list: Opt[]; sel: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((o) => {
        const on = sel.includes(o.id);
        return (
          <button key={o.id} type="button" onClick={() => onChange(on ? sel.filter((x) => x !== o.id) : [...sel, o.id])}
            className={`text-[11px] px-2 py-1 rounded-full border ${on ? "bg-olive-600 text-white border-olive-600" : "bg-white text-slate-600 border-slate-200"}`}>
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

export default function CrmCampaignsPage() {
  const [brands, setBrands] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);
  const [tags, setTags] = useState<Opt[]>([]);
  // 1) kitle
  const [f, setF] = useState({ brands: [] as string[], categories: [] as string[], purchase: "buyers", minDays: "", maxDays: "", tag: "" });
  const [skipMailedDays, setSkipMailedDays] = useState("14");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loadingAud, setLoadingAud] = useState(false);
  // 2) kupon
  const [withCoupon, setWithCoupon] = useState(true);
  const [cp, setCp] = useState({ type: "percentage", amount: "10", min: "", maxDisc: "", days: "14", brands: [] as string[], categories: [] as string[] });
  const [assignUnconsented, setAssignUnconsented] = useState(false);
  // 3) e-posta
  const [withEmail, setWithEmail] = useState(true);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("<p>Merhaba {{ad}},</p><p>Seni özledik! Sana özel bir indirim tanımladık.</p>");
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState<any[] | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: b }, { data: c }, { data: t }] = await Promise.all([
        supabase.from("brands").select("id, name").order("name"),
        supabase.from("categories").select("id, name").order("name"),
        (supabase as any).from("member_tag_options").select("id, value, member_tag_groups(name)").order("value"),
      ]);
      setBrands(((b as any[]) || []).map((x) => ({ id: x.id, name: x.name })));
      setCategories(((c as any[]) || []).map((x) => ({ id: x.id, name: x.name })));
      setTags(((t as any[]) || []).map((x) => ({ id: x.id, name: `${x.member_tag_groups?.name ? `${x.member_tag_groups.name}: ` : ""}${x.value}` })));
    })();
    loadReport();
  }, []);

  async function loadReport() {
    try { setReport((await api({ op: "report" })).campaigns || []); } catch { setReport([]); }
  }

  async function loadAudience() {
    setLoadingAud(true);
    try {
      const r = await api({ op: "audience", filters: f });
      const rows: Person[] = r.rows || [];
      setPeople(rows);
      // Varsayılan seçim: izinli + son N günde kampanya e-postası almamış
      const skip = Number(skipMailedDays) || 0;
      setSel(new Set(rows.filter((p) => p.consent && !(skip && p.last_mailed_at && (days(p.last_mailed_at) ?? 999) < skip)).map((p) => p.user_id)));
    } catch (e: any) {
      siteAlert({ title: "Kitle getirilemedi", message: e.message, tone: "danger" });
    } finally { setLoadingAud(false); }
  }

  const chosen = useMemo(() => (people || []).filter((p) => sel.has(p.user_id)), [people, sel]);
  const chosenConsent = chosen.filter((p) => p.consent).length;

  async function send() {
    if (!name.trim()) return siteAlert({ message: "Kampanyaya bir ad ver (rapor ve takip için)." });
    if (!chosen.length) return siteAlert({ message: "Listeden kişi seç." });
    if (!withCoupon && !withEmail) return siteAlert({ message: "Kupon ya da e-posta seç." });
    if (withEmail && !subject.trim()) return siteAlert({ message: "E-posta konusunu yaz." });
    const couponCount = withCoupon ? (assignUnconsented ? chosen.length : chosenConsent) : 0;
    const msg = [
      withCoupon ? `${couponCount} kişiye kupon tanımlanacak (${cp.type === "percentage" ? `%${cp.amount}` : cp.type === "fixed" ? tl(Number(cp.amount)) : "ücretsiz kargo"}, ${cp.days} gün).` : null,
      withEmail ? `${chosenConsent} kişiye e-posta gidecek (yalnız kampanya izni olanlar).` : null,
    ].filter(Boolean).join("\n");
    if (!(await siteConfirm({ title: "Kampanya gönderilsin mi?", message: msg, confirmText: "Gönder" }))) return;
    setSending(true);
    try {
      const r = await api({
        op: "create", name: name.trim(), filters: f, userIds: chosen.map((p) => p.user_id), assignUnconsented,
        coupon: withCoupon ? { name: name.trim(), type: cp.type, amount: Number(cp.amount) || 0, min_order_amount: Number(cp.min) || 0,
          max_discount_amount: cp.maxDisc ? Number(cp.maxDisc) : null, valid_days: Number(cp.days) || 14, brand_ids: cp.brands, category_ids: cp.categories } : null,
        email: withEmail ? { subject: subject.trim(), html } : null,
      });
      siteAlert({ title: "Kampanya oluşturuldu", message: `${r.assigned} kişiye kupon tanımlandı · ${r.queued} e-posta kuyrukta (birkaç dakikada gider).`, tone: "success" });
      setPeople(null); setSel(new Set()); setName(""); setSubject("");
      loadReport();
    } catch (e: any) {
      siteAlert({ title: "Kampanya oluşturulamadı", message: e.message, tone: "danger" });
    } finally { setSending(false); }
  }

  const field = "h-9 rounded-md border border-slate-200 px-2 text-sm bg-white";
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Kampanyalar</h1>
        <p className="text-sm text-muted-foreground">Kitleyi seç → kişiye özel kupon tanımla → e-postayla haber ver. Müşteri kod yazmaz; kupon sepetinde hazır olur.</p>
      </div>

      {/* 1) Kitle */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users size={18} /> 1. Kitle</CardTitle>
          <CardDescription>Aldığı marka / kategori, son alışveriş zamanı, etiket. Varsayılan seçim: kampanya izni olan ve son {skipMailedDays || 0} günde kampanya e-postası almamış olanlar.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><p className="text-xs font-semibold">Aldığı marka</p><Chips list={brands} sel={f.brands} onChange={(v) => setF({ ...f, brands: v })} /></div>
          <div className="space-y-1"><p className="text-xs font-semibold">Aldığı kategori</p><Chips list={categories} sel={f.categories} onChange={(v) => setF({ ...f, categories: v })} /></div>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="space-y-1"><span className="block text-xs font-semibold">Alışveriş</span>
              <select className={field} value={f.purchase} onChange={(e) => setF({ ...f, purchase: e.target.value })}>
                <option value="buyers">Alışveriş yapmış</option><option value="non_buyers">Hiç alışveriş yapmamış</option><option value="any">Hepsi</option>
              </select></label>
            <label className="space-y-1"><span className="block text-xs font-semibold">Son alışverişi en az … gün önce</span>
              <Input className="h-9 w-28" inputMode="numeric" value={f.minDays} onChange={(e) => setF({ ...f, minDays: e.target.value.replace(/\D/g, "") })} placeholder="ör. 90" /></label>
            <label className="space-y-1"><span className="block text-xs font-semibold">en çok … gün önce</span>
              <Input className="h-9 w-28" inputMode="numeric" value={f.maxDays} onChange={(e) => setF({ ...f, maxDays: e.target.value.replace(/\D/g, "") })} placeholder="ör. 365" /></label>
            <label className="space-y-1"><span className="block text-xs font-semibold">Etiket</span>
              <select className={field} value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>
                <option value="">—</option>{tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></label>
            <label className="space-y-1"><span className="block text-xs font-semibold">Son … günde e-posta alanı seçme</span>
              <Input className="h-9 w-24" inputMode="numeric" value={skipMailedDays} onChange={(e) => setSkipMailedDays(e.target.value.replace(/\D/g, ""))} /></label>
            <Button onClick={loadAudience} disabled={loadingAud} className="gap-1.5">{loadingAud ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} Kişileri getir</Button>
          </div>
          {people && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{people.length} kişi bulundu · <b>{chosen.length}</b> seçili ({chosenConsent} kampanya izinli) ·{" "}
                <button className="underline" onClick={() => setSel(new Set(people.filter((p) => p.consent).map((p) => p.user_id)))}>izinlilerin hepsi</button> ·{" "}
                <button className="underline" onClick={() => setSel(new Set())}>hiçbiri</button></p>
              <div className="max-h-80 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0"><tr className="text-left">
                    <th className="p-2 w-8"></th><th className="p-2">Üye</th><th className="p-2">İzin</th><th className="p-2">Son alışveriş</th><th className="p-2">Sipariş</th><th className="p-2">Son kampanya e-postası</th><th className="p-2">Mevcut kuponları</th>
                  </tr></thead>
                  <tbody>{people.map((p) => (
                    <tr key={p.user_id} className="border-t">
                      <td className="p-2"><input type="checkbox" checked={sel.has(p.user_id)} onChange={() => { const n = new Set(sel); if (n.has(p.user_id)) n.delete(p.user_id); else n.add(p.user_id); setSel(n); }} /></td>
                      <td className="p-2"><b>{[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</b><div className="text-muted-foreground">{p.email}</div></td>
                      <td className="p-2">{p.consent ? <span className="text-green-700 font-bold">Var</span> : <span className="text-slate-400">Yok</span>}</td>
                      <td className="p-2">{p.last_order_at ? `${days(p.last_order_at)} gün önce` : "—"}</td>
                      <td className="p-2">{p.order_count}</td>
                      <td className="p-2">{p.last_mailed_at ? `${days(p.last_mailed_at)} gün önce` : "—"}</td>
                      <td className="p-2 text-amber-700">{p.active_coupons || ""}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2) Kupon */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Ticket size={18} /> 2. Kişiye özel kupon
          <label className="ml-auto flex items-center gap-1.5 text-xs font-normal"><input type="checkbox" checked={withCoupon} onChange={(e) => setWithCoupon(e.target.checked)} /> Kupon tanımla</label></CardTitle>
          <CardDescription>Süre her kişiye atandığı andan başlar. Diğer kuponlarla birleşebilir. Bitmesine 3 gün kala izinli üyeye hatırlatma gider.</CardDescription></CardHeader>
        {withCoupon && (
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1"><span className="block text-xs font-semibold">Tür</span>
                <select className={field} value={cp.type} onChange={(e) => setCp({ ...cp, type: e.target.value })}>
                  <option value="percentage">Yüzde %</option><option value="fixed">Sabit tutar ₺</option><option value="free_shipping">Ücretsiz kargo</option>
                </select></label>
              {cp.type !== "free_shipping" && <label className="space-y-1"><span className="block text-xs font-semibold">{cp.type === "percentage" ? "Yüzde" : "Tutar (₺)"}</span>
                <Input className="h-9 w-24" inputMode="decimal" value={cp.amount} onChange={(e) => setCp({ ...cp, amount: e.target.value })} /></label>}
              {cp.type === "percentage" && <label className="space-y-1"><span className="block text-xs font-semibold">En çok indirim (₺)</span>
                <Input className="h-9 w-28" inputMode="decimal" value={cp.maxDisc} onChange={(e) => setCp({ ...cp, maxDisc: e.target.value })} placeholder="sınırsız" /></label>}
              <label className="space-y-1"><span className="block text-xs font-semibold">Alt limit (₺)</span>
                <Input className="h-9 w-28" inputMode="decimal" value={cp.min} onChange={(e) => setCp({ ...cp, min: e.target.value })} placeholder="yok" /></label>
              <label className="space-y-1"><span className="block text-xs font-semibold">Geçerlilik (gün)</span>
                <Input className="h-9 w-20" inputMode="numeric" value={cp.days} onChange={(e) => setCp({ ...cp, days: e.target.value.replace(/\D/g, "") })} /></label>
            </div>
            <div className="space-y-1"><p className="text-xs font-semibold">Yalnız şu markalarda <span className="font-normal text-muted-foreground">(boş = hepsi)</span></p><Chips list={brands} sel={cp.brands} onChange={(v) => setCp({ ...cp, brands: v })} /></div>
            <div className="space-y-1"><p className="text-xs font-semibold">Yalnız şu kategorilerde <span className="font-normal text-muted-foreground">(boş = hepsi)</span></p><Chips list={categories} sel={cp.categories} onChange={(v) => setCp({ ...cp, categories: v })} /></div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={assignUnconsented} onChange={(e) => setAssignUnconsented(e.target.checked)} />
              Kampanya izni olmayan seçililere de kupon tanımla (e-posta gitmez; sepetinde görür)</label>
          </CardContent>
        )}
      </Card>

      {/* 3) E-posta */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mail size={18} /> 3. E-posta
          <label className="ml-auto flex items-center gap-1.5 text-xs font-normal"><input type="checkbox" checked={withEmail} onChange={(e) => setWithEmail(e.target.checked)} /> E-posta gönder</label></CardTitle>
          <CardDescription>Yalnız kampanya izni olanlara gider; altına abonelikten çıkma bağlantısı eklenir. {"{{ad}}"} üyenin adıyla değişir; kupon kutusu ve “Sepetime git” düğmesi kendiliğinden eklenir.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <label className="space-y-1 block"><span className="block text-xs font-semibold">Kampanya adı (rapor + kupon adı)</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Kasım — Barebarics geri dönüş" /></label>
          {withEmail && <>
            <label className="space-y-1 block"><span className="block text-xs font-semibold">Konu</span>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="ör. Sana özel %10 indirim tanımladık" /></label>
            <RichTextEditor value={html} onChange={setHtml} minHeight={180} />
          </>}
          <div className="flex items-center gap-3 pt-2 border-t">
            <p className="text-xs text-muted-foreground flex-1">{chosen.length} kişi seçili · {chosenConsent} izinli{withEmail ? ` → ${chosenConsent} e-posta` : ""}{withCoupon ? ` · ${assignUnconsented ? chosen.length : chosenConsent} kupon` : ""}</p>
            <Button onClick={send} disabled={sending || !chosen.length} className="gap-1.5">{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Kampanyayı gönder</Button>
          </div>
        </CardContent>
      </Card>

      {/* Rapor */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart2 size={18} /> Geçmiş kampanyalar
          <button onClick={loadReport} className="ml-auto text-muted-foreground hover:text-foreground"><RefreshCw size={14} /></button></CardTitle></CardHeader>
        <CardContent>
          {report === null ? <Loader2 className="animate-spin text-muted-foreground" size={18} /> : report.length === 0 ? <p className="text-sm text-muted-foreground">Henüz kampanya yok.</p> : (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground"><th className="p-2">Kampanya</th><th className="p-2">Kupon</th><th className="p-2">Tanımlanan</th><th className="p-2">E-posta</th><th className="p-2">Kullanan</th><th className="p-2">Ciro</th></tr></thead>
              <tbody>{report.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2"><b>{c.subject}</b><div className="text-muted-foreground">{new Date(c.sent_at).toLocaleDateString("tr-TR")}</div></td>
                  <td className="p-2">{c.coupons ? `${c.coupons.type === "percentage" ? `%${c.coupons.amount}` : c.coupons.type === "fixed" ? tl(c.coupons.amount) : "Ücretsiz kargo"}` : "—"}</td>
                  <td className="p-2">{c.assigned_count || 0}</td>
                  <td className="p-2">{c.sent}/{c.recipient_count}{c.pending ? <span className="text-amber-600"> · {c.pending} sırada</span> : null}</td>
                  <td className="p-2 font-bold">{c.used}{c.assigned_count ? <span className="font-normal text-muted-foreground"> (%{Math.round((c.used / c.assigned_count) * 100)})</span> : null}</td>
                  <td className="p-2 font-bold">{tl(c.revenue)}</td>
                </tr>))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
