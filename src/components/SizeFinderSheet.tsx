"use client";

// DOĞRU NUMARAYI BUL (kullanıcı 2026-11-19: mobil ana sayfadaki bant mağaza sayfasını açıyordu, numara adımı yoktu).
// 1) Kimin için? (Yetişkin / 0–4 Yaş İlkadım)  2) Ayak ölçüsü → markanın ölçü tablosuna göre numara önerisi
// (src/lib/size-chart.ts — ürün sayfasındaki "Numaramı bul" ile aynı kural)  3) "O numaradaki modelleri gör" →
// /magaza/<segment>?numara=… (mağaza o numarayı seçili açar; numara_alt: tabloda numaranın ikinci adı, ör. cm).
// Ölçü tablosu: Ayarlar › Markalar (size_charts; kids = İlkadım). Tablo yoksa doğrudan o mağazaya gider.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ruler, X, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SEGMENTS, type Segment } from "@/config/segments";
import { type SizeChart, parseFootMm, recommendSize, cm } from "@/lib/size-chart";
import { track } from "@/lib/track";

export default function SizeFinderSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [charts, setCharts] = useState<SizeChart[] | null>(null);
  const [seg, setSeg] = useState<Segment | null>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    (supabase as any).from("size_charts").select("title, note, kids, grow_up_mm, rows") // eslint-disable-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: SizeChart[] | null }) => setCharts((data || []).filter((c) => Array.isArray(c.rows) && c.rows.length)));
  }, []);

  const chart = seg && charts ? charts.find((c) => !!c.kids === (seg === "ilkadim")) ?? null : null;
  const mm = parseFootMm(input);
  const advice = chart && mm ? recommendSize(chart, mm) : null;

  function chooseSegment(s: Segment) {
    track("size_finder_segment", { segment: s });
    const c = charts?.find((x) => !!x.kids === (s === "ilkadim"));
    if (charts && !c) { router.push(SEGMENTS[s].path); onClose(); return; } // ölçü tablosu yok → mağazada numara seç
    setSeg(s);
  }

  function go(label?: string, alt?: string | null) {
    if (!seg) return;
    const q = label ? `?numara=${encodeURIComponent(label)}${alt ? `&numara_alt=${encodeURIComponent(alt)}` : ""}` : "";
    track("size_finder_go", { segment: seg, size: label || null, foot_mm: mm || null });
    router.push(`${SEGMENTS[seg].path}${q}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-black text-slate-900 flex items-center gap-2">
            {seg && <button type="button" onClick={() => { setSeg(null); setInput(""); }} aria-label="Geri" className="p-1 -ml-1 text-slate-500"><ChevronLeft size={18} /></button>}
            <Ruler size={18} className="text-olive-600" /> Doğru numarayı bul
          </h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {!seg ? (
          <div className="p-5 space-y-3">
            <p className="text-sm font-black text-slate-800">Kimin için?</p>
            {(Object.keys(SEGMENTS) as Segment[]).map((s) => (
              <button key={s} type="button" onClick={() => chooseSegment(s)} disabled={!charts}
                className="w-full text-left rounded-2xl border-2 border-slate-200 hover:border-olive-500 px-4 py-3 disabled:opacity-50">
                <p className="font-black text-slate-900">{SEGMENTS[s].label}</p>
                <p className="text-xs text-slate-500">{SEGMENTS[s].card}</p>
              </button>
            ))}
          </div>
        ) : chart ? (
          <div className="p-5 space-y-3">
            <p className="text-sm font-black text-slate-800">{seg === "ilkadim" ? "Bebeğin ayağını ölç" : "Ayağını ölç"}</p>
            <ol className="text-xs text-slate-600 space-y-1 list-decimal pl-4">
              <li>Bir kâğıdı duvarın dibine koy, topuk duvara değecek şekilde üstüne bas{chart.kids ? " (bebeğin ayağını hafifçe bastırarak)" : ""}.</li>
              <li>En uzun parmağın ucunu kalemle işaretle (kalemi dik tut).</li>
              <li>Duvardan işarete kadar ölç. İki ayağı da ölç, büyük olanı yaz.</li>
            </ol>
            <div className="flex items-center gap-2">
              <input autoFocus inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={chart.kids ? "Ör. 12,5 cm" : "Ör. 25,5 cm"}
                className="flex-1 h-12 rounded-xl border-2 border-slate-200 focus:border-olive-500 outline-none px-3 text-base" />
              <span className="text-xs text-slate-400 w-20">cm ya da mm</span>
            </div>
            {input && !mm && <p className="text-xs text-red-600">Ölçüyü sayı olarak yaz (ör. 25,5 ya da 255).</p>}

            {advice && (
              <div className="rounded-2xl bg-olive-50 border border-olive-200 p-4 space-y-2">
                {advice.kind === "below" || advice.kind === "above" ? (
                  <p className="text-sm text-slate-700">Ölçün ({cm(mm!)} cm) tablonun {advice.kind === "below" ? "altında" : "üstünde"}. Bize mesaj yaz, birlikte bakalım.</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-700">Ayak ölçün <b>{cm(mm!)} cm</b> → numaran</p>
                    <p className="text-3xl font-black text-olive-800">{advice.row.label}{advice.row.alt ? <span className="text-base font-bold text-olive-600"> ({advice.row.alt})</span> : null}</p>
                    {advice.kind === "grow" && <p className="text-xs text-olive-800">Ölçün {advice.base.label} aralığının üst sınırına yakın; ayak hızlı büyüdüğü için bir üst bedeni öneriyoruz.</p>}
                    {advice.kind === "edge" && <p className="text-xs text-olive-800">Ölçün aralığın üst sınırında. Genelde alıştığın numara uyar; ayağın genişse bir büyüğünü düşünebilirsin.</p>}
                    {advice.row.note && <p className="text-xs text-slate-500">{advice.row.note}</p>}
                    <button type="button" onClick={() => go(advice.row.label, advice.row.alt)}
                      className="w-full h-12 rounded-xl bg-olive-600 hover:bg-olive-700 text-white font-bold text-sm">
                      {advice.row.label} numaradaki modelleri gör
                    </button>
                  </>
                )}
              </div>
            )}

            <button type="button" onClick={() => go()} className="w-full text-center text-sm font-bold text-olive-700 underline underline-offset-4 pt-1">
              Numaramı biliyorum — mağazaya geç
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
