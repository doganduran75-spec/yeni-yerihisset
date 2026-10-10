// ÖLÇÜ TABLOSU + NUMARA ÖNERİSİ (migration 20261102000001). İstemci ve sunucu ortak; bağımlılık yok.
// Kural (kullanıcı): pay eklenmez — ayak ölçüsü hangi numaranın aralığındaysa o numara.
//   Çocuk (grow_up_mm > 0): aralığın üst sınırına grow_up_mm kadar yakınsa bir üst numara ("hızlı büyüyor").
//   Yetişkin: üst sınıra 1 mm yakınsa "sınırdasın — genelde alıştığın numara uyar" notu.

export type SizeRow = { label: string; alt?: string | null; min_mm: number; max_mm: number; note?: string | null };
export type SizeChart = { title?: string | null; note?: string | null; kids: boolean; grow_up_mm: number; rows: SizeRow[] };

export type SizeAdvice =
  | { kind: "fit" | "grow" | "edge"; row: SizeRow; base: SizeRow }
  | { kind: "below" | "above"; row: SizeRow; base: null };

/** "25,5" (cm) / "255" (mm) / "25.5 cm" → mm. Geçersizse null. */
export function parseFootMm(input: string): number | null {
  const n = Number(String(input || "").replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const mm = n < 60 ? n * 10 : n; // 60'tan küçükse cm yazılmıştır
  return mm >= 50 && mm <= 400 ? Math.round(mm) : null;
}

export const sortedRows = (c: SizeChart) => [...(c.rows || [])].sort((a, b) => a.min_mm - b.min_mm);

export function recommendSize(chart: SizeChart, footMm: number): SizeAdvice | null {
  const rows = sortedRows(chart);
  if (!rows.length) return null;
  if (footMm < rows[0].min_mm) return { kind: "below", row: rows[0], base: null };
  const last = rows[rows.length - 1];
  if (footMm > last.max_mm) return { kind: "above", row: last, base: null };
  // Aralıklar arasında boşluk varsa (ör. 220 → 221) bir sonraki numaraya yuvarla
  const i = rows.findIndex((r) => footMm <= r.max_mm);
  const base = rows[i];
  const next = rows[i + 1];
  if (chart.grow_up_mm > 0 && next && footMm >= base.max_mm - chart.grow_up_mm) return { kind: "grow", row: next, base };
  if (!chart.kids && footMm >= base.max_mm - 1 && next) return { kind: "edge", row: base, base };
  return { kind: "fit", row: base, base };
}

const norm = (s: unknown) => String(s ?? "").trim().replace(",", ".").toLocaleUpperCase("tr-TR").replace(/^NO\s*/, "");
/** Tablo satırı ↔ ürün varyantı (numara ya da beden harfi; "No 20" gibi karşılık da eşleşir) */
export const rowMatches = (row: SizeRow, variantValue: unknown) => {
  const v = norm(variantValue);
  return !!v && (norm(row.label) === v || (!!row.alt && norm(row.alt) === v));
};

export const cm = (mm: number) => (mm / 10).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
