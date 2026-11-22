// PARAŞÜT GELEN E-FATURALAR (kullanıcı 2026-11-22, MIG 20261198): Paraşüt'e gelen e-fatura bildirimle panele düşer
// (Gelen e-faturalar), kurala göre (firma adı / VKN → kasa, gider kategorisi, etiket) "Kabul et ve kaydet" ile Paraşüt'te
// kabul edilip gider olarak kaydedilir, kasadan ödendi yapılır. Paraşüt'te elle işlenen düşer.
// Veri değiştirmez: yalnız okur; bildirim ucu yanlış anahtarla denenir (kayıt açılmaz).
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Paraşüt gelen e-fatura",
  async run(t) {
    await t.part("Paraşüt gelen e-faturalar (kabul + kurala göre kayıt)", async () => {
      // 1) Veritabanı: tablolar dışarıya kapalı, ilk iki kural (DSM Grup → Trendyol, D Market → Hepsiburada) var
      const rules = t.one(`SELECT count(*) FROM public.parasut_inbound_rules
        WHERE (match_name = 'DSM Grup' AND account_name = 'Trendyol' AND category_name = 'Ürün' AND tag_names = ARRAY['Trendyol'])
           OR (match_name = 'D Market' AND account_name = 'Hepsiburada' AND category_name = 'Ürün' AND tag_names = ARRAY['Hepsiburada'])`);
      t.add(Number(rules) >= 2 ? "ok" : "fail", "İlk kurallar: DSM Grup → Trendyol kasası / Ürün / Trendyol; D Market → Hepsiburada", Number(rules) >= 2 ? "" : `bulunan ${rules}`);
      const closed = t.one(`SELECT NOT has_table_privilege('anon', 'public.parasut_inbound_invoices', 'SELECT')
        AND NOT has_table_privilege('anon', 'public.parasut_inbound_rules', 'SELECT')
        AND NOT has_table_privilege('authenticated', 'public.parasut_inbound_rules', 'SELECT')
        AND NOT has_table_privilege('authenticated', 'public.parasut_inbound_invoices', 'INSERT')
        AND EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'parasut_inbound_invoices' AND cmd = 'SELECT' AND qual ~* 'is_admin')
        AND NOT has_column_privilege('authenticated', 'public.parasut_auth', 'webhook_key', 'SELECT')`) === "t";
      t.add(closed ? "ok" : "fail", "Gelen fatura tabloları dışarıya kapalı (yönetici yalnız okur, bildirim anahtarı gizli)", closed ? "" : "GRANT / kural eksik");
      const anon = await t.rest("parasut_inbound_invoices?select=id&limit=1");
      const anonOk = anon.status === 401 || anon.status === 403 || (anon.status === 200 && Array.isArray(anon.json) && anon.json.length === 0);
      t.add(anonOk ? "ok" : "fail", "Girişsiz ziyaretçi gelen faturaları okuyamıyor", `HTTP ${anon.status}`);

      // 2) Bildirim ucu: anahtarsız / yanlış anahtarla 401 (kayıt açılmaz)
      const noKey = await t.api("/api/parasut/webhook", { body: { resource: "inbound_e_invoice", action: "create", data: { data: { id: "1" } } } });
      const badKey = await t.api("/api/parasut/webhook", { headers: { "X-Client-Key": "x".repeat(64) }, body: { resource: "inbound_e_invoice", action: "create", data: { data: { id: "1" } } } });
      t.add(noKey.status === 401 && badKey.status === 401 ? "ok" : "fail", "Paraşüt bildirimi anahtarsız / yanlış anahtarla reddediliyor", `HTTP ${noKey.status} / ${badKey.status}`);

      // 3) Kod: eşleştirme + işlem sırası + panel
      const lib = rd("src/lib/parasut-inbound.ts"), route = rd("src/app/api/admin/parasut/route.ts"), page = rd("src/app/admin/parasut/gelen/page.tsx");
      const ok1 = /timingSafeEqual/.test(lib) && /body\?\.resource !== "inbound_e_invoice"/.test(lib) && /direction !== "inbound"/.test(lib)
        && /replace\(\/\[\^0-9a-zçğıöşü\]\+\/g, " "\)/.test(lib) && /match_vkn && r\.match_vkn\.trim\(\) === vkn/.test(lib);
      t.add(ok1 ? "ok" : "fail", "Bildirim anahtarı sabit zamanlı denetleniyor; kural önce VKN, sonra firma adı (D-MARKET ~ D Market)", ok1 ? "" : "parasut-inbound.ts satırları eksik");
      const order = ["/respond`", "/create_purchase_bill`", "/item_categories/", "\"PUT\", `/purchase_bills/", "/payments`"].map((s) => lib.indexOf(s));
      const ok2 = order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])) && /already has a purchase bill/.test(lib)
        && /Paraşüt'te zaten kaydedilmiş — dokunulmadı/.test(lib) && /Math\.abs\(after - before\) > 0\.01/.test(lib) && /\.eq\("status", row\.status\)\.select\("id"\)/.test(lib);
      t.add(ok2 ? "ok" : "fail", "Kabul → gider kaydı → kategori → etiket → ödendi sırası; Paraşüt'te elle kaydedilene dokunulmuyor; tutar değişirse ödeme yok", ok2 ? "" : "processInbound adımları eksik / sırası bozuk");
      const ok3 = ["inbound_list", "inbound_options", "inbound_process", "inbound_ignore", "inbound_webhook", "rule_save", "rule_delete"].every((op) => route.includes(`case "${op}"`))
        && /refreshPending\(sb\)/.test(route) && /op: "inbound_process"/.test(page) && /Kabul et ve kaydet/.test(page) && /Bildirimi aç/.test(page)
        && /href: "\/admin\/parasut\/gelen"/.test(rd("src/app/admin/page.tsx")) && /href="\/admin\/parasut\/gelen"/.test(rd("src/app/admin/layout.tsx"))
        && /refreshInboundInvoices\(supabase\)/.test(rd("src/app/api/cron/marketplace-sync/route.ts"));
      t.add(ok3 ? "ok" : "fail", "Panel: Gelen e-faturalar sayfası + pano satırı + menü; Paraşüt'te işlenen saatte bir düşüyor", ok3 ? "" : "rota / sayfa / pano / cron satırı eksik");
      // 2026-11-22: "Bildirimi aç" Paraşüt 500 verdi → webhook uçlarına JSON:API başlığı, hangi adımın hata verdiği mesajda,
      // 500 alınsa da oluşmuşsa listeden bulunup anahtarı güncellenir
      const ok5 = /Accept: ct/.test(rd("src/lib/parasut.ts")) && /parasutCall\(sb, "POST", "\/webhooks", \{[^\n]*\{ jsonApi \}\)/.test(lib)
        && /"Bildirim kurulamadı"/.test(lib) && /500 alınsa da bildirim oluşmuş olabilir/.test(lib);
      t.add(ok5 ? "ok" : "fail", "Bildirim kurulumu JSON:API başlığıyla; hata hangi adımda yazıyor; 500 sonrası oluşmuş bildirim kurtarılıyor", ok5 ? "" : "enableWebhook satırları eksik");
    });
  },
};
