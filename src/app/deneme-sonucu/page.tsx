"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, Undo2, Smile } from "lucide-react";
import { supabase } from "@/lib/supabase";

// SATIŞ SONRASI — "Ayakkabın oldu mu?" (teslim e-postasındaki bağlantı ya da Hesabım).
// Oldu → teşekkür · Değişim → stoktaki numaralar (küçük → bir büyük önerilir; yoksa kategoride aynı numara,
// beklerim, ya da iade edip haber bekle) · İade → kargo yolu (UPS adresten / Sürat / Aras şubesi) + havalede IBAN.
// Kurallar ve kayıt: /api/after-sale, src/lib/after-sale.ts

const METHODS = [
  { key: "surat", title: "Sürat Kargo şubesine bırakırım", desc: "Sana en yakın şubeye bırakırsın, ürün hemen yola çıkar." },
  { key: "aras", title: "Aras Kargo şubesine bırakırım", desc: "Sana en yakın şubeye bırakırsın, ürün hemen yola çıkar." },
  { key: "ups", title: "UPS adresimden alsın", desc: "Gelme saatini önceden bilemiyoruz ve adreste teslim edecek biri olmalı. 5 gün içinde gelmezlerse Sürat ya da Aras şubesi için yeni kod göndeririz." },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center p-4 py-10">
      <Link href="/" className="mb-6 text-3xl font-black tracking-tighter text-olive-600">Yeri<span className="text-slate-900">Hisset</span></Link>
      <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 p-6 md:p-8">{children}</div>
    </div>
  );
}

function MethodPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      {METHODS.map((m) => (
        <label key={m.key} className={`flex gap-3 rounded-xl border p-3 cursor-pointer ${value === m.key ? "border-olive-500 bg-olive-50" : "border-slate-200"}`}>
          <input type="radio" checked={value === m.key} onChange={() => onChange(m.key)} className="mt-1 accent-olive-600" />
          <span><span className="block text-sm font-bold text-slate-800">{m.title}</span><span className="block text-xs text-slate-500 mt-0.5">{m.desc}</span></span>
        </label>
      ))}
    </div>
  );
}

