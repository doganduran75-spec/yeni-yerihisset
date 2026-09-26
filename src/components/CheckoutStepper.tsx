"use client";

// Alışveriş akışı ilerleme çubuğu: Sepet › Teslimat › Ödeme.
// Tamamlanmış adıma tıklanınca geri dönülür (onBack ya da link).
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "sepet", label: "Sepet" },
  { key: "teslimat", label: "Teslimat" },
  { key: "odeme", label: "Ödeme" },
] as const;

export type CheckoutStep = (typeof STEPS)[number]["key"];

export default function CheckoutStepper({ current, onGoTeslimat }: { current: CheckoutStep; onGoTeslimat?: () => void }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Alışveriş adımları" className="flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm font-bold">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        const dot = (
          <span className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors",
            active ? "bg-olive-600 text-white" : done ? "bg-olive-100 text-olive-700" : "bg-slate-100 text-slate-400"
          )}>
            {done ? <Check size={14} /> : i + 1}
          </span>
        );
        const text = <span className={cn(active ? "text-slate-900" : done ? "text-olive-700" : "text-slate-400")}>{s.label}</span>;
        const inner = <span className="flex items-center gap-2">{dot}{text}</span>;
        let node = inner;
        if (done && s.key === "sepet") node = <Link href="/sepet" className="hover:opacity-80">{inner}</Link>;
        else if (done && s.key === "teslimat" && onGoTeslimat) node = <button type="button" onClick={onGoTeslimat} className="hover:opacity-80">{inner}</button>;
        return (
          <span key={s.key} className="flex items-center gap-2 sm:gap-3">
            {node}
            {i < STEPS.length - 1 && <span className={cn("h-px w-6 sm:w-12", i < idx ? "bg-olive-300" : "bg-slate-200")} />}
          </span>
        );
      })}
    </nav>
  );
}
