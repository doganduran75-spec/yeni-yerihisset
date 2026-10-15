"use client";

// Ayarlar › Entegrasyonlar: her entegrasyon bir açılır bölüm (akordiyon). Kapalıyken yalnız başlık + durum
// rozeti görünür; tıklayınca açılır. Sağdaki aç/kapat düğmesi (right) başlığa tıklamayı tetiklemez.
// Açık bölümler tarayıcıda hatırlanır (yalnız bu yöneticinin kolaylığı için).
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type SectionTone = "ok" | "off" | "warn";
const TONE: Record<SectionTone, string> = {
  ok: "bg-green-50 text-green-700 border-green-200",
  off: "bg-slate-100 text-slate-600 border-slate-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
};
const KEY = "yh-integrations-open";

function readOpen(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export default function IntegrationSection({ id, icon, title, summary, status, tone = "off", right, children }: {
  id: string; icon?: ReactNode; title: string; summary?: ReactNode; status?: string; tone?: SectionTone; right?: ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (readOpen().includes(id)) setOpen(true); }, [id]); // eslint-disable-line react-hooks/set-state-in-effect
  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      const list = readOpen().filter((x) => x !== id);
      localStorage.setItem(KEY, JSON.stringify(next ? [...list, id] : list));
    } catch { /* tarayıcı depolaması kapalı — sorun değil */ }
  }
  return (
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={`int-${id}`}
          className="flex flex-1 min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive-300 rounded-lg">
          <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          {icon}
          <span className="min-w-0">
            <span className="block font-bold text-slate-900">{title}</span>
            {summary && <span className="block text-xs text-muted-foreground truncate">{summary}</span>}
          </span>
        </button>
        {status && <span className={`hidden sm:inline-block shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}>{status}</span>}
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {open && <div id={`int-${id}`} className="border-t px-4 py-4 space-y-5">{children}</div>}
    </section>
  );
}
