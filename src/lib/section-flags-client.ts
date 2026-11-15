"use client";

// Tarayıcıda Fırsatlar / Bilgi Bankası açık mı (menüler). Sayfa başına bir sorgu; yüklenene kadar ikisi de gizli
// (kapalıyken menüde bir an görünüp kaybolmasın). Kural: src/lib/section-flags.ts.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { flagsFromRow, type SectionFlags } from "@/lib/section-flags";

let pending: Promise<SectionFlags> | null = null;
function load(): Promise<SectionFlags> {
  pending ??= Promise.resolve(
    (supabase as any).from("settings").select("opportunities_enabled, kb_enabled").order("id", { ascending: true }).limit(1).maybeSingle(), // eslint-disable-line @typescript-eslint/no-explicit-any
  ).then(({ data, error }: any) => flagsFromRow(data, error)).catch(() => flagsFromRow(null, true)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return pending;
}
/** Yönetici kutuyu değiştirince aynı sekmede menü tazelensin */
export function resetSectionFlags() { pending = null; }

export function useSectionFlags(): SectionFlags & { loaded: boolean } {
  const [f, setF] = useState<SectionFlags & { loaded: boolean }>({ deals: false, kb: false, loaded: false });
  useEffect(() => { let on = true; void load().then((x) => { if (on) setF({ ...x, loaded: true }); }); return () => { on = false; }; }, []);
  return f;
}
