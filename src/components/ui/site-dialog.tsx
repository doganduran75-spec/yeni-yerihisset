"use client";

// Site ile uyumlu onay / bilgi pencereleri — tarayıcının confirm()/alert()
// pencereleri yerine. Her yerden çağrılabilir:
//   if (!(await siteConfirm({ title, message, confirmText: "Onaylıyorum" }))) return;
//   await siteAlert({ title: "Hesabın kapatıldı", message: "…" });
// <SiteDialogHost /> kök layout'ta bir kez render edilir.
import { useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

type Tone = "info" | "success" | "danger";
type DialogReq = {
  kind: "confirm" | "alert";
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
  resolve: (v: boolean) => void;
};

let current: DialogReq | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function open(req: DialogReq) {
  current?.resolve(false); // açık pencere varsa iptal say
  current = req;
  emit();
}
function close(v: boolean) {
  const r = current;
  current = null;
  emit();
  r?.resolve(v);
}

export function siteConfirm(opts: { title?: string; message: string; confirmText?: string; cancelText?: string; tone?: Tone }): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => open({ kind: "confirm", tone: "info", ...opts, resolve }));
}

export function siteAlert(opts: { title?: string; message: string; confirmText?: string; tone?: Tone } | string): Promise<void> {
  const o = typeof opts === "string" ? { message: opts } : opts;
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => open({ kind: "alert", tone: "info", ...o, resolve: () => resolve() }));
}

export function SiteDialogHost() {
  const req = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
    () => null,
  );
  if (!req) return null;
  const tone = req.tone ?? "info";
  const Icon = tone === "danger" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  const iconCls = tone === "danger" ? "bg-red-50 text-red-600" : tone === "success" ? "bg-green-50 text-green-600" : "bg-olive-50 text-olive-600";
  const primaryCls = tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-olive-600 hover:bg-olive-700";

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => close(false)}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${iconCls}`}>
            <Icon size={22} />
          </div>
          <div className="space-y-1.5 pt-0.5">
            {req.title && <h3 className="text-lg font-black text-slate-900 leading-tight">{req.title}</h3>}
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{req.message}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          {req.kind === "confirm" && (
            <button onClick={() => close(false)} className="h-11 px-5 rounded-2xl border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50">
              {req.cancelText || "Vazgeç"}
            </button>
          )}
          <button autoFocus onClick={() => close(true)} className={`h-11 px-5 rounded-2xl text-white font-black text-sm ${primaryCls}`}>
            {req.confirmText || (req.kind === "confirm" ? "Onaylıyorum" : "Tamam")}
          </button>
        </div>
      </div>
    </div>
  );
}
