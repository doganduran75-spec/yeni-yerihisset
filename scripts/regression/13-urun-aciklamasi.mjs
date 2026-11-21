// ÜRÜN SAYFASI OKUNURLUK (kullanıcı 2026-11-19): uzun yorum 7 satırda kesilir ("Devamını oku"); ürün açıklaması kısa
// görünür, açılır; açıklamadaki "Sık sorulan sorular" sitede açılır-kapanır + FAQPage yapısal verisi (src/lib/description-faq.ts).
// MIG 20261197: aynı metni paylaşan 5 grubun açıklaması kısa / maddeli / SSS'li yeniden yazıldı (eski metin yedekte).
// Veri değiştirmez.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Ürün açıklaması",
  async run(t) {
    await t.part("Ürün sayfası okunurluk (devamını oku, SSS)", async () => {
      // 1) SSS dönüşümü gerçekten çalıştırılır
      let m = null;
      try { m = await import(new URL("../../src/lib/description-faq.ts", import.meta.url)); } catch { /* eski Node */ }
      if (m) {
        const html = "<p>Giriş</p><h3>Sık sorulan sorular</h3><p><strong>Su geçirir mi?</strong><br>Hayır.</p><p><strong>Kayar mı?</strong><br>Kaymaz.</p><h3>Başka</h3><p><strong>X</strong><br>Y</p>";
        const faq = m.extractFaq(html), acc = m.faqAccordion(html);
        const ok = faq.length === 2 && faq[0].q === "Su geçirir mi?" && faq[1].a === "Kaymaz."
          && (acc.match(/<details class="faq-item">/g) || []).length === 2 && acc.includes("<p><strong>X</strong><br>Y</p>")
          && m.faqAccordion("<p>SSS yok</p>") === "<p>SSS yok</p>" && m.extractFaq(null).length === 0;
        t.add(ok ? "ok" : "fail", "Açıklamadaki sık sorulan sorular açılır-kapanır + yapısal veri (başka bölüme dokunmuyor)", ok ? "" : JSON.stringify({ faq, acc }).slice(0, 200));
      } else t.add("warn", "SSS dönüşümü denenemedi", "Node TS yükleyemedi");

      // 2) Kod: yorum 7 satır, açıklama kısaltılmış + SSS; ürün sayfasında FAQPage
      const pr = rd("src/components/products/ProductReviews.tsx"), pc = rd("src/app/products/[slug]/ProductPageClient.tsx"), pg = rd("src/app/products/[slug]/page.tsx");
      const ok2 = /<ReadMore lines=\{7\}>/.test(pr) && /<ReadMore maxHeight=\{\d+\}>/.test(pc) && /faqAccordion\(safeHtml\(product\.description\)\)/.test(pc)
        && /extractFaq\(\(product as any\)\.description\)/.test(pg) && /"FAQPage"/.test(pg);
      t.add(ok2 ? "ok" : "fail", "Uzun yorum ve açıklama 'Devamını oku' ile; açıklama SSS'si sayfada FAQPage", ok2 ? "" : "ProductReviews / ProductPageClient / ürün sayfası satırları eksik");

      // 3) Veri: eski uzun ortak metin kalmadı; yedek dışarıya kapalı
      const left = t.num(`SELECT count(*) FROM public.products WHERE description LIKE 'İnce ve Esnek Taban%' OR description LIKE '<p>İnce ve Esnek Taban</p>%'
        OR description LIKE '<p>Eşi benzeri olmayan tasarım%' OR description LIKE '<p>YeriHisset Denge Barı''nın%'`);
      t.add(left === 0 ? "ok" : "warn", "Ürün açıklamaları yeni kısa metinde (eski uzun ortak metin kalmadı)", left === 0 ? "" : `${left} üründe eski metin — MIG 20261197 uygulanmamış olabilir`);
      const bk = await t.rest("product_description_backup_20261119?select=product_id&limit=1");
      t.add(bk.status >= 400 || (Array.isArray(bk.json) && bk.json.length === 0) ? "ok" : "fail", "Eski açıklama yedeği dışarıdan okunamıyor", `HTTP ${bk.status}`);
    });
    // ÜRÜN FOTOĞRAFLARI SIRAYLA (kullanıcı 2026-11-21: 5 foto 2-3 sn sonra hepsi birden geliyordu)
    await t.part("Ürün fotoğrafları sırayla yükleniyor", async () => {
      const pc = rd("src/app/products/[slug]/ProductPageClient.tsx");
      const ok = /onLoad=\{\(\) => setImgStage\(\(s\) => Math\.max\(s, 1\)\)\}/.test(pc) && /\{imgStage >= 1 && \(/.test(pc) && /\{imgStage >= 2 && \[\.\.\.new Set/.test(pc);
      t.add(ok ? "ok" : "fail", "Önce büyük foto, sonra küçükler, en son diğer fotoların büyük hâli", ok ? "" : "ProductPageClient imgStage satırları eksik");
    });
    // DOĞRU NUMARAYI BUL (kullanıcı 2026-11-19: mobil ana sayfa bandı yalnız /magaza'yı açıyordu, numara adımı yoktu)
    await t.part("Doğru numarayı bul (mobil ana sayfa)", async () => {
      const mh = rd("src/components/MobileHome.tsx"), sf = rd("src/components/SizeFinderSheet.tsx"), sg = rd("src/components/SizeFilterGrid.tsx");
      const ok = /<SizeFinderSheet/.test(mh) && /onClick=\{\(\) => setFinder\(true\)\}/.test(mh) && !/<Link href=\{HC\.sizeFinder\.href\}/.test(mh)
        && /recommendSize\(chart, mm\)/.test(sf) && /from\("size_charts"\)/.test(sf) && /\?numara=\$\{encodeURIComponent\(label\)\}/.test(sf) && /numara_alt/.test(sf)
        && /sp\.get\("numara_alt"\)/.test(sg);
      t.add(ok ? "ok" : "fail", "Bant ölçüden numara bulan pencereyi açıyor; öneri mağazayı o numara seçili açıyor", ok ? "" : "MobileHome / SizeFinderSheet / SizeFilterGrid satırları eksik");
      const sz = t.num("SELECT count(*) FROM public.size_charts WHERE jsonb_array_length(rows) > 0");
      t.add(sz > 0 ? "ok" : "warn", "Ölçü tablosu var (numara önerisi için)", sz > 0 ? `${sz} marka` : "Ayarlar › Markalar'da ölçü tablosu yok — pencere doğrudan mağazaya gider");
    });
  },
};