function Inner() {
  const params = useSearchParams();
  const r = params.get("r") || "";
  const orderParam = params.get("siparis") || "";
  const [state, setState] = useState<"loading" | "ready" | "error" | "done">(r || orderParam ? "loading" : "error");
  const [doneMsg, setDoneMsg] = useState("");
  const [v, setV] = useState<any>(null);
  const [mode, setMode] = useState<"" | "oldu" | "degisim" | "iade">((params.get("secim") as any) || "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // değişim
  const [exItem, setExItem] = useState<string>("");
  const [dir, setDir] = useState<"up" | "down" | "same" | "">("");
  const [opts, setOpts] = useState<any>(null);
  const [pick, setPick] = useState<string>("");
  // iade
  const [retItems, setRetItems] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState("surat");
  const [iban, setIban] = useState("");
  const [notifyVariant, setNotifyVariant] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [keep, setKeep] = useState("");

  const auth = useCallback(async (): Promise<Record<string, string>> => {
    if (r) return {};
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [r]);
  const q = r ? `r=${encodeURIComponent(r)}` : `order=${encodeURIComponent(orderParam)}`;

  const load = useCallback(async () => {
    const res = await fetch(`/api/after-sale?${q}`, { headers: await auth(), cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setState("error"); return; }
    setV(j);
    if (j.items?.length === 1) setExItem(j.items[0].id);
    setRetItems(new Set((j.items || []).filter((i: any) => i.returned < 1).map((i: any) => i.id)));
    setState("ready");
  }, [q, auth]);

  useEffect(() => { if (r || orderParam) load(); }, [load, r, orderParam]);

  async function loadOptions(item: string, d: "up" | "down" | "same") {
    setDir(d); setOpts(null); setPick(""); setErr(null);
    const res = await fetch(`/api/after-sale?${q}&options=1&item=${item}&dir=${d}`, { headers: await auth() });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setOpts(j); if (j.suggested?.stock > 0) setPick(j.suggested.variant_id); }
  }

  async function post(payload: any, msg: string) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/after-sale", { method: "POST", headers: { "Content-Type": "application/json", ...(await auth()) }, body: JSON.stringify({ ...(r ? { r } : { order: orderParam }), ...payload }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Gönderilemedi, tekrar dener misin?"); return; }
      setDoneMsg(msg); setState("done");
    } finally { setBusy(false); }
  }

  if (state === "loading") return <Shell><div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div></Shell>;
  if (state === "error") return (
    <Shell>
      <div className="text-center space-y-3">
        <AlertCircle className="text-amber-500 mx-auto" size={44} />
        <h1 className="text-xl font-black text-slate-900">Bağlantı geçersiz</h1>
        <p className="text-sm text-slate-500">Bu bağlantı açılamadı. Siparişini Hesabım › Siparişlerim’den görebilir ya da bize mesaj yazabilirsin.</p>
        <Link href="/account" className="inline-block border rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700">Hesabıma git</Link>
      </div>
    </Shell>
  );
  if (state === "done") return (
    <Shell>
      <div className="text-center space-y-3">
        <CheckCircle2 className="text-green-500 mx-auto" size={48} />
        <h1 className="text-xl font-black text-slate-900">Teşekkürler 🙌</h1>
        <p className="text-sm text-slate-600">{doneMsg}</p>
        <Link href="/magaza" className="inline-block bg-olive-600 text-white rounded-xl px-6 py-3 text-sm font-bold">Alışverişe devam et</Link>
      </div>
    </Shell>
  );

  const c = v.openCase;
  const head = <p className="text-xs font-bold text-slate-400 mb-1">Sipariş {v.orderLabel}</p>;
  const itemsActive = (v.items || []).filter((i: any) => i.returned < 1);

  // ── Açık talep ──
  if (c) {
    if (c.kind === "exchange" && c.status === "alt_delivered") {
      return (
        <Shell>
          {head}
          <h1 className="text-xl font-black text-slate-900 mb-1">Hangisi oldu?</h1>
          <p className="text-sm text-slate-500 mb-4">Tuttuğunu seç; diğerini nasıl göndereceğini söyle, kargo kodunu e-postayla gönderelim.</p>
          <div className="space-y-2 mb-4">
            {itemsActive.map((i: any) => (
              <label key={i.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${keep === i.id ? "border-olive-500 bg-olive-50" : "border-slate-200"}`}>
                <input type="radio" checked={keep === i.id} onChange={() => setKeep(i.id)} className="accent-olive-600" />
                <span className="text-sm font-bold text-slate-800">{i.title}{i.size ? ` — ${i.size}` : ""}</span>
              </label>
            ))}
          </div>
          <p className="text-sm font-bold text-slate-700 mb-2">Diğerini nasıl göndereceksin?</p>
          <MethodPicker value={method} onChange={setMethod} />
          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
          <button disabled={busy || !keep} onClick={() => post({ action: "keep", keep_item_id: keep, method }, "Seçimini aldık. Geri gönderim kargo kodunu kısa süre içinde e-postayla göndereceğiz.")}
            className="mt-4 w-full h-12 rounded-xl bg-olive-600 text-white font-bold text-sm disabled:opacity-50">Kaydet</button>
          <p className="text-xs text-slate-400 mt-3 text-center">İkisi de olmadıysa Hesabım › Siparişlerim’den bize mesaj yaz.</p>
        </Shell>
      );
    }
    const msg: Record<string, string> = {
      "exchange:requested": "Değişim talebini aldık; istediğin numarayı kısa süre içinde kargoya veriyoruz.",
      "exchange:waiting_stock": "İstediğin numara stoğa girince gönderiyoruz; seni e-postayla haberdar edeceğiz.",
      "exchange:alt_shipped": "Yeni numaran kargoda. Ulaşınca ikisini de dene, hangisinin olduğunu bize söyle.",
      "exchange:keep_chosen": "Seçimini aldık; geri gönderim kargo kodunu e-postayla göndereceğiz.",
      "exchange:label_sent": "Kargo kodunu e-postayla gönderdik. Tutmadığın ürünü bize ulaştırınca değişimin tamamlanır.",
      "return:requested": "İade talebini aldık; kargo kodunu kısa süre içinde e-postayla göndereceğiz.",
      "return:label_sent": "İade kargo kodunu e-postayla gönderdik. Ürün bize ulaşınca ödemeni iade ediyoruz.",
    };
    return (
      <Shell>
        {head}
        <div className="text-center space-y-3">
          {c.kind === "exchange" ? <RefreshCw className="text-olive-600 mx-auto" size={40} /> : <Undo2 className="text-olive-600 mx-auto" size={40} />}
          <h1 className="text-xl font-black text-slate-900">{c.kind === "exchange" ? "Değişim talebin" : "İade talebin"}</h1>
          <p className="text-sm text-slate-600">{msg[`${c.kind}:${c.status}`] ?? "Talebin işleniyor."}</p>
          {c.return_code && <p className="text-sm">Kargo kodun: <b className="font-mono tracking-wider">{c.return_code}</b></p>}
        </div>
      </Shell>
    );
  }

  if (v.fitStatus === "ok") return (
    <Shell>{head}<div className="text-center space-y-3"><Smile className="text-olive-600 mx-auto" size={44} /><h1 className="text-xl font-black text-slate-900">Ayakkabın sana uydu 🎉</h1><p className="text-sm text-slate-600">İyi günlerde giy! Bir sorun olursa Hesabım’dan bize yazabilirsin.</p></div></Shell>
  );
  if (!v.canAnswer) return (
    <Shell>{head}<div className="text-center space-y-3"><AlertCircle className="text-slate-400 mx-auto" size={40} /><h1 className="text-lg font-black text-slate-900">Bu sipariş için şu an işlem yapılamıyor</h1><p className="text-sm text-slate-500">Sipariş henüz teslim edilmemiş ya da değişim/iade süresi dolmuş olabilir. Hesabım’dan bize mesaj yazabilirsin.</p></div></Shell>
  );

  const exItemObj = v.items.find((i: any) => i.id === exItem);
  return (
    <Shell>
      {head}
      <h1 className="text-xl font-black text-slate-900 mb-1">Ayakkabın oldu mu?</h1>
      <p className="text-sm text-slate-500 mb-4">Acele yok — evde, günün farklı saatlerinde dene. Karar verince bize söyle.</p>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {([["oldu", "Oldu"], ["degisim", "Değişim"], ["iade", "İade"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setMode(k); setErr(null); }} className={`h-11 rounded-xl border text-sm font-bold ${mode === k ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 text-slate-700"}`}>{l}</button>
        ))}
      </div>

      {mode === "oldu" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Harika! Onaylarsan siparişini tamamlıyoruz.</p>
          <button disabled={busy} onClick={() => post({ action: "ok" }, "Ayakkabının sana uymasına çok sevindik. İyi günlerde giy!")} className="w-full h-12 rounded-xl bg-olive-600 text-white font-bold text-sm disabled:opacity-50">Evet, ayakkabım oldu</button>
        </div>
      )}

      {mode === "degisim" && (
        <div className="space-y-4">
          {v.items.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-700">Hangi ürün?</p>
              {itemsActive.map((i: any) => (
                <label key={i.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${exItem === i.id ? "border-olive-500 bg-olive-50" : "border-slate-200"}`}>
                  <input type="radio" checked={exItem === i.id} onChange={() => { setExItem(i.id); setOpts(null); setDir(""); }} className="accent-olive-600" />
                  <span className="text-sm text-slate-800">{i.title}{i.size ? ` — ${i.size}` : ""}</span>
                </label>
              ))}
            </div>
          )}
          {exItem && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-700">{exItemObj?.title}{exItemObj?.size ? ` (${exItemObj.size})` : ""} nasıl geldi?</p>
              <div className="grid grid-cols-3 gap-2">
                {([["down", "Büyük geldi"], ["up", "Küçük geldi"], ["same", "Başka sebep"]] as const).map(([d, l]) => (
                  <button key={d} onClick={() => { setReason(d === "up" ? "small" : d === "down" ? "big" : "other"); loadOptions(exItem, d); }} className={`h-10 rounded-xl border text-xs font-bold ${dir === d ? "border-olive-600 bg-olive-50 text-olive-800" : "border-slate-200 text-slate-700"}`}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {opts && (
            <div className="space-y-3">
              {opts.target && opts.suggested && opts.suggested.stock > 0 && <p className="text-sm text-olive-700 font-bold">Önerimiz: {opts.target} numara ✓ stokta</p>}
              {opts.target && (!opts.suggested || opts.suggested.stock < 1) && dir !== "same" && <p className="text-sm text-amber-700 font-bold">{opts.target} numara bu modelde şu an stokta yok.</p>}
              <div className="flex flex-wrap gap-2">
                {opts.same.map((s: any) => (
                  <button key={s.variant_id} disabled={s.stock < 1} onClick={() => setPick(s.variant_id)}
                    className={`min-w-12 h-10 px-3 rounded-lg border text-sm font-bold ${pick === s.variant_id ? "border-olive-600 bg-olive-600 text-white" : s.stock < 1 ? "border-slate-100 text-slate-300 line-through" : "border-slate-300 text-slate-700"}`}>{s.size}</button>
                ))}
              </div>
              {opts.others?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500">Aynı kategoride {opts.target} numarası stokta olanlar:</p>
                  {opts.others.map((o: any) => (
                    <label key={o.variant_id} className={`flex items-center gap-3 rounded-xl border p-2 cursor-pointer ${pick === o.variant_id ? "border-olive-500 bg-olive-50" : "border-slate-200"}`}>
                      <input type="radio" checked={pick === o.variant_id} onChange={() => setPick(o.variant_id)} className="accent-olive-600" />
                      {o.image && <img src={o.image} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                      <span className="text-sm text-slate-800 flex-1">{o.title} — {o.size}</span>
                    </label>
                  ))}
                </div>
              )}
              {opts.target && opts.suggested && opts.suggested.stock < 1 && (
                <div className="grid gap-2">
                  <button disabled={busy} onClick={() => post({ action: "exchange", reason, note, items: [{ order_item_id: exItem, variant_id: opts.suggested.variant_id, wait: true }] }, `${opts.target} numara stoğa girince gönderip seni haberdar edeceğiz.`)}
                    className="h-11 rounded-xl border border-olive-300 text-olive-800 text-sm font-bold">{opts.target} numarayı beklerim, gelince gönderin</button>
                  <button onClick={() => { setNotifyVariant(opts.suggested.variant_id); setMode("iade"); setRetItems(new Set([exItem])); }}
                    className="h-11 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">İade edeyim, {opts.target} gelince haber verin</button>
                </div>
              )}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Eklemek istediğin bir not (opsiyonel)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              {err && <p className="text-sm text-red-600">{err}</p>}
              <button disabled={busy || !pick} onClick={() => post({ action: "exchange", reason, note, items: [{ order_item_id: exItem, variant_id: pick }] }, "Değişim talebini aldık; yeni numaranı kısa süre içinde kargoya veriyoruz. Elindekini, yeni numarayı denedikten sonra geri göndereceksin.")}
                className="w-full h-12 rounded-xl bg-olive-600 text-white font-bold text-sm disabled:opacity-50">Bu numarayı gönderin</button>
              <p className="text-xs text-slate-400 text-center">Yeni numarayı gönderiyoruz; ikisini de deneyip olmayanı geri gönderirsin.</p>
            </div>
          )}
        </div>
      )}

      {mode === "iade" && (
        <div className="space-y-4">
          {notifyVariant && <p className="text-xs text-olive-700 bg-olive-50 rounded-lg p-2">İstediğin numara stoğa girince sana e-postayla haber vereceğiz.</p>}
          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-700">İade edilecek ürün</p>
            {itemsActive.map((i: any) => (
              <label key={i.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer">
                <input type="checkbox" checked={retItems.has(i.id)} onChange={(e) => setRetItems((p) => { const n = new Set(p); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} className="accent-olive-600" />
                <span className="text-sm text-slate-800">{i.title}{i.size ? ` — ${i.size}` : ""}</span>
              </label>
            ))}
          </div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm bg-white">
            <option value="">İade sebebi (opsiyonel)</option>
            <option value="small">Küçük geldi</option><option value="big">Büyük geldi</option>
            <option value="Beğenmedim">Beğenmedim</option><option value="Kusurlu / hasarlı">Kusurlu / hasarlı geldi</option><option value="Diğer">Diğer</option>
          </select>
          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">Ürünü nasıl göndereceksin?</p>
            <MethodPicker value={method} onChange={setMethod} />
          </div>
          {v.paymentMethod === "bank_transfer" && (
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-700">İadenin yatırılacağı IBAN</p>
              <input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="TR00 0000 0000 0000 0000 0000 00" className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-mono" />
              <p className="text-xs text-slate-400">Havaleyle ödediğin için ödemeni bu hesaba iade edeceğiz. Hesap senin adına olmalı.</p>
            </div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Eklemek istediğin bir not (opsiyonel)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button disabled={busy || retItems.size === 0} onClick={() => post({ action: "return", items: [...retItems], reason, note, method, iban, notify_variant_id: notifyVariant }, "İade talebini aldık. Kargo kodunu kısa süre içinde e-postayla göndereceğiz; ürün bize ulaşınca ödemeni iade ediyoruz.")}
            className="w-full h-12 rounded-xl bg-slate-800 text-white font-bold text-sm disabled:opacity-50">İade talebini gönder</button>
        </div>
      )}
    </Shell>
  );
}

export default function DenemeSonucuPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
