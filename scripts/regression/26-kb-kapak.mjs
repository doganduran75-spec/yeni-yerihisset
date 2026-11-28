// BİLGİ BANKASI KAPAK GÖRSELİ (kullanıcı 2026-11-28: "ilk foto yazı tanıtım fotosu oluyor ama alttan üstten kırpılıyor…
// gönderi görseli gibi bir özellik ekleyip orada nasıl gözükeceğini görebilirim"): seçilen kapak → yoksa yazıdaki ilk
// görsel → yoksa YouTube önizlemesi; "kartı doldur" + dikey konum ya da "görselin tamamı"; panelde sitedeki kartın aynısı.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Bilgi Bankası: kapak görseli",
  async run(t) {
    await t.part("Kural: hangi görsel, nasıl", async () => {
      let m = null;
      try { m = await import(new URL("../../src/lib/kb-cover.ts", import.meta.url)); } catch { /* eski Node */ }
      if (!m) { t.add("warn", "Kural denenemedi", "Node TS yükleyemedi"); return; }
      const S = "https://supabase.yerihisset.com/storage/v1/object/public/site/";
      const html = `<p>a</p><img src="https://eski-site.com/x.jpg"><img src="${S}a.webp"><img src="${S}b.webp">`;
      const auto = m.kbCover({ content: html });
      const chosen = m.kbCover({ content: html, cover_image: `${S}b.webp`, cover_fit: "contain", cover_pos_y: 20 });
      const foreign = m.kbCover({ content: html, cover_image: "https://eski-site.com/y.jpg" });
      const yt = m.kbCover({ content: "<p>yazı</p>", video_url: "https://youtu.be/abcdefghijk" });
      const none = m.kbCover({ content: "<p>yazı</p>" });
      const ok = auto?.src === `${S}a.webp` && auto.fit === "cover" && auto.posY === 50
        && chosen?.src === `${S}b.webp` && chosen.fit === "contain" && chosen.posY === 20
        && foreign?.src === `${S}a.webp` && yt?.src === "https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg" && none === null
        && m.clampPos(150) === 100 && m.clampPos(-3) === 0 && m.clampPos("x") === 50
        && m.contentImages(html).length === 3;
      t.add(ok ? "ok" : "fail", "Kapak: seçilen → yazıdaki ilk (site dışı adres atlanır) → YouTube; görünüm + konum sınırlı",
        JSON.stringify({ auto, chosen, foreign, yt, none }));
    });

    await t.part("Ekranlar", async () => {
      const list = rd("src/app/bilgi-bankasi/page.tsx");
      t.add(/cover_image, cover_fit, cover_pos_y/.test(list) && /kbCover\(article\)/.test(list) && /<KbCover cover=\{cover\}/.test(list) ? "ok" : "fail",
        "Sitedeki Bilgi Bankası kartı seçilen kapağı ve görünümü kullanıyor");
      const card = rd("src/components/kb/KbCover.tsx");
      t.add(/objectPosition: `50% \$\{cover\.posY\}%`/.test(card) && /object-contain/.test(card) ? "ok" : "fail", "Kart kapağı: dikey konum + görselin tamamı");
      const adm = rd("src/components/admin/KBArticlesManager.tsx"), pick = rd("src/components/admin/KbCoverPicker.tsx");
      t.add(/<KbCoverPicker/.test(adm) && /cover_pos_y: clampPos\(cover\.cover_pos_y\)/.test(adm) && /<KbCover cover=\{cover\}/.test(pick) && /Sitede böyle görünecek/.test(pick) ? "ok" : "fail",
        "Panelde kapak seçimi + sitedeki kartın canlı önizlemesi, kayıtta saklanıyor");
    });
  },
};
