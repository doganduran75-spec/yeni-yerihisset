"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// PARAŞÜT GELEN E-FATURALAR (kullanıcı 2026-11-22) — src/lib/parasut-inbound.ts. Gelen e-fatura buraya düşer (Paraşüt
// bildirimi); kurala uyan faturada kasa / kategori / etiket hazır gelir, "Kabul et ve kaydet" Paraşüt’te kabul eder +
// gider olarak kaydeder + kasadan ödendi yapar. Kurala uymayan elle seçilir ("Kural olarak kaydet" ile sonrakiler otomatik
// dolar). Paraşüt’te elle girilecek fatura "Paraşüt’te elle gireceğim" ile düşer; Paraşüt’te işlenen kendiliğinden düşer.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { Loader2, RefreshCw, ArrowLeft, Check, Bell, Trash2, Pencil, Plus } from "lucide-react";

async function api(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/admin/parasut", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Paraşüt hatası");
  return j;
}

type Opt = { id: string; name: string };
type Rule = {
  id?: string; name: string; match_name: string | null; match_vkn: string | null; account_id: string | null; account_name: string | null;
  category_id: string | null; category_name: string | null; tag_ids: string[]; tag_names: string[]; mark_paid: boolean; details: boolean; sort_order: number;
};
type Inv = {
  id: string; from_vkn: string | null; contact_name: string | null; issue_date: string | null; net_total: number | null; currency: string | null;
  scenario: string | null; item_type: string | null; status: string; rule_id: string | null; account_id: string | null; category_id: string | null;
  tag_ids: string[]; mark_paid: boolean | null; details: boolean | null; error: string | null; note: string | null; received_at: string; processed_at: string | null;
};
type Choice = { account_id: string; category_id: string; tag_ids: string[]; new_tags: string[]; mark_paid: boolean; details: boolean };

// Firma / kasa / kategori adı karşılaştırması (sunucudaki normName ile aynı)
const norm = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr-TR").replace(/[^0-9a-zçğıöşü]+/g, " ").replace(/\s+/g, " ").trim();
const byName = (list: Opt[], name: string | null) => {
  const n = norm(name);
  if (!n) return null;
  return list.find((x) => norm(x.name) === n) ?? list.find((x) => norm(x.name.split("›").pop()) === n) ?? null;
};
const money = (n: number | null, c: string | null) =>
  n == null ? "—" : `${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c && c !== "TRL" ? c : "TL"}`;
const EMPTY_RULE: Rule = { name: "", match_name: "", match_vkn: "", account_id: null, account_name: null, category_id: null, category_name: null, tag_ids: [], tag_names: [], mark_paid: true, details: true, sort_order: 100 };

