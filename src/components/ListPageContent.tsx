/* eslint-disable @typescript-eslint/no-explicit-any */
// Kategori / marka sayfasının tanıtım metni + SSS (Ayarlar › Kategoriler / Markalar › "Sayfa metni", migration 20261114).
// SSS ayrıca FAQPage yapısal verisi olarak basılır (yapay zekâ ve arama motorları soru-cevabı doğrudan okur).
const safeJsonLd = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function ListIntro({ intro }: { intro?: string | null }) {
  if (!intro?.trim()) return null;
  return <p className="text-slate-600 mt-3 max-w-3xl leading-relaxed whitespace-pre-line">{intro.trim()}</p>;
}

export function ListFaq({ faq }: { faq?: any }) {
  const items = (Array.isArray(faq) ? faq : []).filter((f: any) => f?.q && f?.a) as { q: string; a: string }[];
  if (!items.length) return null;
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <section className="mt-14 max-w-3xl">
      <h2 className="text-2xl font-black text-slate-900 mb-4">Sık sorulan sorular</h2>
      <div className="divide-y rounded-2xl border border-slate-100 bg-white">
        {items.map((f, i) => (
          <details key={i} className="group px-5 py-4" open={i === 0}>
            <summary className="cursor-pointer font-bold text-slate-800 list-none">{f.q}</summary>
            <p className="text-slate-600 mt-2 leading-relaxed whitespace-pre-line">{f.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }} />
    </section>
  );
}

/** Meta açıklama: tanıtım metninin başı (~155 karakter), yoksa varsayılan */
export function introDescription(intro: string | null | undefined, fallback: string): string {
  const t = String(intro || "").replace(/\s+/g, " ").trim();
  if (!t) return fallback;
  return t.length <= 158 ? t : t.slice(0, 155).replace(/\s+\S*$/, "") + "…";
}
