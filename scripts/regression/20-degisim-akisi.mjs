// DEĞİŞİM AKIŞI (kullanıcı 2026-11-26): stok bekleyen değişimde stok girince ilk isteyene 1 adet kendiliğinden ayrılır (stok düşer,
// pazaryerine kalan gider, "Sevk edilecek" işi düşer; müşteriye "stok geldi" e-postası gitmez, kalan stok 0 ise "gelince haber ver"
// diyenlere de gitmez). Geri gönderilen ürün müşteri seçmeden de gelebilir ("Geri gelen ürün ulaştı"); ikisi de geri gelirse değişim
// iadeye döner. Müşteri "ikisi de olmadı" diyebilir. Yönetici "müşteri adına" süre sınırı olmadan açabilir. Müşteriye değişim
// talebi / yeni numara kargoda / değişim tamamlandı e-postaları. DB denemesi BEGIN … ROLLBACK (veri değiştirmez).
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Değişim akışı (stok ayırma, geri gelen ürün, e-postalar)",
  async run(t) {
    await t.part("Kural: geri gelen ürün, aşamalar, iş türü", async () => {
      let ex = null, nx = null;
      try { ex = await import(new URL("../../src/lib/exchange-return.ts", import.meta.url)); nx = await import(new URL("../../src/lib/order-next-step.ts", import.meta.url)); } catch { /* eski Node */ }
      if (!ex || !nx) { t.add("warn", "Değişim kuralı denenemedi", "Node TS yükleyemedi"); return; }
      // a = asıl (45), b = yerine giden (44, ücretsiz), c = siparişteki başka ürün
      const it = (ra, rb) => [{ id: "a", quantity: 1, returned_qty: ra, unit_price: 1000 }, { id: "b", quantity: 1, returned_qty: rb, unit_price: 1000, exchange_of: "a" }, { id: "c", quantity: 1, returned_qty: 0, unit_price: 500 }];
      const cases = [
        ["Asıl ürün geri geldi (müşteri seçmeden — YH25047) → tamam, yerine giden müşteride", ex.exchangeBackResult(it(1, 0), ["a"]), { done: true, allBack: false, keepId: "b" }],
        ["Yerine giden geri geldi → tamam, asıl müşteride", ex.exchangeBackResult(it(0, 1), ["a"]), { done: true, allBack: false, keepId: "a" }],
        ["İkisi de geri geldi → değişim iadeye döndü", ex.exchangeBackResult(it(1, 1), ["a"]), { done: false, allBack: true, keepId: null }],
        ["Hiçbiri gelmedi → talep açık kalır", ex.exchangeBackResult(it(0, 0), ["a"]), { done: false, allBack: false, keepId: "a" }],
      ];
      const bad = cases.filter(([, g, w]) => g.done !== w.done || g.allBack !== w.allBack || g.keepId !== w.keepId).map(([l, g]) => `${l}: ${JSON.stringify(g)}`);
      t.add(!bad.length ? "ok" : "fail", "Geri gelen ürün: çiftte ödenen kadar kaldıysa tamam, ikisi de geldiyse iade", bad.join(" · "));

      const D = new Date().toISOString();
      const base = { channel: "site", import_source: null, status: "delivered", payment_status: "paid", shipment_status: "delivered", invoice_status: "invoiced",
        total_amount: 1000, refunded_amount: 0, created_at: D, delivered_at: D, fit_status: "exchange" };
      const st = (status) => nx.orderNextStep({ ...base, open_case: { kind: "exchange", status } });
      const keys = (s) => s.actions.map((a) => a.key);
      const res = st("reserved"), shipped = st("alt_shipped"), tried = st("alt_delivered"), none = st("none_fit"), wait = st("waiting_stock");
      const okSt = res.needsAction && keys(res).includes("ship_alt") && nx.todoKind(res) === "ship" && nx.isGeneralOrderTodo(res, true)
        && !wait.needsAction && !nx.isGeneralOrderTodo(wait, true)
        && keys(shipped).includes("return") && keys(tried).includes("return") && shipped.actions.find((a) => a.key === "return")?.label === "Geri gelen ürün ulaştı"
        && none.needsAction && keys(none).includes("send_label") && keys(none).includes("return")
        && /geri gelecek ürün yolda/.test(st("label_sent").stage);
      t.add(okSt ? "ok" : "fail", "Stok ayrılan değişim “Sevk edilecek” işi; kargoda / denerken “Geri gelen ürün ulaştı”; “ikisi de olmadı” iş olarak düşer", okSt ? "" : `${res.stage} ${nx.todoKind(res)} / ${keys(shipped)} / ${keys(none)}`);
      const old = { ...base, fit_status: "ok", open_case: null, delivered_at: new Date(Date.now() - 40 * 86400_000).toISOString() };
      t.add(keys(nx.orderNextStep(old)).includes("case_link") ? "ok" : "fail", "Yönetici “Müşteri adına değişim / iade aç” süre sınırı olmadan (40 gün sonra, “oldu” denmiş siparişte de)", JSON.stringify(keys(nx.orderNextStep(old))));
    });

    await t.part("Stok girince değişim bekleyene ayırma (veritabanı, geri alınır)", async () => {
      const trg = t.one(`SELECT max(tgname) FROM pg_trigger WHERE tgrelid = 'public.product_variants'::regclass AND NOT tgisinternal`);
      t.add(trg === "zz_exchange_reserve" ? "ok" : "fail", "Ayırma tetikleyicisi en son çalışıyor (pazaryerine ayrıldıktan sonraki stok gider)", `son tetikleyici: ${trg}`);
      const rows = t.sql(`BEGIN;
        CREATE TEMP TABLE rg (k text, v text);
        DO $$
        DECLARE pid uuid; vid uuid; o1 uuid; i1 uuid; o2 uuid; i2 uuid; c1 uuid; c2 uuid; r2 text;
        BEGIN
          SELECT id INTO pid FROM public.products ORDER BY created_at LIMIT 1;
          INSERT INTO public.product_variants (product_id, price, stock, is_active) VALUES (pid, 1, 0, false) RETURNING id INTO vid;
          SELECT oi.order_id, oi.id INTO o1, i1 FROM public.order_items oi
           WHERE NOT EXISTS (SELECT 1 FROM public.order_cases c WHERE c.order_id = oi.order_id AND c.closed_at IS NULL) ORDER BY oi.created_at LIMIT 1;
          SELECT oi.order_id, oi.id INTO o2, i2 FROM public.order_items oi
           WHERE oi.order_id <> o1 AND NOT EXISTS (SELECT 1 FROM public.order_cases c WHERE c.order_id = oi.order_id AND c.closed_at IS NULL) ORDER BY oi.created_at LIMIT 1;
          INSERT INTO public.order_cases (order_id, kind, status, items, created_at) VALUES
            (o1, 'exchange', 'waiting_stock', jsonb_build_array(jsonb_build_object('order_item_id', i1::text, 'want_variant_id', vid::text, 'wait', true)), now() - interval '2 hours') RETURNING id INTO c1;
          INSERT INTO public.order_cases (order_id, kind, status, items, created_at) VALUES
            (o2, 'exchange', 'waiting_stock', jsonb_build_array(jsonb_build_object('order_item_id', i2::text, 'want_variant_id', vid::text, 'wait', true)), now() - interval '1 hour') RETURNING id INTO c2;
          UPDATE public.product_variants SET stock = 1 WHERE id = vid; -- 1 girdi, 2 bekleyen → ilk isteyen
          INSERT INTO rg SELECT 'a', (SELECT stock FROM public.product_variants WHERE id = vid) || '/' || (SELECT status FROM public.order_cases WHERE id = c1) || '/' || (SELECT status FROM public.order_cases WHERE id = c2);
          UPDATE public.product_variants SET stock = 5 WHERE id = vid; -- 5 girdi → ikinciye 1, kalan 4
          INSERT INTO rg SELECT 'b', (SELECT stock FROM public.product_variants WHERE id = vid) || '/' || (SELECT status FROM public.order_cases WHERE id = c2)
            || '/' || (SELECT count(*) FROM public.order_items WHERE variant_id = vid AND exchange_of IS NOT NULL)
            || '/' || (SELECT count(*) FROM public.stock_events WHERE variant_id = vid AND source = 'exchange_reserve');
          SELECT items->0->>'reserved_item_id' INTO r2 FROM public.order_cases WHERE id = c2;
          PERFORM public.exchange_release_item(r2::uuid); -- ayrılan geri alındı → stoğa döner
          INSERT INTO rg SELECT 'c', (SELECT stock FROM public.product_variants WHERE id = vid) || '/' || (SELECT count(*) FROM public.order_items WHERE id = r2::uuid);
        END $$;
        SELECT k, v FROM rg ORDER BY k;
        ROLLBACK;`);
      const m = Object.fromEntries(rows.map((r) => [r[0], r[1]]));
      t.add(m.a === "0/reserved/waiting_stock" ? "ok" : "fail", "1 adet girdi, 2 müşteri bekliyor → ilk isteyene ayrıldı, stok 0 (ikincisi beklemede)", m.a);
      t.add(m.b === "4/reserved/2/2" ? "ok" : "fail", "5 adet girdi → sıradakine 1 ayrıldı, stok 4 (alternatif kalemler eklendi, stok geçmişine yazıldı)", m.b);
      t.add(m.c === "5/0" ? "ok" : "fail", "Ayrılan ürün geri alınınca kalem silinir, stoğa döner", m.c);
    });

    await t.part("Ekranlar, sunucu, e-postalar", async () => {
      const stock = rd("src/app/admin/stock/page.tsx");
      const okS = /exchWaiting: exMap\.get\(v\.id\)/.test(stock) && /if \(wasOut && final > 0\)/.test(stock) && /adet değişim bekleyen müşteriye ayrıldı/.test(stock) && /"Değişim bekleyen", "exchWaiting"/.test(stock);
      t.add(okS ? "ok" : "fail", "Stok ekranında “Değişim” sütunu; ayrıldıktan sonra stok kalmadıysa “stok geldi” e-postası gitmiyor", okS ? "" : "stok ekranı eksik");
      const disp = rd("src/app/api/stock-notify/dispatch/route.ts");
      t.add(/noStock: true/.test(disp) ? "ok" : "fail", "Stok bildirimi gönderimi: stok 0 ise kimseye e-posta yok (sunucu)", "");
      const as = rd("src/app/api/after-sale/route.ts");
      const okA = !/Stok gelince haber ver \(müşterinin e-postasıyla\)/.test(as)
        && /body\.action === "none"/.test(as) && /status: "none_fit"/.test(as) && /sendExchangeRequestedEmail\(orderId/.test(as) && /verifyAfterSaleAdmin\(orderId, body\.y\)/.test(as);
      t.add(okA ? "ok" : "fail", "Müşteri: stok bekleyen değişimde “stok geldi” kaydı açılmıyor, “ikisi de olmadı” seçeneği, “değişim talebin alındı” e-postası", okA ? "" : "after-sale eksik");
      const lib = rd("src/lib/after-sale.ts");
      t.add(/export function afterSaleAdminUrl/.test(lib) && /admin \|\| \(inWindow/.test(lib) && /afterSaleAdminUrl\(orderId\)/.test(rd("src/app/api/admin/orders/case/route.ts")) ? "ok" : "fail",
        "Yönetici “müşteri adına” bağlantısı süre sınırsız (24 saat geçerli imza)", "");
      const cr = rd("src/app/api/admin/orders/case/route.ts");
      const okC = /"requested", "waiting_stock", "reserved"/.test(cr) && /exchange_release_item/.test(cr) && /sendAltShippedEmail\(orderId/.test(cr) && /"keep_chosen", "label_sent", "none_fit"/.test(cr);
      t.add(okC ? "ok" : "fail", "Yönetici: ayrılan ürünü gönder (yeniden düşmez, başka ürün seçilirse ayrılan geri), “yeni numaran yola çıktı” e-postası", okC ? "" : "case route eksik");
      const act = rd("src/app/api/admin/orders/action/route.ts");
      const okR = /exchangeBackResult\(all/.test(act) && /status: "returned_all"/.test(act) && /sendExchangeCompletedEmail\(orderId/.test(act) && /"alt_shipped", "alt_delivered", "none_fit", "keep_chosen", "label_sent"/.test(act);
      t.add(okR ? "ok" : "fail", "Geri gelen ürün ulaştı: müşteri seçmeden de değişim kapanıyor, ikisi de gelirse iade; “değişimin tamamlandı” e-postası", okR ? "" : "action route eksik");
      // Sade değişim ekranı (kullanıcı 2026-11-26): önerilen numara stokta → yalnız "Harika, 42 numara stokta" (ızgara / renk yok,
      // isteyen açar); stokta yok → beklerim / başka renkte bakalım / iade; renkler yalnız istenince
      const ds = rd("src/app/deneme-sonucu/page.tsx");
      t.add(/data-exchange-instock/.test(ds) && /Harika, \{opts\.target\} numara stokta ✓/.test(ds) && /const full = !hasTarget \|\| browse;/.test(ds)
        && /Başka numara ya da renk istiyorum/.test(ds) && /data-exchange-nostock/.test(ds) && /Başka renkte \{opts\.target\} numaraya bakalım/.test(ds)
        && /colorsBlock\(altColors,/.test(ds) && /setBrowse\(false\); setAltLook\(false\);/.test(ds) ? "ok" : "fail",
        "Değişim ekranı sade: stoktaysa yalnız “Harika, stokta”, değilse bekle / başka renk / iade; renkler istenince açılır");
      const mail = rd("src/lib/after-sale-mail.ts"), kinds = rd("src/lib/email-approval.ts"), ui = rd("src/app/deneme-sonucu/page.tsx"), list = rd("src/app/admin/orders/page.tsx");
      const okM = ["exchange_requested", "alt_shipped", "exchange_completed"].every((k) => mail.includes(`"${k}");`) && kinds.includes(`${k}:`))
        && /İkisi de olmadı/.test(ui) && /pair\.has\(i\.exchange_of\)/.test(ui) && /Müşteride kalacak:/.test(list) && /Geri gelecek:/.test(list);
      t.add(okM ? "ok" : "fail", "E-posta türleri (onay ekranında adlı), müşteri sayfasında “İkisi de olmadı”, panelde “Müşteride kalacak / Geri gelecek”", okM ? "" : "eksik");
    });
  },
};
