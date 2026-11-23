// DAKİKALIK İŞİN SIKLIĞI (kullanıcı 2026-11-23, boşta sunucu yükü): /api/cron/marketplace-sync dakikada bir çağrılır;
// kritik adımlar her dakika, diğerleri seyrek. Kullanıcı kararı: pazaryeri siparişi + stok + Telegram (müşteri mesajı,
// iade / değişim talebi, hata) dakikada bir. Trendyol iade talebi 6 saatte bir, Kargonomi 5 dk, Paraşüt 10 dk, Trendyol
// fatura yükleme 20 dk, eski kayıt temizliği günde bir. Fiyat gönderimi düğmeyle anında, kuyruk yedeği 10 dk; Google 30 dk;
// Telegram pazaryeri sipariş mesajı 30 dk (site siparişi anında). Günlük özet yarım saat adımlı (08:30).
// Kod denetimi: sıklık kuralı gerçekten çalıştırılır (dakika / saat verilerek). Veri değiştirmez.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Dakikalık iş sıklığı",
  async run(t) {
    await t.part("Otomatik işler kararlaştırılan sıklıkta çalışıyor", async () => {
      const s = rd("src/app/api/cron/marketplace-sync/route.ts");
      // Koşul ifadesini çıkar, m/h ile çalıştır → bir günde kaç kez çalıştığını say
      const cond = (re) => { const x = re.exec(s); try { return x ? new Function("m", "h", `return (${x[1]});`) : null; } catch { return null; } };
      const perDay = (fn) => { if (!fn) return -1; let n = 0; for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m++) if (fn(m, h)) n++; return n; };
      const want = [
        ["Trendyol iade talepleri 6 saatte bir", /const claims = ([^\n?]+)\s*\?/, 4],
        ["Kargonomi kod / durum takibi 5 dakikada bir", /const kargo = ([^\n?]+)\s*\?/, 288],
        ["Paraşüt fatura takibi 10 dakikada bir", /const fatura = ([^\n?]+)\s*\?/, 144],
        ["Trendyol'a fatura yükleme 20 dakikada bir", /const tyInv = ([^\n?]+)\s*\?/, 72],
        ["Fiyat kuyruğu yedeği 10 dakikada bir (gönderim düğmeyle anında)", /const prices = ([^\n?]+)\s*\?/, 144],
        ["Google Merchant 30 dakikada bir", /const google = ([^\n?]+)\s*\?/, 48],
        ["Telegram: pazaryeri sipariş mesajı 30 dakikada bir (bekletilen dakika sayısı)", /holdOrders: ([^}]+) \}/, 1440 - 48],
        ["Eski kayıt temizliği günde bir", /\/\/ Eski kayıt temizliği[^\n]*\n\s*if \(([^)]+)\) \{/, 1],
      ];
      for (const [label, re, n] of want) {
        const got = perDay(cond(re));
        t.add(got === n ? "ok" : "fail", label, got === n ? "" : `günde ${got} (beklenen ${n})`);
      }
      // Kargonomi panel gönderisi bağlama (pollKargonomi içinde dakika 7) kargo dakikalarından birine denk gelmeli
      const k = cond(/const kargo = ([^\n?]+)\s*\?/);
      const k7 = !!k && k(7, 0);
      t.add(k7 ? "ok" : "fail", "Kargonomi panelden açılan gönderiyi saatte bir bağlıyor (dakika 7 çalışıyor)", k7 ? "" : "dakika 7'de pollKargonomi çağrılmıyor");
      // Kritik adımlar koşulsuz (her dakika)
      const every = [
        [/\n {2}const orders = await importMarketplaceOrders\(supabase\);/, "pazaryeri siparişleri"],
        [/\n {2}const reports = await processMarketplaceStock\(supabase\);/, "stok kuyruğu"],
        [/\n {2}const telegram = await processTelegramOutbox\(supabase, \{ holdOrders: /, "Telegram"],
        [/\n {2}await \(supabase as any\)\.from\("cron_heartbeats"\)\.upsert/, "çalışıyorum kaydı"],
      ];
      const miss = every.filter(([re]) => !re.test(s)).map(([, l]) => l);
      t.add(!miss.length ? "ok" : "fail", "Pazaryeri siparişi, stok, Telegram ve çalışıyorum kaydı her dakika", miss.join(", "));
      // Fiyat: düğmeye basınca hemen gönderilir (cron'u beklemez)
      const okP = /export async function pushPrices[\s\S]{0,600}const reports = await processMarketplacePrices\(supabase\);/.test(rd("src/lib/marketplace/price-sync.ts"));
      t.add(okP ? "ok" : "fail", "Fiyatlar sayfasında 'gönder' deyince fiyat hemen pazaryerine gidiyor", okP ? "" : "pushPrices anında göndermiyor");
      // Telegram: holdOrders yalnız yeni sipariş konusunu bekletir; site siparişi kickTelegram ile (holdOrders olmadan) hemen
      const tg = rd("src/lib/telegram.ts");
      const okT = /if \(opts\.holdOrders\) pq = pq\.neq\("topic", "new_order"\);/.test(tg) && /kickTelegram[\s\S]{0,300}await processTelegramOutbox\(\);/.test(tg);
      t.add(okT ? "ok" : "fail", "Telegram: yalnız yeni sipariş mesajı bekletiliyor; site siparişi anında", okT ? "" : "holdOrders kuralı / kickTelegram bozuk");
      // Günlük özet yarım saat adımlı (08:30): dakika hesabı + panel 48 seçenek + API yalnız 00/30
      const okD = /trMinuteOfDay\(now\) < cfg\.dailyHour \* 60 \+ cfg\.dailyMinute/.test(tg) && /telegram_daily_minute/.test(tg)
        && /length: 48 \}, \(_, i\) => i \* 30\)/.test(rd("src/components/admin/settings/TelegramCard.tsx"))
        && /!\[0, 30\]\.includes\(mi\)/.test(rd("src/app/api/admin/telegram/route.ts"));
      t.add(okD ? "ok" : "fail", "Günlük özet saati yarım saat adımlı (ör. 08:30)", okD ? "" : "dakika desteği eksik");
      // Panel metinleri yeni sıklığı söylüyor
      const op = rd("src/app/admin/orders/page.tsx");
      const ui = /10 dakikada bir kontrol edilir/.test(op) && /\(20 dakikada bir denenir\)/.test(op)
        && /5 dakikada bir sorgulanır/.test(rd("src/components/admin/settings/IntegrationsTab.tsx"));
      t.add(ui ? "ok" : "fail", "Panel yazıları yeni sıklığı gösteriyor (Paraşüt 10 dk, fatura yükleme 20 dk, Kargonomi 5 dk)", ui ? "" : "eski 'dakikada bir' yazısı kalmış");
    });
  },
};
