/* eslint-disable @typescript-eslint/no-explicit-any */
// Ana sayfa metinleri birleştirme (saf fonksiyon; sunucu + panel kullanır). Yalnız varsayılanda olan alanlar ve
// aynı türde değerler alınır → yanlış / eski kayıt sayfayı bozamaz.
export function mergeHomeContent(base: any, over: any): any {
  if (Array.isArray(base)) {
    if (!Array.isArray(over)) return base;
    return base.map((b, i) => (i < over.length ? mergeHomeContent(b, over[i]) : b));
  }
  if (base && typeof base === "object") {
    if (!over || typeof over !== "object" || Array.isArray(over)) return base;
    const out: any = {};
    for (const k of Object.keys(base)) out[k] = k in over ? mergeHomeContent(base[k], over[k]) : base[k];
    return out;
  }
  return typeof over === typeof base ? over : base;
}
