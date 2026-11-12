"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// MÜŞTERİ SİPARİŞ İPTALİ (2026-11-12): sipariş e-postasındaki "Siparişi iptal et" bağlantısı (?r=imzalı, giriş
// gerekmez) ya da Hesabım › Siparişlerim (?siparis=<id>, oturumla). Kural: src/lib/customer-cancel-rule.ts
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center p-4 py-10">
      <Link href="/" className="mb-6 text-3xl font-black tracking-tighter text-olive-600">Yeri<span className="text-slate-900">Hisset</span></Link>
      <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 p-6 md:p-8">{children}</div>
    </div>
  );
}

const money = (n: number) => `₺${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`;

function Inner() {
  const params = useSearchParams();
  const r = params.get("r") || "";
  const id = params.get("siparis") || "";
  const [v, setV] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ outcome: string; refunded: number; amount: number; iban: string | null } | null>(null);
  const [paidClaim, setPaidClaim] = useState<"" | "no" | "yes">(""); // havale, ödeme onaylanmamış: müşteriye sorulur
  const [iban, setIban] = useState("");
  const [ibanName, setIbanName] = useState("");

  const auth = async (): Promise<Record<string, string>> => {
    if (r) return {};
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  useEffect(() => {
    (async () => {
      if (!r && !id) { setLoadErr("Bağlantı eksik."); return; }
      const q = r ? `r=${encodeURIComponent(r)}` : `id=${encodeURIComponent(id)}`;
      const res = await fetch(`/api/order-cancel?${q}`, { headers: await auth() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setLoadErr(d.error || "Sipariş açılamadı."); else setV(d);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, id]);

  const needIban = v?.mode === "bank_refund" || (v?.mode === "bank_ask" && paidClaim === "yes");
  const ready = v?.mode !== "bank_ask" || paidClaim !== "";

  async function cancel() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/order-cancel", {
      method: "POST", headers: { "Content-Type": "application/json", ...(await auth()) },
      body: JSON.stringify({ r: r || undefined, id: r ? undefined : id, reason: reason || undefined, confirm: true,
        paidClaim: paidClaim === "yes", iban: needIban ? iban : undefined, ibanName: needIban ? ibanName : undefined }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || "İptal yapılamadı."); return; }
    setDone({ outcome: d.outcome, refunded: Number(d.refunded || 0), amount: Number(d.amount || 0), iban: d.iban || null });
  }

  if (loadErr) return <Shell><div className="text-center space-y-3"><AlertCircle className="mx-auto text-amber-500" size={40} /><p className="font-bold text-slate-800">{loadErr}</p>
    <Link href="/account" className="inline-block text-olive-600 font-bold underline">Siparişlerime git</Link></div></Shell>;
  if (!v) return <Shell><div className="flex justify-center py-10"><Loader2 className="animate-spin text-olive-600" /></div></Shell>;

  if (done) return (
    <Shell>
      <div className="text-center space-y-3">
        <CheckCircle2 className="mx-auto text-olive-600" size={44} />
        <h1 className="text-xl font-black text-slate-900">Siparişin iptal edildi</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          <b>{v.label}</b> numaralı siparişini iptal ettik.{" "}
          {done.outcome === "card_refunded" ? <>Kartından çekilen <b>{money(done.refunded)}</b> iade edildi; bankana göre kartına yansıması birkaç iş günü sürebilir.</>
            : done.outcome === "card_refund_pending" ? <><b>{money(done.amount)}</b> tutarındaki kart iaden ekibimiz tarafından en kısa sürede yapılacak.</>
            : done.outcome === "bank_refund_pending" ? <><b>{money(done.amount)}</b> tutarını en kısa sürede IBAN'ına ({done.iban}) göndereceğiz.</>
            : done.outcome === "transfer_check" ? <>Havalen hesabımıza ulaştıysa <b>{money(done.amount)}</b> tutarını IBAN'ına ({done.iban}) iade edeceğiz.</>
            : <>Senden bir ödeme alınmadığı için iade gerekmiyor.</>}
          {" "}Bilgisini e-postayla da gönderdik.
        </p>
        <Link href="/magaza" className="inline-block mt-2 text-olive-600 font-bold underline">Mağazaya dön</Link>
      </div>
    </Shell>
  );

  return (
    <Shell>
      <h1 className="text-xl font-black text-slate-900 mb-1">Siparişi iptal et</h1>
      <p className="text-sm text-slate-500 mb-4">{v.label} · {new Date(v.createdAt).toLocaleDateString("tr-TR")} · {money(v.total)}</p>
      <ul className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-1.5 mb-5 text-sm">
        {v.items.map((i: any, k: number) => (
          <li key={k} className="flex justify-between gap-3"><span className="text-slate-800">{i.title}{i.size ? <span className="text-olive-600"> · {i.size}</span> : null}</span><span className="text-slate-500 shrink-0">{i.qty} adet</span></li>
        ))}
      </ul>

      {!v.canCancel ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-2.5">
          <XCircle size={18} className="shrink-0 mt-0.5" /><span>{v.why}</span>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            {v.mode === "card_refund" ? <>Siparişin henüz kargoya hazırlanmadı. İptal edersen kartından çekilen <b>{money(v.total)}</b> kendiliğinden iade edilir.</>
              : v.mode === "bank_refund" ? <>Siparişin henüz kargoya hazırlanmadı. Havale ödemen alınmıştı: iptal edersen <b>{money(v.total)}</b> tutarını aşağıya yazacağın IBAN'a iade ederiz.</>
              : v.mode === "bank_ask" ? <>Siparişin henüz kargoya hazırlanmadı. Havale / EFT ödemesini yaptın mı?</>
              : <>Siparişin henüz kargoya hazırlanmadı ve ödemen alınmadı; iptal edersen senden bir ödeme alınmaz.</>}
          </p>
          {v.mode === "bank_ask" && (
            <div className="space-y-2">
              {([["no", "Ödeme yapmadım, iptal edilsin"], ["yes", "Ödemeyi yaptım, iptal edilip iade edilsin"]] as const).map(([k, t]) => (
                <label key={k} className={`flex gap-3 rounded-xl border p-3 cursor-pointer text-sm font-bold ${paidClaim === k ? "border-olive-500 bg-olive-50 text-slate-900" : "border-slate-200 text-slate-700"}`}>
                  <input type="radio" name="paid" checked={paidClaim === k} onChange={() => setPaidClaim(k)} className="accent-olive-600" />{t}
                </label>
              ))}
            </div>
          )}
          {needIban && (
            <div className="space-y-2 rounded-2xl border border-slate-200 p-3">
              <p className="text-sm font-bold text-slate-700">İadenin yatırılacağı hesap</p>
              <input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="TR00 0000 0000 0000 0000 0000 00" inputMode="text" autoComplete="off"
                className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-mono" />
              <input value={ibanName} onChange={(e) => setIbanName(e.target.value)} placeholder="Hesap sahibinin adı soyadı" autoComplete="name"
                className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm" />
            </div>
          )}
          <label className="block">
            <span className="text-xs font-bold text-slate-500">Neden iptal ediyorsun? (isteğe bağlı)</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm bg-white">
              <option value="">Seçmek istemiyorum</option>
              {v.reasons.map((x: string) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          {reason === "Yanlış numara / ürün seçtim" && (
            <p className="text-xs text-slate-500 leading-relaxed">İpucu: yalnız numarayı değiştirmek istiyorsan iptal etmeden Siparişlerim’deki <b>Mesaj</b> düğmesinden yazabilirsin; siparişini düzeltelim.</p>
          )}
          {err && <p role="alert" className="text-sm font-bold text-red-600">{err}</p>}
          <button onClick={cancel} disabled={busy || !ready}
            className="w-full h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-sm uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 size={18} className="animate-spin" /> : null} Siparişi iptal et
          </button>
          <Link href="/account" className="block text-center text-sm font-bold text-slate-500 underline">Vazgeç, siparişim devam etsin</Link>
        </div>
      )}
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