export default function ParasutInboundPage() {
  const [open, setOpen] = useState<Inv[]>([]);
  const [closed, setClosed] = useState<Inv[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [webhook, setWebhook] = useState<{ enabled: boolean; uri: string | null } | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [opts, setOpts] = useState<{ accounts: Opt[]; categories: Opt[]; tags: Opt[] } | null>(null);
  const [optsError, setOptsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [editRule, setEditRule] = useState<Rule | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await api({ op: "inbound_list" });
      setOpen(j.open); setClosed(j.closed); setRules(j.rules); setWebhook(j.webhook); setRefreshError(j.refreshError);
    } catch (e: any) { siteAlert({ message: e?.message, tone: "danger" }); }
    setLoading(false);
  }, []);
  const loadOpts = useCallback(async () => {
    try { const j = await api({ op: "inbound_options" }); setOpts({ accounts: j.accounts, categories: j.categories, tags: j.tags }); setOptsError(null); }
    catch (e: any) { setOptsError(e?.message || "Paraşüt listeleri okunamadı"); }
  }, []);
  useEffect(() => { load(); loadOpts(); }, [load, loadOpts]);

  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id as string, r])), [rules]);

  /** Kuraldan (ya da daha önce seçilenden) varsayılan seçim — adlar Paraşüt listesinden kimliğe çevrilir */
  const defaults = useCallback((inv: Inv): Choice => {
    const r = inv.rule_id ? ruleById.get(inv.rule_id) : null;
    const acc = inv.account_id || r?.account_id || (opts && r ? byName(opts.accounts, r.account_name)?.id : null) || "";
    const cat = inv.category_id || r?.category_id || (opts && r ? byName(opts.categories, r.category_name)?.id : null) || "";
    let tagIds: string[] = inv.tag_ids?.length ? inv.tag_ids : r?.tag_ids?.length ? r.tag_ids : [];
    const newTags: string[] = [];
    if (!inv.tag_ids?.length && r?.tag_names?.length && opts) {
      for (const n of r.tag_names) { const t = byName(opts.tags, n); if (!t) newTags.push(n); else if (!tagIds.includes(t.id)) tagIds = [...tagIds, t.id]; }
    }
    return { account_id: acc, category_id: cat, tag_ids: tagIds, new_tags: newTags, mark_paid: inv.mark_paid ?? r?.mark_paid ?? !!r, details: inv.details ?? r?.details ?? true };
  }, [ruleById, opts]);
  const ch = (inv: Inv) => choice[inv.id] ?? defaults(inv);
  const setCh = (inv: Inv, p: Partial<Choice>) => setChoice((c) => ({ ...c, [inv.id]: { ...(c[inv.id] ?? defaults(inv)), ...p } }));

  async function enableHook() {
    setBusy("hook");
    try { const j = await api({ op: "inbound_webhook", origin: window.location.origin }); setWebhook(j.webhook); siteAlert({ message: "Bildirim açıldı. Bundan sonra gelen e-faturalar burada görünür.", tone: "success" }); }
    catch (e: any) { siteAlert({ title: "Bildirim açılamadı", message: e?.message, tone: "danger" }); }
    setBusy(null);
  }

  async function processInv(inv: Inv) {
    const c = ch(inv);
    if (c.mark_paid && !c.account_id) return siteAlert({ message: "Ödendi sayılacaksa kasa seç.", tone: "danger" });
    const accName = opts?.accounts.find((a) => a.id === c.account_id)?.name;
    const ok = await siteConfirm({
      title: "Kabul edilip kaydedilsin mi?",
      message: `${inv.contact_name || "Firma"} · ${money(inv.net_total, inv.currency)}\nParaşüt’te kabul edilir ve gider olarak kaydedilir${c.mark_paid ? `, “${accName || "kasa"}” kasasından ödendi yapılır` : ""}.`,
      confirmText: "Kabul et ve kaydet",
    });
    if (!ok) return;
    setBusy(inv.id);
    try {
      const j = await api({ op: "inbound_process", id: inv.id, choice: c });
      if (j.status === "manual") siteAlert({ message: "Bu fatura Paraşüt’te zaten kaydedilmiş — dokunulmadı.", tone: "success" });
      else if (j.warnings?.length) siteAlert({ title: "Kaydedildi (not var)", message: j.warnings.join("\n"), tone: "danger" });
    } catch (e: any) { siteAlert({ title: "Kaydedilemedi", message: e?.message, tone: "danger" }); }
    setBusy(null);
    load();
  }

  async function ignore(inv: Inv, undo = false) {
    setBusy(inv.id);
    try { await api({ op: "inbound_ignore", id: inv.id, undo }); } catch (e: any) { siteAlert({ message: e?.message, tone: "danger" }); }
    setBusy(null);
    load();
  }

  function ruleFromInvoice(inv: Inv) {
    const c = ch(inv);
    setEditRule({
      ...EMPTY_RULE, name: inv.contact_name || "", match_name: inv.contact_name || "", match_vkn: inv.from_vkn || "",
      account_id: c.account_id || null, category_id: c.category_id || null, tag_ids: c.tag_ids, tag_names: c.new_tags, mark_paid: c.mark_paid, details: c.details,
    });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  async function saveRule(r: Rule) {
    setBusy("rule");
    try {
      // Adlar da saklanır (Paraşüt’te kimlik değişirse adla bulunur)
      const account_name = opts?.accounts.find((a) => a.id === r.account_id)?.name ?? r.account_name;
      const category_name = opts?.categories.find((a) => a.id === r.category_id)?.name ?? r.category_name;
      const tag_names = [...r.tag_ids.map((id) => opts?.tags.find((t) => t.id === id)?.name).filter(Boolean) as string[], ...r.tag_names.filter((n) => !opts?.tags.some((t) => norm(t.name) === norm(n)))];
      await api({ op: "rule_save", rule: { ...r, account_name, category_name, tag_names } });
      setEditRule(null);
      setChoice({});
      await load();
    } catch (e: any) { siteAlert({ message: e?.message, tone: "danger" }); }
    setBusy(null);
  }

  async function deleteRule(r: Rule) {
    if (!(await siteConfirm({ title: "Kural silinsin mi?", message: r.name, confirmText: "Sil", tone: "danger" }))) return;
    try { await api({ op: "rule_delete", id: r.id }); await load(); } catch (e: any) { siteAlert({ message: e?.message, tone: "danger" }); }
  }

  const sel = "h-8 rounded-md border px-2 bg-white text-xs max-w-full";
  const TagPicker = ({ ids, newNames, onChange }: { ids: string[]; newNames: string[]; onChange: (ids: string[], newNames: string[]) => void }) => (
    <div className="flex flex-wrap gap-1">
      {(opts?.tags || []).map((t) => {
        const on = ids.includes(t.id);
        return (
          <button key={t.id} type="button" onClick={() => onChange(on ? ids.filter((x) => x !== t.id) : [...ids, t.id], newNames)}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "bg-olive-600 border-olive-600 text-white" : "bg-white text-slate-600 hover:border-slate-400"}`}>{t.name}</button>
        );
      })}
      {newNames.map((n) => (
        <button key={`new-${n}`} type="button" onClick={() => onChange(ids, newNames.filter((x) => x !== n))}
          className="rounded-full border border-dashed border-olive-600 px-2 py-0.5 text-[11px] text-olive-700" title="Paraşüt’te yok — kaydederken açılır">{n} (yeni)</button>
      ))}
      {!opts?.tags.length && !newNames.length && <span className="text-[11px] text-muted-foreground">Etiket yok</span>}
    </div>
  );

  const statusLabel: Record<string, string> = { done: "Kaydedildi", manual: "Paraşüt’te işlendi", ignored: "Paraşüt’te elle girilecek" };

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline"><ArrowLeft size={12} /> Pano</Link>
          <h1 className="text-2xl font-bold">Paraşüt gelen e-faturalar</h1>
          <p className="text-sm text-muted-foreground">Gelen e-fatura burada kabul edilir ve kurala göre (kasa, kategori, etiket) Paraşüt’e kaydedilir.</p>
        </div>
        <Button variant="outline" onClick={() => { setLoading(true); load(); loadOpts(); }} disabled={loading} className="gap-1.5">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Yenile</Button>
      </div>

      {webhook && !webhook.enabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span><b>Gelen fatura bildirimi kapalı.</b> Açınca Paraşüt’e gelen her yeni e-fatura buraya düşer (öncekiler gelmez).</span>
          <Button size="sm" onClick={enableHook} disabled={busy === "hook"} className="gap-1.5">{busy === "hook" ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Bildirimi aç</Button>
        </div>
      )}
      {webhook?.enabled && webhook.uri && typeof window !== "undefined" && !webhook.uri.startsWith(window.location.origin) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>Bildirim başka adrese gidiyor ({webhook.uri}). Bu adrese almak için:</span>
          <Button size="sm" onClick={enableHook} disabled={busy === "hook"}>Bildirimi bu adrese al</Button>
        </div>
      )}
      {refreshError && <p className="text-xs text-red-600">Paraşüt’ten durum okunamadı: {refreshError}</p>}
      {optsError && <p className="text-xs text-red-600">Kasa / kategori / etiket listesi okunamadı: {optsError}</p>}

      {/* Bekleyenler */}
      <section className="space-y-2">
        <h2 className="font-bold">Bekleyen ({open.length})</h2>
        {loading && !open.length ? <Loader2 className="animate-spin" /> : !open.length ? (
          <p className="text-sm text-muted-foreground rounded-xl border bg-white p-4">Bekleyen gelen e-fatura yok.</p>
        ) : open.map((inv) => {
          const c = ch(inv);
          const rule = inv.rule_id ? ruleById.get(inv.rule_id) : null;
          return (
            <div key={inv.id} className={`rounded-xl border bg-white p-3 space-y-2 ${inv.status === "error" ? "border-red-300" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{inv.contact_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    VKN {inv.from_vkn || "—"} · {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString("tr-TR") : "—"}
                    {inv.scenario === "commercial" ? " · Ticari" : inv.scenario === "basic" ? " · Temel" : ""}
                    {inv.item_type === "refund" ? " · İade faturası" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black">{money(inv.net_total, inv.currency)}</p>
                  <p className={`text-[11px] ${rule ? "text-olive-700" : "text-amber-700"}`}>{rule ? `Kural: ${rule.name}` : "Kural yok — elle seç"}</p>
                </div>
              </div>
              {inv.status === "error" && <p className="text-xs text-red-600">Hata: {inv.error} — düzeltip yeniden dene.</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-slate-500 space-y-0.5">Kasa / banka
                  <select className={`${sel} w-full block`} value={c.account_id} onChange={(e) => setCh(inv, { account_id: e.target.value })}>
                    <option value="">— seç —</option>
                    {(opts?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-slate-500 space-y-0.5">Gider kategorisi
                  <select className={`${sel} w-full block`} value={c.category_id} onChange={(e) => setCh(inv, { category_id: e.target.value })}>
                    <option value="">— kategorisiz —</option>
                    {(opts?.categories || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="text-[11px] text-slate-500 space-y-0.5">Etiket
                <TagPicker ids={c.tag_ids} newNames={c.new_tags} onChange={(tag_ids, new_tags) => setCh(inv, { tag_ids, new_tags })} />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={c.mark_paid} onChange={(e) => setCh(inv, { mark_paid: e.target.checked })} /> Ödendi say (seçili kasadan)</label>
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={c.details} onChange={(e) => setCh(inv, { details: e.target.checked })} /> Kalemleri faturadaki isimleriyle aktar</label>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" className="gap-1.5" disabled={!!busy || !opts} onClick={() => processInv(inv)}>{busy === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {inv.status === "error" ? "Yeniden dene" : "Kabul et ve kaydet"}</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => ignore(inv)}>Paraşüt’te elle gireceğim</Button>
                {!rule && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => ruleFromInvoice(inv)}>Kural olarak kaydet</Button>}
              </div>
            </div>
          );
        })}
      </section>

      {/* Son işlenenler */}
      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Son işlenenler</h2>
          <div className="rounded-xl border bg-white divide-y text-xs">
            {closed.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium">{inv.contact_name || "—"} <span className="text-muted-foreground">· {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString("tr-TR") : ""} · {money(inv.net_total, inv.currency)}</span></span>
                <span className="flex items-center gap-2">
                  <span className={inv.status === "done" ? "text-emerald-700" : "text-slate-500"}>{statusLabel[inv.status] || inv.status}{inv.note ? ` — ${inv.note}` : ""}</span>
                  {inv.status === "ignored" && <button className="text-slate-400 hover:text-slate-700 underline" disabled={!!busy} onClick={() => ignore(inv, true)}>geri al</button>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Kurallar */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Kurallar</h2>
          {!editRule && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditRule({ ...EMPTY_RULE })}><Plus size={14} /> Kural ekle</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Faturayı gönderen firmanın adında bu kelime geçerse (ya da VKN tutarsa) seçimler kendiliğinden dolar.</p>
        <div className="rounded-xl border bg-white divide-y text-xs">
          {rules.map((r) => {
            const acc = opts?.accounts.find((a) => a.id === r.account_id)?.name || r.account_name;
            const cat = opts?.categories.find((a) => a.id === r.category_id)?.name || r.category_name;
            const tags = [...new Set([...r.tag_ids.map((id) => opts?.tags.find((t) => t.id === id)?.name).filter(Boolean) as string[], ...r.tag_names])];
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <b>{r.name}</b> <span className="text-muted-foreground">— {r.match_vkn ? `VKN ${r.match_vkn}` : `adında “${r.match_name}”`}</span>
                  <span className="block text-muted-foreground">Kasa: {acc || "—"}{r.mark_paid ? " (ödendi)" : " (ödenmedi)"} · Kategori: {cat || "—"} · Etiket: {tags.join(", ") || "—"}</span>
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditRule({ ...r, match_name: r.match_name ?? "", match_vkn: r.match_vkn ?? "" })}><Pencil size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRule(r)}><Trash2 size={13} /></Button>
                </span>
              </div>
            );
          })}
          {!rules.length && <p className="p-3 text-muted-foreground">Kural yok.</p>}
        </div>

        {editRule && (() => {
          const r = editRule;
          const acc = r.account_id || (opts ? byName(opts.accounts, r.account_name)?.id : null) || "";
          const cat = r.category_id || (opts ? byName(opts.categories, r.category_name)?.id : null) || "";
          const tagIds = r.tag_ids.length ? r.tag_ids : (opts ? r.tag_names.map((n) => byName(opts.tags, n)?.id).filter(Boolean) as string[] : []);
          const newNames = opts ? r.tag_names.filter((n) => !byName(opts.tags, n)) : r.tag_names;
          const set = (p: Partial<Rule>) => setEditRule({ ...r, account_id: acc || null, category_id: cat || null, tag_ids: tagIds, tag_names: newNames, ...p });
          return (
            <div className="rounded-xl border bg-white p-3 space-y-2">
              <p className="font-semibold text-sm">{r.id ? "Kuralı düzenle" : "Yeni kural"}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-[11px] text-slate-500">Kural adı<Input className="h-8 text-xs" value={r.name} onChange={(e) => set({ name: e.target.value })} /></label>
                <label className="text-[11px] text-slate-500">Firma adında geçen<Input className="h-8 text-xs" value={r.match_name ?? ""} onChange={(e) => set({ match_name: e.target.value })} placeholder="ör. DSM Grup" /></label>
                <label className="text-[11px] text-slate-500">ya da VKN<Input className="h-8 text-xs" value={r.match_vkn ?? ""} onChange={(e) => set({ match_vkn: e.target.value })} placeholder="10 hane" /></label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-slate-500">Kasa / banka
                  <select className={`${sel} w-full block`} value={acc} onChange={(e) => set({ account_id: e.target.value || null })}>
                    <option value="">— seç —</option>
                    {(opts?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-slate-500">Gider kategorisi
                  <select className={`${sel} w-full block`} value={cat} onChange={(e) => set({ category_id: e.target.value || null })}>
                    <option value="">— kategorisiz —</option>
                    {(opts?.categories || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="text-[11px] text-slate-500 space-y-0.5">Etiket
                <TagPicker ids={tagIds} newNames={newNames} onChange={(ids, names) => set({ tag_ids: ids, tag_names: names })} />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={r.mark_paid} onChange={(e) => set({ mark_paid: e.target.checked })} /> Ödendi say</label>
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={r.details} onChange={(e) => set({ details: e.target.checked })} /> Kalemleri aktar</label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy === "rule"} onClick={() => saveRule({ ...r, account_id: acc || null, category_id: cat || null, tag_ids: tagIds, tag_names: newNames })}>{busy === "rule" ? <Loader2 size={14} className="animate-spin" /> : null} Kaydet</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditRule(null)}>Vazgeç</Button>
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
