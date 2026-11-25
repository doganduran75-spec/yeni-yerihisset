// ÜRÜN GÖRSELİ ÖLÇÜ + İNDİRME (kullanıcı 2026-11-25): ürün formunda her yüklenmiş görselin köşesinde
// ölçü (px) + dosya boyutu, ağırsa kırmızı; indirme düğmesi Storage ?download= ile dosyayı indirir.
// Kod denetimi + canlı Storage başlık denetimi. Veri değiştirmez.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Ürün görseli ölçü + indirme",
  async run(t) {
    await t.part("Ürün formunda görsel ölçüsü ve indirme düğmesi var", async () => {
      const c = rd("src/components/admin/products/ImageInfo.tsx");
      const f = rd("src/components/admin/products/ProductForm.tsx");
      const okC = /naturalWidth/.test(c) && /content-length/.test(c) && /searchParams\.set\("download"/.test(c) && /HEAVY_KB = 500/.test(c);
      t.add(okC ? "ok" : "fail", "Görsel bilgisi: px ölçü, KB boyut, ağır uyarısı, indirme bağlantısı", okC ? "" : "ImageInfo eksik");
      const n = (f.match(/<ImageInfo url=/g) || []).length;
      t.add(n >= 2 ? "ok" : "fail", "Ana görseller ve varyasyon fotoğraflarında gösteriliyor", n >= 2 ? "" : `yalnız ${n} yerde`);
    });
    await t.part("Storage indirme ve boyut başlığı", async () => {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.yerihisset.com";
      // Yayındaki bir ürünün görseli (herkese açık kova)
      const res = await fetch(`${base}/rest/v1/products?select=images&is_active=eq.true&limit=5`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}` },
      }).catch(() => null);
      const rows = res && res.ok ? await res.json() : [];
      const url = rows.flatMap((r) => r.images || []).find((u) => /\/storage\/v1\/object\/public\//.test(u));
      if (!url) { t.add("warn", "Denenecek ürün görseli bulunamadı", ""); return; }
      const g = await fetch(`${url}?download=x.jpg`).catch(() => null);
      const cd = g?.headers.get("content-disposition") || "";
      await g?.arrayBuffer().catch(() => {});
      t.add(/attachment/.test(cd) ? "ok" : "fail", "İndir düğmesi dosyayı indiriyor (Content-Disposition: attachment)", cd || "başlık yok");
      const h = await fetch(url, { method: "HEAD" }).catch(() => null);
      const len = Number(h?.headers.get("content-length") || 0);
      t.add(len > 0 ? "ok" : "fail", "Dosya boyutu okunabiliyor (Content-Length)", len > 0 ? "" : "boyut başlığı yok");
    });
  },
};
