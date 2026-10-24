// Code128 barkod (kargo etiketi) — bağımlılıksız SVG. Yalnız rakam ve çift uzunluk → C kümesi (daha kısa barkod),
// diğerleri → B kümesi (ASCII 32–126). Kargo firmaları takip kodunu bu barkoddan okur.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104, START_C = 105, STOP = 106;

/** Kod değerleri (başlangıç + veri + kontrol + bitiş) */
export function code128Values(text: string): number[] {
  const s = String(text ?? "");
  const useC = /^\d+$/.test(s) && s.length % 2 === 0 && s.length >= 4;
  const vals: number[] = [useC ? START_C : START_B];
  if (useC) for (let i = 0; i < s.length; i += 2) vals.push(Number(s.slice(i, i + 2)));
  else for (const ch of s) {
    const c = ch.charCodeAt(0);
    vals.push(c >= 32 && c <= 126 ? c - 32 : 0); // desteklenmeyen karakter → boşluk
  }
  let sum = vals[0];
  for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103, STOP);
  return vals;
}

/** SVG çıktısı. module = en dar çubuğun genişliği (birim), height = çubuk yüksekliği. Sessiz bölge 10 modül. */
export function code128Svg(text: string, opts: { height?: number; module?: number } = {}): string {
  const m = opts.module ?? 2, h = opts.height ?? 60, quiet = 10 * m;
  let x = quiet;
  const rects: string[] = [];
  for (const v of code128Values(text)) {
    const p = PATTERNS[v];
    for (let i = 0; i < p.length; i++) {
      const w = Number(p[i]) * m;
      if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="${h}"/>`);
      x += w;
    }
  }
  const width = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">${rects.join("")}</svg>`;
}
