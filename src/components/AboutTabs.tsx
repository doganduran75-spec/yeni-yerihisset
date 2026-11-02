"use client";

// Hakkımızda › pratik bilgiler sekmeleri (Origo sürdürülebilirlik sayfası gibi). İçerik panelden (static_pages
// "hakkimizda-bilgi"), her <h2> bir sekme — bölme src/app/hakkimizda/page.tsx'te.
import { useState } from "react";

export default function AboutTabs({ tabs }: { tabs: { title: string; html: string }[] }) {
  const [active, setActive] = useState(0);
  const t = tabs[active] ?? tabs[0];
  return (
    <div className="mt-8">
      <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
        {tabs.map((x, i) => (
          <button key={x.title} role="tab" aria-selected={i === active} onClick={() => setActive(i)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition-colors ${i === active ? "bg-olive-700 text-white" : "bg-white text-slate-700 hover:bg-olive-50"}`}>
            {x.title}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-5 rounded-3xl bg-white p-6 md:p-8 space-y-4 text-slate-700 leading-relaxed text-[16px] [&_h3]:text-lg [&_h3]:font-black [&_h3]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-olive-700 [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: t.html }} />
    </div>
  );
}
