// FIRSATLAR + BİLGİ BANKASI AÇ / KAPA (kullanıcı 2026-11-15, MIG 20261186). Kapalıyken menülerde görünmez,
// sayfa doğrudan adresle açılır ama noindex + site haritasında yok. Kolonlar yoksa (migration uygulanmadıysa) AÇIK sayılır
// (eski davranış bozulmasın). Sunucu: getSectionFlags() · tarayıcı: useSectionFlags() (src/lib/section-flags-client.ts).
import { createClient } from "@supabase/supabase-js";

export type SectionFlags = { deals: boolean; kb: boolean };
export const FLAGS_ALL_ON: SectionFlags = { deals: true, kb: true };

export function flagsFromRow(row: any, error?: unknown): SectionFlags { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (error || !row) return FLAGS_ALL_ON;
  return { deals: row.opportunities_enabled !== false, kb: row.kb_enabled !== false };
}

export async function getSectionFlags(): Promise<SectionFlags> {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await sb.from("settings").select("opportunities_enabled, kb_enabled").order("id", { ascending: true }).limit(1).maybeSingle();
    return flagsFromRow(data, error);
  } catch {
    return FLAGS_ALL_ON;
  }
}
