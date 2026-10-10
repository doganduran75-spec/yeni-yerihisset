"use client";

import { useState } from "react";
import { Ruler, X, Check } from "lucide-react";
import { type SizeChart, parseFootMm, recommendSize, rowMatches, sortedRows, cm } from "@/lib/size-chart";

// "Beden tablosu · Numaramı bul" — ürün sayfasında numara seçiminin yanında (kullanıcı notu 7).
// Müşteri ayak ölçüsünü girer → markanın tablosuna göre numara önerilir (pay eklenmez; bebekte
// büyüme payı), o numaranın stoğu gösterilir, tek tıkla seçilir. Tablo: Ayarlar › Markalar.
type V = { id: string; value: string; stock: number };

export default function SizeGuide({ chart, variants, onPick }: { chart: SizeChart; variants: V[]; onPick: (variantId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const mm = parseFootMm(input);
  const advice = mm ? recommendSize(chart, mm) : null;
  const variantFor = (label: { label: string; alt?: string | null }) => variants.find((v) => rowMatches(label as any, v.value)); // eslint-disable-line @typescript-eslint/no-explicit-any
  const rec = advice ? variantFor(advice.row) : undefined;
  const rows = sortedRows(chart);
  const range = (r: { min_mm: number; max_mm: number }) => `${cm(r.min_mm)} – ${cm(r.max_mm)} cm`;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-bold text-olive-700 hover:text-olive-900 underline underline-offset-4">
        <Ruler size={15} /> Beden tablosu · Numaramı bul
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-3" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-black text-slate-900 flex items-center gap-2"><Ruler size={18} className="text-olive-600" /> {chart.title || "Beden tablosu"}</h2>
              <button onClick={() => setOpen(false)} aria-label="Kapat" className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* Numaramı bul */}
              <div className="space-y-3">
                <p className="text-sm font-black text-slate-800">Numaranı bul</p>
                <ol className="text-xs text-slate-600 space-y-1 list-decimal pl-4">
                  <li>Bir kâğıdı duvarın dibine koy, topuğun duvara değecek şekilde üstüne bas{chart.kids ? " (bebeğin ayağını hafifçe bastırarak)" : ""}.</li>
                  <li>En uzun parmağının ucunu kalemle işaretle (kalemi dik tut).</li>
                  <li>Duvardan işarete kadar ölç. İki ayağı da ölç, büyük olanı yaz.</li>
                </ol>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={chart.kids ? "Ör. 110 mm" : "Ör. 25,5 cm"}
                    className="flex-1 h-12 rounded-xl border-2 border-slate-200 focus:border-olive-500 outline-none px-3 text-base"
                  />
                  <span className="text-xs text-slate-400 w-20">cm ya da mm</span>
                </div>

                {input && !mm && <p className="text-xs text-red-600">Ölçüyü sayı olarak yaz (ör. 25,5 ya da 255).</p>}
                {advice && (
                  <div className="rounded-2xl bg-olive-50 border border-olive-200 p-4 space-y-2">
                    {advice.kind === "below" || advice.kind === "above" ? (
                      <p className="text-sm text-slate-700">Ölçün ({cm(mm!)} cm) tablonun {advice.kind === "below" ? "altında" : "üstünde"}. Bize mesaj yaz, birlikte bakalım.</p>
                    ) : (
                      <>
                        <p className="text-sm text-slate-700">Ayak ölçün <b>{cm(mm!)} cm</b> →</p>
                        <p className="text-2xl font-black text-olive-800">{advice.row.label}{advice.row.alt ? <span className="text-base font-bold text-olive-600"> (No {advice.row.alt})</span> : null}</p>
                        {advice.kind === "grow" && <p className="text-xs text-olive-800">Ölçün {advice.base.label} aralığının üst sınırına yakın; ayak hızlı büyüdüğü için bir üst bedeni öneriyoruz.</p>}
                        {advice.kind === "edge" && <p className="text-xs text-olive-800">Ölçün aralığın üst sınırında. Genelde alıştığın numara uyar; ayağın genişse bir büyüğünü düşünebilirsin.</p>}
                        {advice.row.note && <p className="text-xs text-slate-500">{advice.row.note}</p>}
                        {rec ? (
                          rec.stock > 0 ? (
                            <button onClick={() => { onPick(rec.id); setOpen(false); }} className="w-full h-11 rounded-xl bg-olive-600 hover:bg-olive-700 text-white font-bold text-sm flex items-center justify-center gap-1.5">
                              <Check size={16} /> {advice.row.label} numarayı seç
                            </button>
                          ) : (
                            <button onClick={() => { onPick(rec.id); setOpen(false); }} className="w-full h-11 rounded-xl border-2 border-amber-300 text-amber-800 font-bold text-sm">
                              Şu an stokta yok — seç, gelince haber verelim
                            </button>
                          )
                        ) : (
                          <p className="text-xs text-slate-500">Bu üründe bu numara yok.</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Tablo */}
              <div>
                <p className="text-sm font-black text-slate-800 mb-2">Ölçü tablosu</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b">
                      <th className="text-left py-2 font-bold">{chart.kids ? "Beden" : "Numara"}</th>
                      <th className="text-left py-2 font-bold">Ayak ölçüsü</th>
                      {rows.some((r) => r.note) && <th className="text-left py-2 font-bold">Not</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const hit = advice && advice.row.label === r.label;
                      return (
                        <tr key={r.label} className={`border-b border-slate-100 ${hit ? "bg-olive-50 font-bold text-olive-800" : "text-slate-700"}`}>
                          <td className="py-2">{r.label}{r.alt ? <span className="text-slate-400 font-normal"> · No {r.alt}</span> : null}</td>
                          <td className="py-2">{range(r)}</td>
                          {rows.some((x) => x.note) && <td className="py-2 text-xs text-slate-500">{r.note || ""}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {chart.note && <p className="text-xs text-slate-500 mt-3">{chart.note}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
