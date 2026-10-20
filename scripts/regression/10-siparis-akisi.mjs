// FONKSİYONEL SENARYOLAR — SİPARİŞ AKIŞI (havale). Gerçek uçlarla, gerçek veritabanında uçtan uca:
// fiyat doğrulama, stok düşümü/iadesi, kargo, kuponların TÜM kuralları, hediye, misafir siparişi,
// yetki, ödeme onayı → Müşteri rolü, ücret iadesi, iptal, kargo → teslim → iade al, satış ortaklığı,
// reklam kaynağı + Meta Conversions API (test siparişi gönderilmez), üyelik durumu + e-posta doğrulama +
// Fırsat/iş ortaklığı ayrıcalığı, kampanya e-postası izni, stok bildirimi, silme, süresi dolan sipariş.
//
// Test verisi: kategori "regresyon-test", pasif ürünler "REGRESYON-TEST …" (mağazada görünmez,
// SKU/barkod yok → pazaryerine gitmez; kapalı ürünün numarası satılmadığı için test ürünü yalnız
// sipariş isteği süresince açılır), kuponlar "RGT…", üyeler "rgt-…@yerihisset.test"
// (bu adreslere e-posta asla gitmez, yöneticiye "yeni sipariş" bildirimi düşmez).
// Başta önceki çalıştırmadan kalan, sonda bu çalıştırmanın verisi silinir.
import { randomBytes, createHmac } from "node:crypto";

const DOMAIN = "yerihisset.test";

export default {
  name: "Sipariş akışı",
  async run(t) {
    const { sql, one, num, lit, add, part, api: rawApi, rest, auth, sleep } = t;
    // Sitede kapalı ürünün numarası sipariş edilemez (order-pricing). Test ürünü mağazada görünmesin diye
    // pasif; yalnız sipariş isteği süresince açılır.
    const api = async (path, opts) => {
      if (path !== "/api/orders/create" || !F.prod) return rawApi(path, opts);
      sql(`UPDATE public.products SET is_active = true WHERE id = ${lit(F.prod)}`);
      try { return await rawApi(path, opts); }
      finally { sql(`UPDATE public.products SET is_active = false WHERE id = ${lit(F.prod)}`); }
    };
    const RUN = Date.now().toString(36);
    const ok = (cond, name, detail) => add(cond ? "ok" : "fail", name, cond ? "" : detail);
    const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;
    const why = (r) => `HTTP ${r.status}${r.json?.error ? `: ${r.json.error}` : r.status ? "" : ` (${r.text.slice(0, 80)})`}`;
    const row = (q) => JSON.parse(one(`SELECT row_to_json(x) FROM (${q}) x`) || "null");
    const insert = (table, obj) => {
      const cols = Object.keys(obj);
      return one(`INSERT INTO public.${table} (${cols.join(", ")}) VALUES (${cols.map((c) => lit(obj[c])).join(", ")}) RETURNING id`);
    };

    function cleanup() {
      const users = `SELECT id FROM auth.users WHERE email ILIKE '%@${DOMAIN}'`;
      const prods = `SELECT id FROM public.products WHERE title LIKE 'REGRESYON-TEST%'`;
      sql(`
        DELETE FROM public.orders WHERE user_id IN (${users}) OR id IN (SELECT order_id FROM public.order_items WHERE product_id IN (${prods}));
        DELETE FROM public.notification_log WHERE recipient ILIKE '%@${DOMAIN}' OR user_id IN (${users});
        DELETE FROM public.email_queue WHERE recipient_email ILIKE '%@${DOMAIN}';
        DELETE FROM public.marketing_consent_log WHERE email ILIKE '%@${DOMAIN}' OR user_id IN (${users});
        DO $$ BEGIN
          IF to_regclass('public.contacts') IS NOT NULL THEN DELETE FROM public.contacts WHERE email ILIKE '%@${DOMAIN}'; END IF;
        END $$;
        DELETE FROM public.profiles WHERE email ILIKE '%@${DOMAIN}';
        DELETE FROM auth.users WHERE email ILIKE '%@${DOMAIN}';
        DELETE FROM public.affiliate_profiles WHERE code LIKE 'RGT%';
        DELETE FROM public.stock_notifications WHERE product_id IN (${prods}) OR email ILIKE '%@${DOMAIN}';
        DELETE FROM public.free_gift_rules WHERE name LIKE 'REGRESYON-TEST%';
        DELETE FROM public.shipping_methods WHERE name LIKE 'REGRESYON-TEST%' AND NOT is_default;
        DELETE FROM public.products WHERE title LIKE 'REGRESYON-TEST%';
        DELETE FROM public.categories WHERE slug = 'regresyon-test';
        DELETE FROM public.partner_opportunities WHERE title LIKE 'REGRESYON-TEST%';
        DELETE FROM public.coupons WHERE code LIKE 'RGT%';
        DELETE FROM public.client_errors WHERE message LIKE 'REGRESYON-TEST%';
        DELETE FROM public.consent_log WHERE session_id IN (SELECT session_id FROM public.analytics_sessions WHERE landing_path = '/regresyon-test');
        DELETE FROM public.analytics_sessions WHERE landing_path = '/regresyon-test';
        DELETE FROM public.analytics_anon_daily WHERE path LIKE '/regresyon-test%';
        DELETE FROM public.static_pages WHERE slug LIKE 'regresyon-%';
        DELETE FROM public.search_dismissals WHERE term LIKE 'regresyon-test%';
        DELETE FROM public.feedback WHERE message LIKE '%regresyon-test%';
      `);
    }

    // ── Hazırlık ──
    const F = {}; // fixture kimlikleri
    let ready = false;
    await part("Senaryo hazırlığı (test verisi)", async () => {
      cleanup(); // önceki çalıştırmadan kalan (yarıda kesildiyse)
      F.cat = insert("categories", { name: "REGRESYON-TEST", slug: "regresyon-test" });
      F.prod = insert("products", { title: "REGRESYON-TEST Ayakkabı", slug: `regresyon-test-urun-${RUN}`, price: 1000, stock: 0, is_active: false, category_id: F.cat });
      F.var = insert("product_variants", { product_id: F.prod, price: 1000, stock: 30, is_active: true });
      F.var2 = insert("product_variants", { product_id: F.prod, price: 1000, stock: 5, is_active: true }); // değişim alternatifi
      F.gift = insert("products", { title: "REGRESYON-TEST Hediye", slug: `regresyon-test-hediye-${RUN}`, price: 200, stock: 5, is_active: false });
      insert("free_gift_rules", { name: "REGRESYON-TEST hediye", trigger_category_id: F.cat, gift_product_id: F.gift, is_active: true });
      const coupon = (sfx, o) => insert("coupons", {
        code: `RGT${RUN.toUpperCase()}${sfx}`, name: `REGRESYON-TEST ${sfx}`, type: "percentage", amount: 10,
        min_order_amount: 0, per_user_limit: 99, is_active: true, is_personal: false, auto_assign_on_signup: false, ...o,
      }) && `RGT${RUN.toUpperCase()}${sfx}`;
      F.cP10 = coupon("P10", {});
      F.cF100 = coupon("F100", { type: "fixed", amount: 100 });
      F.cFS = coupon("FS", { type: "free_shipping", amount: 0 });
      F.cMIN = coupon("MIN", { min_order_amount: 5000 });
      F.cEXP = coupon("EXP", { expires_at: new Date(Date.now() - 86400000).toISOString() });
      F.cFUT = coupon("FUT", { starts_at: new Date(Date.now() + 86400000).toISOString() });
      F.cPER = coupon("PER", { is_personal: true });
      F.cLIM = coupon("LIM", { per_user_limit: 1 });

      const mkUser = async (kind, admin) => {
        const email = `rgt-${kind}-${RUN}@${DOMAIN}`;
        const password = randomBytes(18).toString("base64url");
        const c = await auth("admin/users", { method: "POST", service: true, body: { email, password, email_confirm: true, user_metadata: { first_name: "Regresyon", last_name: kind } } });
        const id = c.json?.id;
        if (!id) throw new Error(`test üyesi oluşturulamadı (${kind}): HTTP ${c.status}`);
        sql(`INSERT INTO public.profiles (id, email, first_name, last_name, phone${admin ? ", role" : ""})
             VALUES (${lit(id)}, ${lit(email)}, 'Regresyon', ${lit(kind)}, '5550000000'${admin ? ", 'admin'" : ""})
             ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name${admin ? ", role = 'admin'" : ""}`);
        const s = await auth("token?grant_type=password", { method: "POST", body: { email, password } });
        if (!s.json?.access_token) throw new Error(`test üyesi giriş yapamadı (${kind}): HTTP ${s.status}`);
        return { id, email, token: s.json.access_token };
      };
      F.member = await mkUser("uye", false);
      F.admin = await mkUser("yonetici", true);
      F.addr = insert("user_addresses", {
        user_id: F.member.id, address_name: "Ev", first_name: "Regresyon", last_name: "Uye", phone: "5550000000",
        address_detail: "Moda Caddesi No 12 Daire 3", district: "Kadıköy", city: "İstanbul",
      });
      // Satış ortakları: başka üyenin (yönetici test hesabı), siparişi veren üyenin kendisinin, askıya alınmış
      F.affCode = `RGT${RUN.toUpperCase()}ORT`;
      F.aff = insert("affiliate_profiles", { user_id: F.admin.id, code: F.affCode, status: "active", commission_rate: 10 });
      F.affSelf = `RGT${RUN.toUpperCase()}KENDI`;
      insert("affiliate_profiles", { user_id: F.member.id, code: F.affSelf, status: "active", commission_rate: 10 });
      F.affOff = `RGT${RUN.toUpperCase()}PASIF`;
      F.affOffUser = (await mkUser("ortak", false)).id;
      insert("affiliate_profiles", { user_id: F.affOffUser, code: F.affOff, status: "suspended", commission_rate: 10 });
      F.ship = row("SELECT fee, free_over FROM public.shipping_methods WHERE is_active ORDER BY is_default DESC, sort_order LIMIT 1"); // = src/lib/shipping.ts
      F.shipOff = insert("shipping_methods", { name: "REGRESYON-TEST kargo", fee: 1, is_active: false, sort_order: 999 }); // pasif → müşteri görmez
      F.ip = `10.254.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`; // misafir hız sınırı her çalıştırmada temiz
      add("ok", "Test verisi kuruldu");
      ready = true;
    });

    try {
      if (!ready) return;
      const shipFor = (total, freeCoupon = false) =>
        !F.ship || freeCoupon ? 0 : F.ship.free_over != null && total >= Number(F.ship.free_over) ? 0 : Number(F.ship.fee || 0);
      const S1000 = shipFor(1000);
      const MAIN = (quantity = 1) => ({ product_id: F.prod, variant_id: F.var, variant_name: "42", title: "REGRESYON-TEST Ayakkabı", price: 1, quantity });
      const GIFT = { product_id: F.gift, title: "REGRESYON-TEST Hediye", price: 0, quantity: 1, is_gift: true };
      const order = (items, extra = {}) => api("/api/orders/create", {
        token: F.member.token,
        body: { items, shippingAddressId: F.addr, billingSameAsShipping: true, paymentMethod: "bank_transfer", ...extra },
      });
      const validate = (code, cartTotal = 1000) => api("/api/coupons/validate", { token: F.member.token, body: { code, cartTotal } });
      const stock = () => num(`SELECT stock FROM public.product_variants WHERE id = ${lit(F.var)}`);
      const giftStock = () => num(`SELECT stock FROM public.products WHERE id = ${lit(F.gift)}`);
      const ord = (id) => row(`SELECT * FROM public.orders WHERE id = ${lit(id)}`);
      const memberOrders = () => num(`SELECT count(*) FROM public.orders WHERE user_id = ${lit(F.member.id)}`);
      const O = {}; // senaryo siparişleri

      await part("Sipariş: fiyat, stok, kargo, hediye", async () => {
        // Fiyat sunucuda: istekte 1 TL yazsa da veritabanı fiyatı (1000) alınır
        let s0 = stock();
        const r = await order([MAIN(1)]);
        O.paid = r.json?.orderId;
        if (!O.paid) return add("fail", "Havale siparişi oluşturulamadı", why(r));
        const o = ord(O.paid);
        const item = row(`SELECT unit_price, quantity FROM public.order_items WHERE order_id = ${lit(O.paid)}`);
        ok(item && eq(item.unit_price, 1000), "Fiyat sunucuda doğrulanıyor (istekteki fiyat yok sayılır)", `birim fiyat ${item?.unit_price} (1000 olmalı)`);
        ok(eq(o.total_amount, 1000 + S1000), "Sipariş tutarı = ürün + kargo", `${o.total_amount} (beklenen ${1000 + S1000}, kargo ${S1000})`);
        ok(eq(o.shipping_cost, S1000), "Kargo ücreti kargo yöntemine göre", `${o.shipping_cost} (beklenen ${S1000})`);
        ok(o.status === "awaiting_payment" && o.payment_status === "pending" && o.shipment_status === "waiting" && o.invoice_status === "pending",
          "Havale siparişinin başlangıç durumları", `${o.status}/${o.payment_status}/${o.shipment_status}/${o.invoice_status}`);
        ok(!!o.order_number, "Sipariş numarası verildi", "order_number boş");
        ok(stock() === s0 - 1, "Sipariş stoğu düşürdü", `stok ${s0} → ${stock()}`);

        // Stok yetmezse sipariş yok, stok değişmez
        s0 = stock();
        const before = memberOrders();
        const r2 = await order([MAIN(99)]);
        ok([400, 409].includes(r2.status) && memberOrders() === before && stock() === s0,
          "Stoktan fazla sipariş reddediliyor", `${why(r2)}; stok ${s0} → ${stock()}`);

        // Hediye: tetikleyen ürünle 0 TL kabul, hediye stoğu düşer; tek başına reddedilir
        const g0 = giftStock();
        const r3 = await order([MAIN(1), GIFT]);
        O.gift = r3.json?.orderId;
        if (!O.gift) add("fail", "Hediyeli sipariş oluşturulamadı", why(r3));
        else {
          const gi = row(`SELECT unit_price FROM public.order_items WHERE order_id = ${lit(O.gift)} AND product_id = ${lit(F.gift)}`);
          ok(gi && eq(gi.unit_price, 0), "Hediye 0 TL olarak siparişte", `hediye satırı ${gi ? gi.unit_price + " TL" : "yok"}`);
          ok(eq(ord(O.gift).total_amount, 1000 + S1000), "Hediye tutara eklenmiyor", `tutar ${ord(O.gift).total_amount}`);
          ok(giftStock() === g0 - 1, "Hediye stoğu düştü", `hediye stoğu ${g0} → ${giftStock()}`);
        }
        const r4 = await order([GIFT]);
        ok(r4.status === 400, "Tetikleyici ürün olmadan hediye reddediliyor", `${why(r4)} — bedava ürün açığı`);
      });

      await part("Kargo yöntemi (varsayılan)", async () => {
        const sm = (body, token = F.admin.token) => api("/api/admin/shipping-methods", { token, body });
        const before = one("SELECT id FROM public.shipping_methods WHERE is_default");
        const m = await sm({ action: "set_default", id: F.shipOff }, F.member.token);
        ok(m.status === 403, "Üye kargo ayarını değiştiremiyor", why(m));
        const off = await sm({ action: "set_default", id: F.shipOff });
        ok(off.status === 400 && one("SELECT id FROM public.shipping_methods WHERE is_default") === before, "Pasif yöntem varsayılan yapılamıyor, varsayılan değişmedi", why(off));
        const list = await rest("shipping_methods?select=id,is_default&is_active=eq.true&order=is_default.desc,sort_order");
        ok(Array.isArray(list.json) && list.json[0]?.is_default === true, "Sepet/ödeme listesinde varsayılan en üstte", `HTTP ${list.status} ${list.text.slice(0, 120)}`);
        ok(Array.isArray(list.json) && !list.json.some((x) => x.id === F.shipOff), "Pasif yöntem müşteriye görünmüyor", "pasif kargo listede");
      });

      await part("Kupon kuralları (sepet + sipariş aynı kural)", async () => {
        // Geçerli kuponlar: sepetteki indirim = siparişteki indirim
        const v1 = await validate(F.cP10);
        ok(v1.status === 200 && eq(v1.json?.discount_amount, 100), "Yüzde kupon sepette", `${why(v1)} indirim ${v1.json?.discount_amount} (100 olmalı)`);
        const r1 = await order([MAIN(1)], { couponCode: F.cP10 });
        O.cancel = r1.json?.orderId;
        if (!O.cancel) add("fail", "Yüzde kuponlu sipariş oluşturulamadı", why(r1));
        else {
          const o = ord(O.cancel);
          ok(eq(o.coupon_discount, 100) && eq(o.total_amount, 900 + S1000), "Yüzde kupon siparişte", `indirim ${o.coupon_discount}, tutar ${o.total_amount} (beklenen 100 / ${900 + S1000})`);
          const uc = row(`SELECT c.used_count, (SELECT use_count FROM public.user_coupons u WHERE u.coupon_id = c.id AND u.user_id = ${lit(F.member.id)}) AS mine FROM public.coupons c WHERE c.code = ${lit(F.cP10)}`);
          ok(uc && uc.used_count === 1 && uc.mine === 1, "Kupon kullanımı sayıldı", `toplam ${uc?.used_count}, üyenin ${uc?.mine} (1/1 olmalı)`);
        }
        const r2 = await order([MAIN(1)], { couponCode: F.cF100 });
        O.del = r2.json?.orderId;
        if (!O.del) add("fail", "Sabit tutarlı kuponlu sipariş oluşturulamadı", why(r2));
        else ok(eq(ord(O.del).coupon_discount, 100), "Sabit tutarlı kupon siparişte", `indirim ${ord(O.del).coupon_discount} (100 olmalı)`);

        const v3 = await validate(F.cFS);
        ok(v3.status === 200 && v3.json?.free_shipping === true, "Ücretsiz kargo kuponu sepette", why(v3));
        const r3 = await order([MAIN(1)], { couponCode: F.cFS });
        O.expire = r3.json?.orderId;
        if (!O.expire) add("fail", "Ücretsiz kargo kuponlu sipariş oluşturulamadı", why(r3));
        else ok(eq(ord(O.expire).shipping_cost, 0) && eq(ord(O.expire).total_amount, 1000), "Ücretsiz kargo kuponu siparişte", `kargo ${ord(O.expire).shipping_cost}, tutar ${ord(O.expire).total_amount}`);

        // Geçersiz kuponlar: hem sepette hem DOĞRUDAN sipariş isteğinde reddedilmeli
        const bad = [
          [F.cMIN, "Alt limitin altında kupon", 400],
          [F.cEXP, "Süresi dolmuş kupon", 400],
          [F.cFUT, "Başlangıç tarihi gelmemiş kupon", 400],
          [F.cPER, "Başkasına ait kişiye özel kupon", 403],
          ["RGTYOKBOYLEKOD", "Olmayan kupon", 404],
        ];
        for (const [code, name, vStatus] of bad) {
          const v = await validate(code);
          ok(v.status === vStatus, `${name} sepette reddediliyor`, `${why(v)} (beklenen ${vStatus})`);
          const n0 = memberOrders();
          const r = await order([MAIN(1)], { couponCode: code });
          ok(r.status === 400 && memberOrders() === n0, `${name} siparişte reddediliyor`, `${why(r)} — sepeti atlayan doğrudan istekle kupon kullanılabiliyor`);
        }

        // Kişi başı limit: 1 kez kullanılır, ikincisi reddedilir
        const r5 = await order([MAIN(1)], { couponCode: F.cLIM });
        O.lim = r5.json?.orderId;
        ok(!!O.lim, "Kişi başı limitli kupon ilk kullanım", why(r5));
        const v6 = await validate(F.cLIM);
        ok(v6.status === 400, "Kişi başı limit dolunca sepette reddediliyor", why(v6));
        const r6 = await order([MAIN(1)], { couponCode: F.cLIM });
        ok(r6.status === 400, "Kişi başı limit dolunca siparişte reddediliyor", why(r6));
      });

      await part("Misafir siparişi", async () => {
        const H = { "x-forwarded-for": F.ip };
        const guest = {
          email: `rgt-misafir-${RUN}@${DOMAIN}`, firstName: "Ayşe", lastName: "Deneme", phone: "5551234567",
          city: "İstanbul", district: "Kadıköy", addressDetail: "Moda Caddesi No 12 Daire 3",
        };
        const body = { items: [MAIN(1)], guest, paymentMethod: "bank_transfer", _hp: "", _t: 6000 };
        const r0 = await api("/api/orders/create", { headers: H, body: { ...body, _t: undefined } });
        ok(r0.status === 429, "Formsuz (bot) misafir siparişi reddediliyor", why(r0));
        const r = await api("/api/orders/create", { headers: H, body });
        O.guest = r.json?.orderId;
        if (!O.guest) return add("fail", "Misafir siparişi oluşturulamadı", why(r));
        ok(r.json?.isGuest === true, "Misafir olarak işaretlendi", JSON.stringify(r.json).slice(0, 120));
        const s = await api(`/api/orders/summary?id=${O.guest}`, { method: "GET", headers: H });
        const sj = s.json || {};
        const sBad = [
          s.status !== 200 && why(s),
          sj.awaitingTransfer !== true && "havale bekliyor görünmüyor",
          !sj.bankInfo && "banka bilgisi yok",
          sj.isGuest !== true && "misafir sayılmadı (hesap aktivasyon kutusu çıkmaz — hesap şifreli görünüyor)",
          !eq(sj.total, 1000 + S1000) && `tutar ${sj.total} (beklenen ${1000 + S1000})`,
        ].filter(Boolean);
        ok(!sBad.length, "Sipariş sonucu sayfası verisi (havale bekliyor, banka bilgisi, aktivasyon)", sBad.join("; "));
        const e1 = await api("/api/checkout/email-check", { headers: H, body: { email: guest.email } });
        ok(e1.json?.exists === false && e1.json?.known === true, "Misafir e-postası tekrar siparişe açık (şifresiz hesap)", `${JSON.stringify(e1.json)} — misafir hesabı şifreli görünüyor; ikinci siparişte "giriş yapın" denir`);
        const r1b = await api("/api/orders/create", { headers: H, body });
        ok(r1b.status === 200, "Aynı misafir ikinci siparişi verebiliyor", why(r1b));
        const e2 = await api("/api/checkout/email-check", { headers: H, body: { email: F.member.email } });
        ok(e2.json?.exists === true, "Üye e-postasıyla misafir siparişinde giriş isteniyor", JSON.stringify(e2.json));
        const r2 = await api("/api/orders/create", { headers: H, body: { ...body, guest: { ...guest, email: F.member.email } } });
        ok(r2.status === 409, "Şifreli üyenin e-postasıyla misafir siparişi reddediliyor", why(r2));
      });

      await part("Yetki (üye / yönetici)", async () => {
        const a = await api("/api/admin/orders/action", { token: F.member.token, body: { action: "cancel", orderId: O.paid } });
        ok(a.status === 403, "Üye yönetici işlemi yapamıyor", why(a));
        const d = await api("/api/admin/orders/delete", { token: F.member.token, body: { orderId: O.paid } });
        ok(d.status === 403, "Üye sipariş silemiyor", why(d));
        if (O.guest) {
          const g = await rest(`orders?id=eq.${O.guest}&select=id`, { token: F.member.token });
          ok(Array.isArray(g.json) && g.json.length === 0, "Üye başkasının siparişini göremiyor", `HTTP ${g.status}, ${g.text.slice(0, 80)}`);
        }
        const mine = await rest(`orders?id=eq.${O.paid}&select=id`, { token: F.member.token });
        ok(Array.isArray(mine.json) && mine.json.length === 1, "Üye kendi siparişini görüyor", `HTTP ${mine.status}, ${mine.text.slice(0, 80)}`);
        const u = await rest(`orders?id=eq.${O.paid}`, { token: F.member.token, method: "PATCH", headers: { Prefer: "return=representation" }, body: { payment_status: "paid" } });
        ok(ord(O.paid).payment_status === "pending", "Üye kendi siparişini 'ödendi' yapamıyor", `HTTP ${u.status} — ödeme durumu ${ord(O.paid).payment_status}`);
      });

      await part("Ödeme onayı, iade, iptal", async () => {
        if (!O.paid || !O.cancel) return add("fail", "Önceki adımda sipariş oluşmadı", "bu bölüm denenemedi");
        // Ödenmemiş siparişi iptal → stok geri, ödeme "başarısız", fatura "gerekmiyor"
        let s0 = stock();
        const c = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "cancel", orderId: O.cancel, note: "regresyon" } });
        const oc = ord(O.cancel);
        ok(c.status === 200 && oc.status === "cancelled" && oc.payment_status === "failed" && oc.invoice_status === "not_required" && oc.shipment_status === "cancelled",
          "Ödenmemiş sipariş iptali", `${why(c)} → ${oc.status}/${oc.payment_status}/${oc.shipment_status}/${oc.invoice_status}`);
        ok(stock() === s0 + 1, "İptalde stok geri eklendi", `stok ${s0} → ${stock()}`);

        // Yönetici "Ödendi" (admin paneli tarayıcıdan doğrudan günceller → RLS yönetici yetkisi)
        const p = await rest(`orders?id=eq.${O.paid}`, {
          token: F.admin.token, method: "PATCH", headers: { Prefer: "return=representation" },
          body: { payment_status: "paid", status: "processing", shipment_status: "preparing" },
        });
        ok(p.status < 300 && ord(O.paid).payment_status === "paid", "Yönetici ödemeyi onaylayabiliyor", `HTTP ${p.status} ${p.text.slice(0, 100)}`);
        const role = num(`SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = ${lit(F.member.id)} AND r.slug = 'musteri'`);
        ok(role === 1, "Ödenen siparişle üye 'Müşteri' rolü aldı", "refresh_member_auto_tags tetikleyicisi çalışmadı");

        // Sıra kuralı: ürün geri gelmeden (ve iptal olmadan) tek başına ücret iadesi yapılamaz
        const r2 = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "refund", orderId: O.paid, amount: 100, method: "bank_transfer", confirmed: true, note: "regresyon" } });
        const o2 = ord(O.paid);
        ok(r2.status === 400 && o2.payment_status === "paid" && eq(o2.refunded_amount || 0, 0), "Ürün gelmeden tek başına ücret iadesi yapılamıyor", `${why(r2)} → ${o2.payment_status}, iade ${o2.refunded_amount}`);

        // Ödenmiş siparişi iptal → kalan tutar iade, stok geri
        s0 = stock();
        const c2 = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "cancel", orderId: O.paid, method: "bank_transfer", confirmed: true, note: "regresyon" } });
        const o3 = ord(O.paid);
        ok(c2.status === 200 && o3.status === "cancelled" && o3.payment_status === "refunded" && eq(o3.refunded_amount, o3.total_amount),
          "Ödenmiş sipariş iptali (kalan tutar iade)", `${why(c2)} → ${o3.status}/${o3.payment_status}, iade ${o3.refunded_amount}/${o3.total_amount}`);
        ok(stock() === s0 + 1, "Ödenmiş sipariş iptalinde stok geri eklendi", `stok ${s0} → ${stock()}`);
        const again = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "cancel", orderId: O.paid, method: "bank_transfer", confirmed: true } });
        ok(again.status === 400, "İptal edilmiş sipariş tekrar iptal edilemiyor", why(again));
      });

      await part("Kargo → teslim → iade al", async () => {
        const r = await order([MAIN(1)]);
        O.ret = r.json?.orderId;
        if (!O.ret) return add("fail", "İade senaryosu için sipariş oluşturulamadı", why(r));
        const patch = (body) => rest(`orders?id=eq.${O.ret}`, { token: F.admin.token, method: "PATCH", headers: { Prefer: "return=representation" }, body });
        await patch({ payment_status: "paid", status: "processing", shipment_status: "preparing" });
        const sh = await patch({ shipment_status: "shipped" });
        ok(sh.status < 300 && ord(O.ret).shipment_status === "shipped", "Yönetici 'Kargoya Verildi (elle)' yapabiliyor", `HTTP ${sh.status} → ${ord(O.ret).shipment_status}`);
        const c = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "cancel", orderId: O.ret, method: "bank_transfer", confirmed: true } });
        ok(c.status === 400 && ord(O.ret).status !== "cancelled", "Kargolanmış sipariş iptal edilemiyor ('İade al' kullanılmalı)", why(c));
        ok(ord(O.ret).payment_status === "paid" && eq(ord(O.ret).refunded_amount || 0, 0), "Reddedilen iptal parayı iade etmiyor",
          `ödeme ${ord(O.ret).payment_status}, iade ${ord(O.ret).refunded_amount} — iptal reddedildiği halde ücret iadesi kaydedildi (iyzico'da para gerçekten iade edilir)`);
        await patch({ shipment_status: "delivered" });
        ok(ord(O.ret).shipment_status === "delivered", "Yönetici 'Teslim Edildi' yapabiliyor", ord(O.ret).shipment_status);

        if (O.lim) {
          const early = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "return", orderId: O.lim, items: [] } });
          ok(early.status === 400, "Kargolanmamış siparişte 'İade al' reddediliyor", why(early));
        }
        const item = row(`SELECT id FROM public.order_items WHERE order_id = ${lit(O.ret)}`);
        const s0 = stock();
        const total = Number(ord(O.ret).total_amount);
        // Faturası kesilmiş + kapalı sipariş (ör. eski siteden "tamamlandı" aktarılmış) → iade işlenince yeniden açılır,
        // "İade faturasını da kestim" işaretliyse iade faturası kaydedilir
        await patch({ invoice_status: "invoiced" });
        sql(`UPDATE public.orders SET is_closed = true, closed_at = now() WHERE id = ${lit(O.ret)}`);
        const rr = await api("/api/admin/orders/action", {
          token: F.admin.token,
          body: { action: "return", orderId: O.ret, items: [{ item_id: item?.id, qty: 1, restock: true }], note: "regresyon", refund: { amount: 1000, method: "bank_transfer" }, confirmed: true, return_invoiced: true },
        });
        const o = ord(O.ret);
        ok(o.invoice_status === "return_invoiced", "\"İade faturasını da kestim\" → fatura: iade faturası kesildi", `fatura ${o.invoice_status}`);
        ok(one(`SELECT is_closed FROM public.orders WHERE id = ${lit(O.ret)}`) === "f", "Kapalı siparişe iade işlenince sipariş yeniden açılıyor (panoda görünür)", "is_closed hâlâ true");
        ok(rr.status === 200 && o.shipment_status === "returned", "İade al → kargo durumu 'İade geldi'", `${why(rr)} → ${o.shipment_status}`);
        ok(stock() === s0 + 1, "İade gelen sağlam ürün stoğa eklendi", `stok ${s0} → ${stock()}`);
        const wantPay = total > 1000 ? "partial_refund" : "refunded";
        ok(eq(o.refunded_amount, 1000) && o.payment_status === wantPay, "İadeyle birlikte ücret iadesi kaydedildi", `iade ${o.refunded_amount}, ödeme ${o.payment_status} (beklenen 1000 / ${wantPay})`);
        const ri = row(`SELECT restocked_qty FROM public.order_items WHERE id = ${lit(item?.id)}`);
        ok(ri && Number(ri.restocked_qty) === 1, "Kalemde stoğa eklenen adet işlendi", JSON.stringify(ri));
        const twice = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "return", orderId: O.ret, items: [{ item_id: item?.id, qty: 1, restock: true }] } });
        ok(stock() === s0 + 1, "Aynı ürün iki kez stoğa eklenmiyor", `${why(twice)}; stok ${s0 + 1} → ${stock()}`);
        // İade geldikten sonra kalan tutar (kargo) ayrıca iade edilebilir; onay kutusu şart
        const remain = Math.round((Number(ord(O.ret).total_amount) - Number(ord(O.ret).refunded_amount || 0)) * 100) / 100;
        if (remain > 0) {
          const nc = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "refund", orderId: O.ret, amount: remain, method: "bank_transfer" } });
          ok(nc.status === 400, "Onay kutusu işaretlenmeden iade kaydedilmiyor", why(nc));
          const rf = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "refund", orderId: O.ret, amount: remain, method: "bank_transfer", confirmed: true, note: "regresyon kargo" } });
          ok(rf.status === 200 && ord(O.ret).payment_status === "refunded", "İade gelen siparişte kalan tutar iade edilebiliyor", `${why(rf)} → ${ord(O.ret).payment_status}`);
        }
      });

      await part("Satış sonrası: oldu / değişim / iade", async () => {
        // Müşteri bağlantısının imzası (src/lib/after-sale.ts ile aynı kural)
        const asTok = (id) => `${id}.${createHmac("sha256", `after-sale:${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`).update(id).digest("base64url").slice(0, 32)}`;
        const caseOf = (id) => row(`SELECT * FROM public.order_cases WHERE order_id = ${lit(id)} ORDER BY created_at DESC LIMIT 1`);
        const adminCase = (orderId, body) => api("/api/admin/orders/case", { token: F.admin.token, body: { orderId, ...body } });
        const cust = (orderId, body) => api("/api/after-sale", { body: { r: asTok(orderId), ...body } });
        const stock2 = () => num(`SELECT stock FROM public.product_variants WHERE id = ${lit(F.var2)}`);
        // Teslim edilmiş site siparişi (yönetici panelinin yaptığı gibi tarayıcıdan durum güncellemesi)
        const delivered = async () => {
          const r = await order([MAIN(1)]);
          const id = r.json?.orderId;
          if (!id) throw new Error(`sipariş oluşturulamadı: ${why(r)}`);
          const patch = (b) => rest(`orders?id=eq.${id}`, { token: F.admin.token, method: "PATCH", headers: { Prefer: "return=minimal" }, body: b });
          await patch({ payment_status: "paid", status: "processing", shipment_status: "preparing" });
          await patch({ shipment_status: "shipped" });
          await patch({ shipment_status: "delivered" });
          return id;
        };

        // Teslim edilmemiş sipariş → cevap verilemez
        const pend = await order([MAIN(1)]);
        if (pend.json?.orderId) {
          const n0 = await cust(pend.json.orderId, { action: "ok" });
          ok(n0.status === 400, "Teslim edilmemiş siparişte 'oldu' denemiyor", why(n0));
        }

        // ── Oldu ──
        const A = await delivered();
        const oa = ord(A);
        ok(oa.fit_status === "trial" && !!oa.delivered_at, "Teslim edilince 'müşteri deniyor' + teslim tarihi", `${oa.fit_status} / ${oa.delivered_at}`);
        const g = await api(`/api/after-sale?r=${encodeURIComponent(asTok(A))}`, { method: "GET" });
        ok(g.status === 200 && g.json?.canAnswer === true && g.json?.items?.length === 1, "Müşteri sayfası açılıyor (imzalı bağlantı)", `${why(g)} ${JSON.stringify(g.json || {}).slice(0, 120)}`);
        const bad = await api(`/api/after-sale?r=${encodeURIComponent(asTok(A).slice(0, -2) + "xx")}`, { method: "GET" });
        ok(bad.status === 400, "Değiştirilmiş bağlantı reddediliyor", why(bad));
        const mine = await api(`/api/after-sale?order=${A}`, { method: "GET", token: F.member.token });
        const notMine = await api(`/api/after-sale?order=${A}`, { method: "GET", token: F.admin.token });
        ok(mine.status === 200 && notMine.status === 400, "Hesabım'dan yalnız kendi siparişi açılıyor", `${why(mine)} / ${why(notMine)}`);
        const k = await cust(A, { action: "ok" });
        ok(k.status === 200 && ord(A).fit_status === "ok", "Müşteri 'oldu' dedi → fatura sırası", `${why(k)} → ${ord(A).fit_status}`);
        const k2 = await cust(A, { action: "ok" });
        ok(k2.status === 400, "Cevap ikinci kez verilemiyor", why(k2));

        // ── Değişim döngüsü ──
        const B = await delivered();
        const itB = row(`SELECT id FROM public.order_items WHERE order_id = ${lit(B)} AND unit_price > 0`);
        const ex = await cust(B, { action: "exchange", reason: "small", items: [{ order_item_id: itB.id, variant_id: F.var2 }] });
        ok(ex.status === 200 && caseOf(B)?.status === "requested" && ord(B).fit_status === "exchange", "Değişim talebi açıldı", `${why(ex)} → ${caseOf(B)?.status}`);
        const ex2 = await cust(B, { action: "return", items: [itB.id], method: "surat" });
        ok(ex2.status === 400, "Açık talep varken ikinci talep açılamıyor", why(ex2));
        const mem = await api("/api/admin/orders/case", { token: F.member.token, body: { orderId: B, op: "fit_ok" } });
        ok(mem.status === 403, "Üye yönetici talep işlemi yapamıyor", why(mem));
        const s2 = stock2();
        const sh = await adminCase(B, { op: "ship_alt", tracking: "RGT-TAKIP-1" });
        const altItem = row(`SELECT id, unit_price FROM public.order_items WHERE order_id = ${lit(B)} AND exchange_of = ${lit(itB.id)}`);
        ok(sh.status === 200 && caseOf(B)?.status === "alt_shipped" && !!altItem && stock2() === s2 - 1, "Alternatif gönderildi (siparişe eklendi, stoğu düştü)", `${why(sh)} → ${caseOf(B)?.status}, stok ${s2} → ${stock2()}`);
        ok(altItem && eq(altItem.unit_price, 1000) && eq(ord(B).total_amount, 1000 + S1000), "Alternatif ek ücret yaratmıyor (tutar aynı)", `kalem ${altItem?.unit_price}, tutar ${ord(B).total_amount}`);
        const ad = await adminCase(B, { op: "alt_delivered" });
        ok(ad.status === 200 && caseOf(B)?.status === "alt_delivered", "Alternatif teslim edildi → müşteriye 'hangisi oldu?'", why(ad));
        const kp = await cust(B, { action: "keep", keep_item_id: altItem?.id, method: "surat" });
        ok(kp.status === 200 && caseOf(B)?.status === "keep_chosen" && caseOf(B)?.keep_item_id === altItem?.id, "Müşteri tuttuğunu seçti", `${why(kp)} → ${caseOf(B)?.status}`);
        const lb = await adminCase(B, { op: "send_label", method: "surat", code: "RGT123" });
        ok(lb.status === 200 && caseOf(B)?.status === "label_sent" && caseOf(B)?.return_code === "RGT123", "Geri gönderim kodu gönderildi", why(lb));
        const s1 = stock();
        const rb = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "return", orderId: B, items: [{ item_id: itB.id, qty: 1, restock: true }], note: "regresyon değişim" } });
        const cB = caseOf(B);
        ok(rb.status === 200 && cB?.status === "resolved" && !!cB?.closed_at && ord(B).fit_status === "ok", "Tutulmayan ürün geldi → değişim tamam, sipariş 'oldu'", `${why(rb)} → ${cB?.status}, ${ord(B).fit_status}`);
        ok(stock() === s1 + 1 && ord(B).shipment_status === "delivered" && Number(ord(B).refunded_amount || 0) === 0, "Değişimde geri gelen stoğa eklendi, para iadesi yok", `stok ${s1} → ${stock()}, kargo ${ord(B).shipment_status}, iade ${ord(B).refunded_amount}`);

        // ── İade (havale → IBAN) ──
        const C = await delivered();
        const itC = row(`SELECT id FROM public.order_items WHERE order_id = ${lit(C)} AND unit_price > 0`);
        const noIban = await cust(C, { action: "return", items: [itC.id], method: "ups" });
        ok(noIban.status === 400, "Havalede IBAN'sız iade talebi reddediliyor", why(noIban));
        const wrong = await cust(C, { action: "return", items: [itC.id], method: "ups", iban: "TR000000000000000000000000" });
        ok(wrong.status === 400, "Geçersiz IBAN reddediliyor", why(wrong));
        const bban = "0006100519786457841326";
        let rem = 0; for (const d of bban + "292700") rem = (rem * 10 + Number(d)) % 97;
        const iban = `TR${String(98 - rem).padStart(2, "0")}${bban}`;
        const rt = await cust(C, { action: "return", items: [itC.id], method: "ups", iban, reason: "Beğenmedim" });
        const cC = caseOf(C);
        ok(rt.status === 200 && cC?.kind === "return" && cC?.return_method === "ups" && cC?.iban === iban, "İade talebi (UPS + IBAN) kaydedildi", `${why(rt)} ${JSON.stringify(cC || {}).slice(0, 120)}`);
        const view = await api(`/api/after-sale?r=${encodeURIComponent(asTok(C))}`, { method: "GET" });
        ok(!String(view.text).includes(bban), "IBAN müşteri sayfasında açık görünmüyor", "IBAN tam hâliyle dönüyor");
        const lc = await adminCase(C, { op: "send_label", method: "aras", code: "RGT456" });
        ok(lc.status === 200 && caseOf(C)?.return_method === "aras", "Yönetici kargo yolunu değiştirip kod gönderebiliyor (UPS almadı → Aras)", why(lc));
        const rc = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "return", orderId: C, items: [{ item_id: itC.id, qty: 1, restock: true }], refund: { amount: Number(ord(C).total_amount), method: "bank_transfer" }, confirmed: true, note: "regresyon iade" } });
        ok(rc.status === 200 && caseOf(C)?.status === "received" && !!caseOf(C)?.closed_at && ord(C).payment_status === "refunded", "İade geldi → talep kapandı, ödeme iade edildi", `${why(rc)} → ${caseOf(C)?.status}, ${ord(C).payment_status}`);
      });

      await part("Satış ortaklığı", async () => {
        const affOf = (r) => (r.json?.orderId ? ord(r.json.orderId)?.affiliate_id : "sipariş yok");
        const r1 = await order([MAIN(1)], { affiliateCode: F.affCode });
        if (!r1.json?.orderId) return add("fail", "Ortak linkiyle sipariş oluşturulamadı", why(r1));
        ok(affOf(r1) === F.aff, "Ortak linkiyle gelen sipariş ortağa yazıldı", `affiliate_id ${affOf(r1)}`);
        const r2 = await order([MAIN(1)], { affiliateCode: F.affSelf });
        ok(!!r2.json?.orderId && !affOf(r2), "Ortak kendi linkiyle alınca sayılmıyor", `${why(r2)} affiliate_id ${affOf(r2)}`);
        const r3 = await order([MAIN(1)], { affiliateCode: F.affOff });
        ok(!!r3.json?.orderId && !affOf(r3), "Askıya alınmış ortağın linki sayılmıyor (sipariş yine verilir)", `${why(r3)} affiliate_id ${affOf(r3)}`);
        const r4 = await order([MAIN(1)], { affiliateCode: "RGTOLMAYANKOD" });
        ok(!!r4.json?.orderId && !affOf(r4), "Olmayan ortak kodu siparişi bozmuyor", `${why(r4)} affiliate_id ${affOf(r4)}`);
      });

      await part("Reklamdan gelen sipariş (kaynak + Meta bildirimi)", async () => {
        // Tarayıcının gönderdiği bağlam (src/lib/ad-context.ts › getAdContext) — Instagram reklamı, çerez onaylı
        const adContext = {
          consent: true,
          source: { utm_source: "instagram", utm_medium: "paid", utm_campaign: "rgt-reels", fbclid: "1", ts: Date.now() },
          meta: { fbp: "fb.1.1700000000000.1234567890", fbc: "fb.1.1700000000000.RGTtest", url: "https://yerihisset.test/checkout" },
        };
        const r = await order([MAIN(1)], { adContext });
        if (!r.json?.orderId) return add("fail", "Reklam kaynaklı sipariş oluşturulamadı", why(r));
        let a = null;
        for (let i = 0; i < 12; i++) { a = ord(r.json.orderId)?.attribution; if (a?.capi) break; await sleep(500); }
        ok(a?.source?.utm_source === "instagram" && a?.source?.utm_campaign === "rgt-reels" && a?.source?.fbclid === true,
          "Siparişe reklam kaynağı yazıldı (admin: Kaynak)", JSON.stringify(a));
        ok(a?.capi?.status === "skipped" && !a?.meta, "Meta bildirimi: test siparişi gönderilmiyor, geçici bilgi (IP/tarayıcı) silindi",
          `${JSON.stringify(a)} — Conversions API bağlantısı (sipariş → src/lib/meta-capi.ts) çalışmıyor olabilir`);
        const r2 = await order([MAIN(1)], { adContext: { ...adContext, consent: false } });
        const a2 = r2.json?.orderId ? ord(r2.json.orderId)?.attribution : null;
        ok(!!r2.json?.orderId && a2?.source?.utm_source === "instagram" && !a2?.meta, "Çerez onayı yoksa Meta bilgisi hiç saklanmıyor", `${why(r2)} ${JSON.stringify(a2)}`);
        const r3 = await order([MAIN(1)], { adContext: { consent: "evet", source: "<script>", meta: { fbp: "x" } } });
        ok(!!r3.json?.orderId && !ord(r3.json.orderId)?.attribution, "Bozuk reklam bilgisi siparişi bozmuyor, kaydedilmiyor", `${why(r3)} ${JSON.stringify(r3.json?.orderId ? ord(r3.json.orderId)?.attribution : null)}`);
      });

      await part("Üyelik durumu ve e-posta doğrulama", async () => {
        const st = (uid) => one(`SELECT public.member_account_state(${lit(uid)})`);
        const lvl = (uid) => num(`SELECT public.member_level(${lit(uid)})`);
        const hasUye = (uid) => num(`SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = ${lit(uid)} AND r.slug = 'uye'`) === 1;
        const token = () => one(`SELECT email_verify_token FROM public.profiles WHERE id = ${lit(F.member.id)}`) || "";

        // Misafir (şifresiz) hesap: "Üye" değil, ayrıcalık seviyesi 0
        const guestId = one(`SELECT id FROM auth.users WHERE email = ${lit(`rgt-misafir-${RUN}@${DOMAIN}`)}`);
        if (guestId) ok(st(guestId) === "guest" && !hasUye(guestId) && lvl(guestId) === 0, "Misafir hesabı 'Üye' sayılmıyor", `${st(guestId)}, Üye rolü ${hasUye(guestId)}, seviye ${lvl(guestId)}`);

        // Kayıtlı ama doğrulanmamış üye (ödenmiş siparişi olduğu halde) → seviye 0, ayrıcalık kapalı
        ok(st(F.member.id) === "unverified" && !hasUye(F.member.id) && lvl(F.member.id) === 0, "Doğrulanmamış üye: 'Üye' rolü yok, seviye 0",
          `${st(F.member.id)}, Üye rolü ${hasUye(F.member.id)}, seviye ${lvl(F.member.id)}`);
        const tk1 = token();
        ok(tk1.length >= 32, "Sipariş e-postasında doğrulama bağlantısı üretildi", "profiles.email_verify_token boş — sipariş e-postasına doğrulama kutusu eklenmiyor");

        // Fırsat (Üye seviyesi, kupon) — doğrulamadan alınamaz
        const oc = insert("coupons", { code: `RGT${RUN.toUpperCase()}FRS`, name: "REGRESYON-TEST fırsat", type: "percentage", amount: 5, min_order_amount: 0, per_user_limit: 1, is_active: true, is_personal: true, auto_assign_on_signup: false });
        const opp = insert("partner_opportunities", { title: "REGRESYON-TEST fırsat", partner_name: "REGRESYON-TEST", kind: "coupon", coupon_id: oc, tier_level: 1, claim_limit: 1, is_active: true });
        const oppHigh = insert("partner_opportunities", { title: "REGRESYON-TEST müdavim fırsatı", partner_name: "REGRESYON-TEST", kind: "coupon", coupon_id: oc, tier_level: 9, claim_limit: 1, is_active: true });
        const c1 = await api("/api/opportunity/claim", { token: F.member.token, body: { opportunityId: opp } });
        ok(c1.status === 403 && c1.json?.needVerify === true, "Doğrulanmamış üye Fırsat kuponu alamıyor", why(c1));
        const a1 = await api("/api/affiliate/apply", { token: F.member.token, body: { answers: {} } });
        ok(a1.status === 403, "Doğrulanmamış üye iş ortağı olamıyor", why(a1));

        // Yeniden gönder → yeni bağlantı; eskisi geçersiz; yenisiyle doğrulanır
        const rs = await api("/api/auth/resend-verification", { token: F.member.token, body: {} });
        const tk2 = token();
        ok(rs.status === 200 && tk2 && tk2 !== tk1, "Doğrulama e-postası yeniden istenebiliyor (yeni bağlantı)", why(rs));
        const old = await api("/api/auth/verify-email", { body: { token: tk1 } });
        ok(old.status === 400 && st(F.member.id) === "unverified", "Eski doğrulama bağlantısı geçersiz", why(old));
        const v = await api("/api/auth/verify-email", { body: { token: tk2 } });
        ok(v.status === 200 && st(F.member.id) === "member", "Bağlantıyla e-posta doğrulandı", `${why(v)} → ${st(F.member.id)}`);
        ok(hasUye(F.member.id) && lvl(F.member.id) >= 2, "Doğrulanınca 'Üye' oldu; ödenmiş siparişi olduğu için seviye Müşteri", `Üye rolü ${hasUye(F.member.id)}, seviye ${lvl(F.member.id)}`);
        const welcome = num("SELECT count(*) FROM public.coupons WHERE auto_assign_on_signup AND is_active");
        if (welcome) {
          const got = num(`SELECT count(*) FROM public.user_coupons uc JOIN public.coupons c ON c.id = uc.coupon_id WHERE uc.user_id = ${lit(F.member.id)} AND c.auto_assign_on_signup`);
          ok(got === welcome, "Doğrulanınca hoş geldin kuponları atandı", `${got}/${welcome}`);
        }

        // Doğrulanmış üye: seviyesi yetiyorsa alır, yetmiyorsa sunucu reddeder
        const c2 = await api("/api/opportunity/claim", { token: F.member.token, body: { opportunityId: opp } });
        ok(c2.status === 200, "Doğrulanmış üye Fırsat kuponunu alıyor", why(c2));
        const c3 = await api("/api/opportunity/claim", { token: F.member.token, body: { opportunityId: oppHigh } });
        ok(c3.status === 403 && !!c3.json?.needLevel, "Üst seviye fırsatı doğrudan istekle alınamıyor", `${why(c3)} — seviye kontrolü yalnız sayfada`);
        const a2 = await api("/api/affiliate/apply", { token: F.member.token, body: { answers: {} } });
        ok(a2.status !== 403, "Doğrulanınca iş ortaklığı başvurusu açılıyor", why(a2));
        const fp = await api("/firsatlar", { method: "GET" });
        ok(!fp.text.includes("REGRESYON-TEST"), "Test fırsatı Fırsatlar sayfasında görünmüyor", "REGRESYON-TEST fırsatı sitede listelendi");

        // Mesaj bildirimi: başkasının siparişi için tetiklenemez
        if (O.guest) {
          const m1 = await api("/api/messages/notify", { token: F.member.token, body: { orderId: O.guest, senderRole: "user" } });
          const m2 = await api("/api/messages/notify", { token: F.member.token, body: { orderId: O.guest, senderRole: "admin" } });
          ok(m1.status === 403 && m2.status === 403, "Üye başkasının siparişi için mesaj e-postası tetikleyemiyor", `${why(m1)} / ${why(m2)}`);
        }
      });

      await part("Kampanya e-postası izni", async () => {
        const mc = (uid) => row(`SELECT marketing_consent AS c, marketing_consent_source AS s FROM public.profiles WHERE id = ${lit(uid)}`) || {};
        const logs = (uid) => num(`SELECT count(*) FROM public.marketing_consent_log WHERE user_id = ${lit(uid)}`);
        // E-postadaki bağlantının imzası (src/lib/marketing-consent.ts ile aynı kural)
        const tok = (uid) => `${uid}.${createHmac("sha256", `marketing-consent:${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`).update(uid).digest("base64url").slice(0, 32)}`;

        ok(mc(F.member.id).c === false, "Varsayılan: izin yok", JSON.stringify(mc(F.member.id)));
        const anon = await api("/api/marketing-consent", { body: { granted: true } });
        ok(anon.status === 401, "Girişsiz ve bağlantısız izin verilemiyor", why(anon));
        const a = await api("/api/marketing-consent", { token: F.member.token, body: { granted: true } });
        ok(a.status === 200 && mc(F.member.id).c === true && mc(F.member.id).s === "account" && logs(F.member.id) === 1, "Hesabım'dan izin verildi + ispat kaydı", `${why(a)} ${JSON.stringify(mc(F.member.id))}, kayıt ${logs(F.member.id)}`);
        const p = await rest(`profiles?id=eq.${F.member.id}`, { token: F.member.token, method: "PATCH", headers: { Prefer: "return=representation" }, body: { marketing_consent: false } });
        ok(mc(F.member.id).c === true, "İzin tarayıcıdan doğrudan değiştirilemiyor (kayıtsız)", `HTTP ${p.status} — profiles.marketing_consent istemciye açık`);

        const g = await api(`/api/marketing-consent?t=${encodeURIComponent(tok(F.member.id))}`, { method: "GET" });
        ok(g.status === 200 && g.json?.granted === true && /•/.test(g.json?.email || ""), "E-posta bağlantısı durumu okuyor (adres maskeli)", `${why(g)} ${JSON.stringify(g.json)}`);
        const out = await api("/api/marketing-consent", { body: { t: tok(F.member.id), granted: false } });
        ok(out.status === 200 && mc(F.member.id).c === false && mc(F.member.id).s === "email_link" && logs(F.member.id) === 2, "E-posta bağlantısıyla kampanyadan çıkış", `${why(out)} ${JSON.stringify(mc(F.member.id))}`);
        const bad = await api("/api/marketing-consent", { body: { t: tok(F.member.id).slice(0, -2) + "xx", granted: true } });
        ok(bad.status === 400 && mc(F.member.id).c === false, "Değiştirilmiş bağlantı reddediliyor", why(bad));
        const page = await api(`/kampanya-izni?t=${encodeURIComponent(tok(F.member.id))}`, { method: "GET" });
        ok(page.status === 200, "Kampanya izni sayfası açılıyor", `HTTP ${page.status}`);

        // Ödeme sayfasındaki kutu: üye ve misafir siparişinde izin kaydedilir
        const r = await order([MAIN(1)], { marketingConsent: true });
        ok(!!r.json?.orderId && mc(F.member.id).c === true && mc(F.member.id).s === "checkout", "Siparişte işaretlenen kutu izni kaydetti", `${why(r)} ${JSON.stringify(mc(F.member.id))}`);
        const r0 = await order([MAIN(1)]);
        ok(!!r0.json?.orderId && mc(F.member.id).c === true, "Kutu işaretlenmeden verilen sipariş izni geri almıyor", JSON.stringify(mc(F.member.id)));
        const ge = `rgt-izin-${RUN}@${DOMAIN}`;
        const gr = await api("/api/orders/create", {
          headers: { "x-forwarded-for": F.ip },
          body: { items: [MAIN(1)], guest: { email: ge, firstName: "Elif", lastName: "Deneme", phone: "5551234568", city: "İstanbul", district: "Kadıköy", addressDetail: "Moda Caddesi No 14 Daire 2" }, paymentMethod: "bank_transfer", _hp: "", _t: 6000, marketingConsent: true },
        });
        const gid = one(`SELECT id FROM public.profiles WHERE email = ${lit(ge)}`);
        ok(gr.status === 200 && gid && mc(gid).c === true, "Misafir siparişinde izin kaydedildi", `${why(gr)} ${gid ? JSON.stringify(mc(gid)) : "profil yok"}`);
      });

      await part("Kampanya e-postası kuralı: izinsize gitmez, bülten izni, abonelikten çık", async () => {
        // Kuyruktaki kampanya e-postası izinsiz alıcıya GÖNDERİLMEZ (gönderim anında "skipped") — src/lib/marketing-mail.ts
        sql(`UPDATE public.profiles SET marketing_consent = false, marketing_consent_at = NULL WHERE id = ${lit(F.member.id)}`);
        const qid = one(`INSERT INTO public.email_queue (kind, recipient_email, subject, html_body, status) VALUES ('campaign', ${lit(F.member.email)}, 'REGRESYON-TEST kampanya', '<p>x</p>', 'pending') RETURNING id`);
        const cr = await api("/api/cron/process-email-queue", { headers: { "x-cron-secret": process.env.CRON_SECRET || "" } });
        const st = one(`SELECT status || ':' || coalesce(error_message, '') FROM public.email_queue WHERE id = ${lit(qid)}`);
        ok(cr.status === 200 && String(st).startsWith("skipped"), "İzinsiz üyeye kampanya e-postası gitmiyor", `HTTP ${cr.status} · ${st}`);
        sql(`DELETE FROM public.email_queue WHERE id = ${lit(qid)}`);
        // Bülten aboneliği = kampanya izni (kişi kaydında)
        const ne = `rgt-bulten-${RUN}@${DOMAIN}`;
        const nl = await api("/api/newsletter", { headers: { "x-forwarded-for": F.ip }, body: { email: ne, _hp: "", _t: 6000 } });
        const c = row(`SELECT id, marketing_consent AS mc FROM public.contacts WHERE email = ${lit(ne)}`);
        ok(nl.status === 200 && c?.mc === true, "Bülten aboneliği kampanya izni olarak kaydediliyor", `${why(nl)} ${JSON.stringify(c)}`);
        // E-postadaki "abonelikten çık" bağlantısı (kişi: "c." önekli imzalı bağlantı)
        if (c?.id) {
          const sig = createHmac("sha256", `contact-marketing-consent:${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`).update(c.id).digest("base64url").slice(0, 32);
          const un = await api("/api/marketing-consent", { body: { t: `c.${c.id}.${sig}`, granted: false } });
          const c2 = row(`SELECT marketing_consent AS mc, marketing_opt_out_at IS NOT NULL AS out FROM public.contacts WHERE id = ${lit(c.id)}`);
          ok(un.status === 200 && c2?.mc === false && c2?.out === true, "Abonelikten çık bağlantısı çalışıyor", `${why(un)} ${JSON.stringify(c2)}`);
        }
      });

      await part("Stok bildirimi (Stoğa girince haber ver)", async () => {
        const H = { "x-forwarded-for": F.ip };
        const email = `rgt-bildirim-${RUN}@${DOMAIN}`;
        const base = { productId: F.prod, variantId: F.var, contact: email, _hp: "", _t: 6000 };
        const pending = () => num(`SELECT count(*) FROM public.stock_notifications WHERE product_id = ${lit(F.prod)} AND status = 'pending'`);
        const b = await api("/api/stock-notify", { headers: H, body: { ...base, _t: undefined } });
        ok(b.status === 429 && pending() === 0, "Formsuz (bot) kayıt reddediliyor", why(b));
        const g = await api("/api/stock-notify", { headers: H, body: base });
        const gRow = row(`SELECT status, contact_id FROM public.stock_notifications WHERE email = ${lit(email)}`);
        ok(g.status === 200 && gRow?.status === "pending", "Misafir kaydı alındı", `${why(g)} kayıt ${JSON.stringify(gRow)}`);
        ok(!!gRow?.contact_id, "Misafir Kişiler listesine eklendi", "contact_id boş");
        const d = await api("/api/stock-notify", { headers: H, body: base });
        ok(d.json?.alreadyRegistered === true && pending() === 1, "Aynı kişi iki kez kaydolmuyor", `${JSON.stringify(d.json)}; bekleyen ${pending()}`);
        const m = await api("/api/stock-notify", { token: F.member.token, body: { productId: F.prod, variantId: F.var } });
        const mRow = row(`SELECT email FROM public.stock_notifications WHERE user_id = ${lit(F.member.id)}`);
        ok(m.status === 200 && mRow?.email === F.member.email, "Üye kaydı (e-postası hesaptan)", `${why(m)} ${JSON.stringify(mRow)}`);
        const nm = await api("/api/stock-notify/dispatch", { token: F.member.token, body: { productId: F.prod, variantId: F.var } });
        ok(nm.status === 403, "Üye 'stok geldi' gönderimini başlatamıyor", why(nm));
        // Test adreslerine e-posta gitmez → gönderim başarısız sayılır, kayıtlar "bekliyor" kalır (sonra tekrar denenebilir)
        const ds = await api("/api/stock-notify/dispatch", { token: F.admin.token, body: { productId: F.prod, variantId: F.var } });
        ok(ds.status === 200 && ds.json?.ok === true, "Yönetici 'stok geldi' gönderimini başlatabiliyor", why(ds));
        ok(ds.json?.sent === 0 && pending() === 2, "Gönderilemeyen bildirim 'bekliyor' kalıyor (test adresine e-posta gitmedi)",
          `gönderilen ${ds.json?.sent}, başarısız ${ds.json?.failed}, bekleyen ${pending()}`);
      });

      await part("Manuel stok bildirimi: yönetici üyeye ekleyebiliyor", async () => {
        // Başka kanaldan (Instagram / WhatsApp) "haber verin" diyen üyeyi yönetici elle ekler → bildirim üyenin hesabına bağlı
        const ins = await rest("stock_notifications", { token: F.admin.token, method: "POST", headers: { Prefer: "return=representation" },
          body: { product_id: F.prod, variant_id: F.var, user_id: F.member.id, email: F.member.email ?? null, status: "pending" } });
        ok(ins.status < 300, "Yönetici üye adına stok bildirimi ekleyebiliyor", `HTTP ${ins.status} ${ins.text?.slice?.(0, 120) ?? ""}`);
        const own = await rest(`stock_notifications?user_id=eq.${F.member.id}&product_id=eq.${F.prod}&select=id`, { token: F.member.token });
        ok(Array.isArray(own.json) && own.json.length >= 1, "Üye kendi stok bildirimini görüyor", `HTTP ${own.status}`);
      });

      await part("Pano: sistem durumu ve müşteri hata kaydı", async () => {
        const st = await api("/api/admin/system-status", { method: "GET", token: F.admin.token });
        const keys = (st.json?.tiles ?? []).map((x) => x.key).join(",");
        ok(st.status === 200 && keys === "server,integrations,mail,backup,attacks,access,customer_errors", "Yönetici sistem durumunu görebiliyor (7 kutu, e-posta dahil)", `HTTP ${st.status} · ${keys || why(st)}`);
        const tm = await api("/api/admin/system-status", { token: F.member.token, body: { action: "test_mail" } });
        ok(tm.status === 401 || tm.status === 403, "Üye deneme e-postası gönderemiyor", `HTTP ${tm.status}`);
        // Göndermeden alıcıyı çöz (dryRun): "Yönetici e-posta adresi ayarlı değil" hatası yakalansın
        const dr = await api("/api/admin/system-status", { token: F.admin.token, body: { action: "test_mail", dryRun: true } });
        ok(dr.status === 200 && /@/.test(dr.json?.to || ""), "Deneme e-postasının alıcısı bulunuyor (yönetici adresi)", why(dr));
        const bad = await api("/api/admin/system-status", { token: F.admin.token, body: { action: "yok" } });
        ok(bad.status === 400, "Sistem ucu bilinmeyen işlemi reddediyor", `HTTP ${bad.status}`);
        ok(["ok", "warn", "fail"].includes(st.json?.overall), "Sistem durumu genel sonuç veriyor", `overall=${st.json?.overall}`);
        const mm = await api("/api/admin/system-status", { method: "GET", token: F.member.token });
        ok(mm.status === 401 || mm.status === 403, "Üye sistem durumunu göremiyor", `HTTP ${mm.status}`);
        const ce = await api("/api/client-error", { body: { kind: "checkout", message: `REGRESYON-TEST ${RUN}`, path: "/checkout" } });
        ok(ce.status === 200, "Müşteri hata kaydı ucu çalışıyor", why(ce));
        await sleep(500);
        const n = num(`SELECT count(*) FROM public.client_errors WHERE message = ${lit(`REGRESYON-TEST ${RUN}`)}`);
        ok(n === 1, "Ödeme sayfası hatası kaydedildi (panoda 'Hata alan müşteriler')", `${n} kayıt`);
      });

      await part("Bugünün işleri: sonuçsuz arama → sil / talebe ekle", async () => {
        // İnsan oturumunda sonuçsuz aramalar + bot oturumunda bir tane (bot sayılmamalı)
        const term = `regresyon-test ${RUN}`, junk = `regresyon-test-sacma ${RUN}`, botTerm = `regresyon-test-bot ${RUN}`;
        const sid = one(`INSERT INTO public.analytics_sessions (session_id, landing_path) VALUES (gen_random_uuid(), '/regresyon-test') RETURNING session_id`);
        const bid = one(`INSERT INTO public.analytics_sessions (session_id, landing_path, is_bot) VALUES (gen_random_uuid(), '/regresyon-test', true) RETURNING session_id`);
        const ev = (s, t) => `(${lit(s)}, 'search', '/ara', jsonb_build_object('term', ${lit(t)}, 'results_count', 0))`;
        sql(`INSERT INTO public.analytics_events (session_id, event_type, path, meta) VALUES ${[ev(sid, term), ev(sid, term), ev(sid, junk), ev(bid, botTerm)].join(", ")}`);
        const mine = (L) => JSON.stringify(L.filter((x) => String(x.term).startsWith("regresyon-test")));
        const list = async () => {
          const r = await rest("rpc/no_result_searches", { token: F.admin.token, method: "POST", body: { p_days: 1 } });
          return Array.isArray(r.json) ? r.json : [];
        };
        let L = await list();
        const hit = L.find((x) => x.term === term);
        ok(!!hit && Number(hit.cnt) === 2 && L.some((x) => x.term === junk), "Sonuçsuz aramalar listeleniyor (adetle)", mine(L));
        ok(!L.some((x) => x.term === botTerm), "Bot aramaları sayılmıyor");
        const an = await rest("rpc/no_result_searches", { method: "POST", body: { p_days: 1 } });
        ok(an.status >= 400 || (Array.isArray(an.json) && an.json.length === 0), "Sonuçsuz aramalar dışarıya kapalı", `HTTP ${an.status}`);
        const mem = await rest("rpc/no_result_searches", { token: F.member.token, method: "POST", body: { p_days: 1 } });
        ok(mem.status >= 400 || (Array.isArray(mem.json) && mem.json.length === 0), "Üye sonuçsuz aramaları göremiyor", `HTTP ${mem.status}`);
        // Sil (saçma) → listeden düşer
        const del = await rest("search_dismissals", { token: F.admin.token, method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: { term: junk, action: "deleted" } });
        ok(del.status < 300, "Yönetici sonuçsuz aramayı silebiliyor", `HTTP ${del.status}`);
        // Talebe ekle → talep kaydı + listeden düşer
        const fb = await rest("feedback", { token: F.admin.token, method: "POST", body: { message: `Sonuçsuz arama: "${term}"`, source: "search" } });
        ok(fb.status < 300, "Yönetici talep ekleyebiliyor (Yeni ekle / Talebe ekle)", `HTTP ${fb.status}`);
        await rest("search_dismissals", { token: F.admin.token, method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: { term, action: "to_feedback" } });
        L = await list();
        ok(!L.some((x) => x.term === junk || x.term === term), "Silinen / talebe eklenen arama listeden kalktı (sayı azaldı)", mine(L));
        const mdis = await rest("search_dismissals", { token: F.member.token, method: "POST", body: { term: `regresyon-test-uye ${RUN}` } });
        ok(mdis.status >= 400, "Üye sonuçsuz arama silemiyor", `HTTP ${mdis.status}`);
        // Aynı terim silindikten SONRA yeniden aranırsa geri gelir
        await sleep(1100);
        sql(`INSERT INTO public.analytics_events (session_id, event_type, path, meta) VALUES ${ev(sid, junk)}`);
        L = await list();
        ok(L.some((x) => x.term === junk && Number(x.cnt) === 1), "Silinen terim yeniden aranınca listeye geri geliyor", mine(L));
      });

      await part("Çerez onayı: seçim kaydı, reddedince anonimleşme, kimliksiz sayım", async () => {
        const UA = { "User-Agent": "Mozilla/5.0 (regresyon testi)", "X-Forwarded-For": "203.0.113.7" };
        const m = await api("/api/track", { method: "GET" });
        ok(m.status === 200 && typeof m.json?.strict === "boolean", "Çerez modu okunuyor (Ayarlar › Çerez onayı)", `HTTP ${m.status} · strict=${m.json?.strict}`);
        // Tam kayıt (istatistik izni var): ziyaret satırı IP ile oluşur
        const sid = one("SELECT gen_random_uuid()");
        const full = await api("/api/track", { headers: UA, body: { session_id: sid, cs: "1", landing_path: "/regresyon-test", events: [{ type: "page_view", path: "/regresyon-test", ts: Date.now() }] } });
        const s1 = sql(`SELECT ip, coalesce(consent, '') FROM public.analytics_sessions WHERE session_id = ${lit(sid)}`)[0] || [];
        ok(full.status === 200 && s1[0] === "203.0.113.7", "İzinli ziyaret IP ile kaydediliyor", `HTTP ${full.status} · ip=${s1[0] ?? "satır yok"}`);
        // Reddet: seçim satıra yazılır, IP silinir, onay defterine düşer
        await api("/api/track", { headers: UA, body: { session_id: sid, consent: { stats: false, marketing: false } } });
        const s2 = sql(`SELECT coalesce(ip, ''), coalesce(consent, '') FROM public.analytics_sessions WHERE session_id = ${lit(sid)}`)[0] || [];
        ok(s2[1] === "rejected" && s2[0] === "", "Reddedince ziyaret anonimleşiyor (IP silindi, seçim: red)", `consent=${s2[1]} ip=${s2[0] || "yok"}`);
        const lg = num(`SELECT count(*) FROM public.consent_log WHERE session_id = ${lit(sid)} AND NOT stats AND NOT marketing`);
        ok(lg === 1, "Çerez seçimi onay defterine yazıldı", `${lg} kayıt`);
        // Kimliksiz sayım: IP / kimlik olmadan gün · sayfa · kaynak · cihaz
        const an = await api("/api/track", { headers: UA, body: { anon: true, views: [{ path: "/regresyon-test-anonim", source: "regresyon" }] } });
        const v = num(`SELECT coalesce(sum(views), 0) FROM public.analytics_anon_daily WHERE path = '/regresyon-test-anonim'`);
        ok(an.status === 200 && v >= 1, "İzinsiz ziyaret kimliksiz sayılıyor", `HTTP ${an.status} · ${v} görüntüleme`);
      });

      await part("Kategori sayfa metni: tanıtım + SSS (yapısal veri)", async () => {
        const up = await rest(`categories?id=eq.${F.cat}`, { token: F.admin.token, method: "PATCH", headers: { Prefer: "return=representation" },
          body: { intro: "REGRESYON-TEST tanıtım metni", faq: [{ q: "REGRESYON-TEST soru?", a: "REGRESYON-TEST cevap." }] } });
        ok(up.status < 300, "Yönetici kategori sayfa metnini kaydedebiliyor", `HTTP ${up.status}`);
        const mu = await rest(`categories?id=eq.${F.cat}`, { token: F.member.token, method: "PATCH", body: { intro: "üye yazdı" } });
        ok(one(`SELECT intro FROM public.categories WHERE id = ${lit(F.cat)}`) === "REGRESYON-TEST tanıtım metni", "Üye kategori metnini değiştiremiyor", `HTTP ${mu.status}`);
        const pg = await api("/kategori/regresyon-test", { method: "GET" });
        ok(pg.text.includes("REGRESYON-TEST tanıtım metni") && pg.text.includes("REGRESYON-TEST soru?") && pg.text.includes('"FAQPage"'),
          "Tanıtım + SSS sayfada ve FAQPage yapısal verisinde", `HTTP ${pg.status}`);
      });

      await part("Düzenlenebilir sayfalar: taslak gizli, yayında açık", async () => {
        const slug = `regresyon-sayfa-${RUN}`;
        const up = await rest("static_pages", { token: F.admin.token, method: "POST", body: { slug, title: "REGRESYON", body: "<p>x</p>", draft: true } });
        ok(up.status < 300, "Yönetici sayfa metnini kaydedebiliyor", `HTTP ${up.status}`);
        const m1 = await rest(`static_pages?slug=eq.${slug}&select=slug`, { token: F.member.token });
        const a1 = await rest(`static_pages?slug=eq.${slug}&select=slug`);
        ok(!(Array.isArray(m1.json) && m1.json.length) && !(Array.isArray(a1.json) && a1.json.length), "Taslak sayfa dışarıya ve üyeye kapalı", `üye ${m1.json?.length ?? m1.status} · anon ${a1.json?.length ?? a1.status}`);
        const mu = await rest(`static_pages?slug=eq.${slug}`, { token: F.member.token, method: "PATCH", body: { draft: false } });
        ok(sql(`SELECT draft FROM public.static_pages WHERE slug = ${lit(slug)}`)[0]?.[0] === "t", "Üye sayfayı yayına alamıyor", `HTTP ${mu.status}`);
        await rest(`static_pages?slug=eq.${slug}`, { token: F.admin.token, method: "PATCH", body: { draft: false } });
        const a2 = await rest(`static_pages?slug=eq.${slug}&select=slug`);
        ok(Array.isArray(a2.json) && a2.json.length === 1, "Yayındaki sayfa herkese açık (site haritası)", `HTTP ${a2.status}`);
      });

      await part("Pazaryeri stok görevi: entegre kanala görev açılmaz", async () => {
        // jsonb_agg: tek satır çıktı (json_agg satır sonu ekler, one() yalnız ilk satırı okur)
        const parse = (q) => JSON.parse(one(q) || "[]");
        const chans = parse(`SELECT coalesce(jsonb_agg(json_build_object('id', id, 'name', name, 'api', integration = 'api')), '[]') FROM public.marketplace_channels WHERE is_active`);
        const s0 = stock();
        sql(`UPDATE public.product_variants SET stock = 0 WHERE id = ${lit(F.var)}`);
        const tasks = parse(`SELECT coalesce(jsonb_agg(channel_id), '[]') FROM public.stock_sync_tasks WHERE variant_id = ${lit(F.var)} AND status = 'pending'`);
        sql(`UPDATE public.product_variants SET stock = ${Number(s0)} WHERE id = ${lit(F.var)}`);
        sql(`DELETE FROM public.stock_sync_tasks WHERE variant_id = ${lit(F.var)}`);
        const apiCh = chans.filter((c) => c.api), manCh = chans.filter((c) => !c.api);
        ok(chans.length > 0, "Aktif pazaryeri kanalları okundu", "kanal listesi boş — test anlamsız kalır");
        ok(!tasks.some((id) => apiCh.some((c) => c.id === id)), "Entegrasyonu açık kanala manuel görev açılmıyor", `entegre: ${apiCh.map((c) => c.name).join(", ") || "yok"}`);
        ok(manCh.every((c) => tasks.includes(c.id)), "Entegrasyonu olmayan aktif kanala görev açılıyor", `manuel: ${manCh.map((c) => c.name).join(", ") || "yok"} · açılan ${tasks.length}`);
        ok(stock() === s0, "Test stoğu geri alındı", `stok ${stock()} (beklenen ${s0})`);
      });

      await part("Satış kanalları bağımsız: sitede / Trendyol'da kapat-aç, Amazon fiyatı", async () => {
        const buf = num("SELECT coalesce(trendyol_stock_buffer, 0) FROM public.settings ORDER BY id LIMIT 1");
        const sendQty = () => num(`SELECT public.marketplace_send_qty('trendyol', ${lit(F.var)}, 30)`);
        const expect = Math.min(Math.max(0, 30 - buf), 20000);
        const vActive = () => one(`SELECT is_active FROM public.product_variants WHERE id = ${lit(F.var)}`);
        // Sitede kapat (Fiyatlar › Site satış ile aynı istek) → sitede satılmaz, Trendyol'a gerçek stok gider
        const off = await rest(`product_variants?id=eq.${F.var}`, { token: F.admin.token, method: "PATCH", body: { is_active: false } });
        ok(off.status < 300 && vActive() === "f", "Yönetici numarayı sitede kapatabiliyor", `HTTP ${off.status}`);
        const n0 = memberOrders();
        const r1 = await order([MAIN(1)]);
        ok(r1.status === 400 && memberOrders() === n0, "Sitede kapalı numara sipariş edilemiyor", why(r1));
        ok(sendQty() === expect, "Sitede kapalı numara Trendyol'a gerçek stokla gidiyor", `gönderilecek ${sendQty()} (beklenen ${expect})`);
        const mu = await rest(`product_variants?id=eq.${F.var}`, { token: F.member.token, method: "PATCH", body: { is_active: true } });
        ok(vActive() === "f", "Üye numarayı sitede açamıyor", `HTTP ${mu.status}`);
        sql(`UPDATE public.product_variants SET is_active = true WHERE id = ${lit(F.var)}`);
        // Trendyol'da kapat → Trendyol'a 0 gider, sitede satış sürer
        const closeTy = (closed) => rest("rpc/set_marketplace_closed", { token: F.admin.token, method: "POST", body: { p_items: [{ channel: "trendyol", variant_id: F.var, closed }] } });
        const c1 = await closeTy(true);
        ok(c1.status < 300 && sendQty() === 0, "Trendyol'da kapatınca Trendyol'a stok 0 gidiyor", `HTTP ${c1.status}, gönderilecek ${sendQty()}`);
        const r2 = await order([MAIN(1)]);
        ok(!!r2.json?.orderId, "Trendyol'da kapalıyken sitede satış sürüyor", why(r2));
        const c2 = await closeTy(false);
        ok(c2.status < 300 && sendQty() === expect, "Trendyol'da açınca gerçek stok gidiyor", `HTTP ${c2.status}, gönderilecek ${sendQty()}`);
        // Ürünün tamamı sitede kapalı (test ürünü zaten pasif) → açık numarası da eski sepetten satılmaz
        const n1 = memberOrders();
        const r3 = await rawApi("/api/orders/create", { token: F.member.token, body: { items: [MAIN(1)], shippingAddressId: F.addr, billingSameAsShipping: true, paymentMethod: "bank_transfer" } });
        ok(r3.status === 400 && memberOrders() === n1, "Sitede kapalı ürünün numarası sipariş edilemiyor (eski sepet)", why(r3));
        // Amazon fiyatı kuyruğa giriyor (geri alınan işlem: gerçek kuyruğa / pazaryerine bir şey gitmez)
        const key = `RGT-AZ-${RUN}`.toUpperCase();
        // İki ayrı SELECT: aynı sorgudaki alt sorgu, fonksiyonun eklediği satırı görmez (sorgu başı görüntüsü)
        const az = sql(`BEGIN;
          UPDATE public.product_variants SET sku = ${lit(key)} WHERE id = ${lit(F.var)};
          INSERT INTO public.marketplace_listings (channel, listing_key) VALUES ('amazon', ${lit(key)}) ON CONFLICT DO NOTHING;
          INSERT INTO public.item_prices (product_id, variant_id, price_list_id, amount)
            SELECT ${lit(F.prod)}, ${lit(F.var)}, id, 1234.5 FROM public.price_lists WHERE code = 'amazon_sale';
          SELECT public.enqueue_marketplace_prices('amazon', ARRAY[${lit(F.var)}]::uuid[]);
          SELECT coalesce((SELECT sale_price::text FROM public.marketplace_price_sync WHERE channel = 'amazon' AND variant_id = ${lit(F.var)}), '-');
          ROLLBACK;`);
        const [qn, price] = [az[0]?.[0], az[1]?.[0]];
        ok(qn === "1" && Number(price) === 1234.5, "Amazon satış fiyatı pazaryeri kuyruğuna giriyor", `kuyruk ${qn ?? "?"}, fiyat ${price ?? "?"}`);
      });

      await part("Kargonomi: yetki ve ödemesiz sipariş", async () => {
        // Gerçek gönderi açılmaz: ödemesi alınmamış sipariş Kargonomi'ye hiç gitmez (teklif / firma seçimi / kod bekleme akışı)
        const r = await order([MAIN(1)]);
        const id = r.json?.orderId;
        if (!id) return add("fail", "Kargonomi testi için sipariş oluşturulamadı", why(r));
        const ship = (token, body) => rawApi("/api/kargonomi/ship", { ...(token ? { token } : {}), body: { order_id: id, ...body } });
        const a = await ship(null, { op: "quote", desi: 2 });
        ok(a.status === 401, "Kargonomi: girişsiz istek reddediliyor", why(a));
        const m = await ship(F.member.token, { op: "quote", desi: 2 });
        ok(m.status === 403, "Kargonomi: üye kargo oluşturamıyor", why(m));
        const bad = await ship(F.admin.token, { op: "yok" });
        ok(bad.status === 400, "Kargonomi: geçersiz işlem reddediliyor", why(bad));
        const q = await ship(F.admin.token, { op: "quote", desi: 2 });
        ok([400, 409].includes(q.status) && one(`SELECT kargonomi_shipment_id IS NULL FROM public.orders WHERE id = ${lit(id)}`) === "t",
          "Kargonomi: ödemesi alınmamış sipariş için gönderi açılmıyor", why(q));
      });

      await part("Paraşüt: yetki ve gizli bilgiler", async () => {
        const pa = (token, body) => rawApi("/api/admin/parasut", { ...(token ? { token } : {}), body });
        const a = await pa(null, { op: "status" });
        ok(a.status === 401, "Paraşüt: girişsiz istek reddediliyor", why(a));
        const m = await pa(F.member.token, { op: "status" });
        ok(m.status === 403, "Paraşüt: üye erişemiyor", why(m));
        const s = await pa(F.admin.token, { op: "status" });
        ok(s.status === 200 && s.json?.ok === true && !("clientSecret" in (s.json || {})), "Paraşüt: yönetici bağlantı durumunu görüyor (gizli bilgi dönmeden)", why(s));
        // Gizli bilgiler tarayıcıya kapalı: settings'teki secret, oturum tablosu
        const sec = await rest("settings?select=parasut_client_secret");
        ok(sec.status >= 400, "Paraşüt Client Secret dışarıdan okunamıyor", `HTTP ${sec.status}`);
        const au = await rest("parasut_auth?select=refresh_token", { token: F.admin.token });
        ok(au.status >= 400 || (Array.isArray(au.json) && au.json.length === 0), "Paraşüt oturum anahtarı yöneticinin tarayıcısına bile açık değil", `HTTP ${au.status}`);
        // Kanal / kargo ayarları yalnız yöneticide
        const mc = await rest("parasut_channel_settings?select=channel", { token: F.member.token });
        ok(Array.isArray(mc.json) ? mc.json.length === 0 : mc.status >= 400, "Üye Paraşüt kanal ayarlarını göremiyor", `HTTP ${mc.status}`);
        const ac = await rest("parasut_channel_settings?select=channel", { token: F.admin.token });
        ok(Array.isArray(ac.json) && ac.json.some((x) => x.channel === "trendyol"), "Yönetici kanal ayarlarını görüyor (Trendyol satırı var)", `HTTP ${ac.status}`);
        const mw = await rest("cargo_carriers", { token: F.member.token, method: "POST", body: { name: "REGRESYON-TEST kargo", vkn: "1234567890" } });
        ok(mw.status >= 400 && num("SELECT count(*) FROM public.cargo_carriers WHERE name LIKE 'REGRESYON-TEST%'") === 0, "Üye kargo firması VKN'si ekleyemiyor", `HTTP ${mw.status}`);
        // Fatura: üye kesemez; ödemesi alınmamış sipariş Paraşüt'e hiç gitmez (gerçek fatura kesilmez)
        const r = await order([MAIN(1)]);
        const id = r.json?.orderId;
        if (!id) return add("fail", "Paraşüt testi için sipariş oluşturulamadı", why(r));
        const mi = await pa(F.member.token, { op: "invoice", order_id: id });
        ok(mi.status === 403, "Paraşüt: üye fatura kesemiyor", why(mi));
        const ai = await pa(F.admin.token, { op: "invoice", order_id: id });
        ok([400, 422].includes(ai.status) && one(`SELECT parasut_invoice_id IS NULL AND parasut_status IS NULL FROM public.orders WHERE id = ${lit(id)}`) === "t",
          "Paraşüt: ödemesi alınmamış sipariş için fatura açılmıyor", why(ai));
        // Kargo firması seçtirme (entegrasyon dışı gönderim): listede olmayan firma siparişe yazılmaz
        const ac2 = await pa(F.admin.token, { op: "invoice", order_id: id, carrier: "REGRESYON-YOK kargo" });
        ok(ac2.status >= 400 && one(`SELECT cargo_provider IS NULL FROM public.orders WHERE id = ${lit(id)}`) === "t",
          "Paraşüt: listede olmayan kargo firması siparişe yazılmıyor", why(ac2));
        const pdf = await pa(F.admin.token, { op: "invoice_pdf", order_id: id });
        ok(pdf.status === 404, "Paraşüt: faturası olmayan siparişte PDF yok", why(pdf));
      });

      await part("Google Merchant API: kuyruk ve yetki", async () => {
        const g = (token, body) => rawApi("/api/admin/gmc", { ...(token ? { token } : {}), body });
        const a = await g(null, { op: "status" });
        ok(a.status === 401, "Google Merchant: girişsiz istek reddediliyor", why(a));
        const m = await g(F.member.token, { op: "status" });
        ok(m.status === 403, "Google Merchant: üye erişemiyor", why(m));
        const s = await g(F.admin.token, { op: "status" });
        ok(s.status === 200 && !/private_key|BEGIN PRIVATE/.test(s.text), "Google Merchant: yönetici durumu görüyor (anahtar dönmeden)", why(s));
        const sec = await rest("settings?select=gmc_service_account");
        ok(sec.status >= 400, "Servis hesabı anahtarı dışarıdan okunamıyor", `HTTP ${sec.status}`);
        // Tetikleyici (geri alınan işlem — gerçek kuyruğa / Google'a bir şey gitmez): açıkken stok değişimi kuyruğa girer, kapalıyken girmez
        const q = (on) => one(`BEGIN;
          UPDATE public.settings SET gmc_api_enabled = ${on} WHERE id IS NOT NULL;
          UPDATE public.product_variants SET stock = stock + 1 WHERE id = ${lit(F.var)};
          SELECT count(*) FROM public.gmc_sync_queue WHERE product_id = ${lit(F.prod)};
          ROLLBACK;`);
        ok(q(true) === "1", "API açıkken numara stoğu değişince ürün Google kuyruğuna giriyor", `kuyruk ${q(true)}`);
        ok(q(false) === "0", "API kapalıyken kuyruğa bir şey girmiyor", `kuyruk ${q(false)}`);
      });

      await part("Üye temizliği: misafir süzgeci ve silme", async () => {
        // Siparişsiz misafir (şifresiz) test hesabı
        const email = `rgt-sil-${RUN}@${DOMAIN}`;
        const c = await auth("admin/users", { method: "POST", service: true, body: { email, email_confirm: true } });
        const gid = c.json?.id;
        if (!gid) return add("fail", "Silme testi için hesap oluşturulamadı", `HTTP ${c.status}`);
        sql(`INSERT INTO public.profiles (id, email, first_name, last_name) VALUES (${lit(gid)}, ${lit(email)}, 'Regresyon', 'Sil') ON CONFLICT (id) DO NOTHING`);
        // Şifresiz = misafir (eski siteden aktarılan hesaplar gibi); GoTrue şifresiz oluştururken de bir değer yazabiliyor
        sql(`UPDATE auth.users SET encrypted_password = '' WHERE id = ${lit(gid)}`);
        const s = await rest("rpc/admin_search_members", { token: F.admin.token, method: "POST", body: { p_q: email, p_state: "guest", p_orders: "none" } });
        ok(Array.isArray(s.json) && s.json.some((r) => r.id === gid), "Misafir + siparişsiz süzgeci hesabı buluyor",
          `HTTP ${s.status}, ${Array.isArray(s.json) ? s.json.length : "?"} satır, durum: ${one(`SELECT public.member_account_state(${lit(gid)})`)}, profil: ${one(`SELECT count(*) FROM public.profiles WHERE id = ${lit(gid)}`)}`);
        const s2 = await rest("rpc/admin_search_members", { token: F.admin.token, method: "POST", body: { p_q: F.member.email, p_orders: "none" } });
        ok(Array.isArray(s2.json) && !s2.json.some((r) => r.id === F.member.id), "Siparişi olan üye “siparişi yok” süzgecine girmiyor", `HTTP ${s2.status}`);
        const md = await rest("rpc/admin_delete_members", { token: F.member.token, method: "POST", body: { p_ids: [gid] } });
        ok(md.status >= 400 && one(`SELECT count(*) FROM public.profiles WHERE id = ${lit(gid)}`) === "1", "Üye hesap silemiyor", `HTTP ${md.status}`);
        const d = await rest("rpc/admin_delete_members", { token: F.admin.token, method: "POST", body: { p_ids: [gid, F.member.id, F.admin.id] } });
        const skipped = (d.json?.skipped || []).map((x) => x.reason);
        ok(d.status === 200 && d.json?.deleted === 1 && one(`SELECT count(*) FROM auth.users WHERE id = ${lit(gid)}`) === "0" && one(`SELECT count(*) FROM public.profiles WHERE id = ${lit(gid)}`) === "0",
          "Yönetici siparişsiz misafiri siliyor (hesap + profil)", `HTTP ${d.status} ${d.text.slice(0, 120)}`);
        ok(skipped.includes("siparişi var") && skipped.includes("yönetici hesabı") && one(`SELECT count(*) FROM public.profiles WHERE id IN (${lit(F.member.id)}, ${lit(F.admin.id)})`) === "2",
          "Siparişi olan ve yönetici hesaplar silinmiyor", JSON.stringify(d.json?.skipped));
      });

      await part("Yorum isteme (bağlantıyla yorum) + seni özledik (geri dönüş algılama)", async () => {
        const r = await order([MAIN(1)]);
        const id = r.json?.orderId;
        if (!id) return add("fail", "Yorum testi için sipariş oluşturulamadı", why(r));
        const tok = randomBytes(16).toString("hex");
        sql(`UPDATE public.orders SET review_token = ${lit(tok)}, review_requested_at = now() WHERE id = ${lit(id)}`);
        const g = await rawApi(`/api/review?t=${tok}`, { method: "GET" });
        ok(g.status === 200 && Array.isArray(g.json?.questions) && !g.json?.done, "Yorum bağlantısı soruları getiriyor (giriş gerekmeden)", why(g));
        const bad = await rawApi(`/api/review?t=${"0".repeat(32)}`, { method: "GET" });
        ok(bad.status === 404, "Geçersiz yorum bağlantısı reddediliyor", why(bad));
        const fit = (g.json?.questions || []).find((q) => q.type === "choice");
        const body = { t: tok, overall: 4, answers: fit ? { [fit.key]: fit.options[0] } : {}, comment: "REGRESYON-TEST yorum", _hp: "", _t: 5000 };
        const p = await rawApi("/api/review", { body });
        const rv = row(`SELECT rating_overall, is_approved, source, jsonb_array_length(answers) AS n FROM public.order_reviews WHERE order_id = ${lit(id)}`);
        ok(p.status === 200 && rv && Number(rv.rating_overall) === 4 && rv.is_approved === false && rv.source === "email" && (!fit || Number(rv.n) >= 1),
          "Yorum kaydediliyor (genel puan + cevaplar, onay bekliyor)", `${why(p)} ${JSON.stringify(rv)}`);
        const again = await rawApi("/api/review", { body });
        ok(again.status === 200 && again.json?.already === true && num(`SELECT count(*) FROM public.order_reviews WHERE order_id = ${lit(id)}`) === 1, "Aynı bağlantıyla ikinci yorum yazılmıyor", why(again));
        // Seni özledik: uzun aradan sonra görülen üye işaretleniyor (geri alınan işlem)
        const w = one(`BEGIN;
          UPDATE public.settings SET winback = jsonb_set(winback, '{enabled}', 'true') WHERE id IS NOT NULL;
          UPDATE public.profiles SET last_active_at = now() - interval '200 days', winback_detected_at = NULL WHERE id = ${lit(F.member.id)};
          UPDATE public.profiles SET last_active_at = now() WHERE id = ${lit(F.member.id)};
          SELECT (winback_detected_at IS NOT NULL)::text FROM public.profiles WHERE id = ${lit(F.member.id)};
          ROLLBACK;`);
        ok(w === "true", "Uzun süre gelmeyip dönen üye “seni özledik” için işaretleniyor", `işaret ${w}`);
      });

      await part("Varyasyon değeri başka gruba taşınıyor (ürünler etkilenmeden)", async () => {
        const g1 = one(`INSERT INTO public.variant_groups (name) VALUES ('REGRESYON-TEST Numara') RETURNING id`);
        const g2 = one(`INSERT INTO public.variant_groups (name) VALUES ('REGRESYON-TEST İlkadım Numara') RETURNING id`);
        const opt = one(`INSERT INTO public.variant_options (group_id, value) VALUES (${lit(g1)}, '21,5') RETURNING id`);
        try {
          const mu = await rest(`variant_options?id=eq.${opt}`, { token: F.member.token, method: "PATCH", body: { group_id: g2 } });
          ok(one(`SELECT group_id FROM public.variant_options WHERE id = ${lit(opt)}`) === g1, "Üye varyasyon değerini taşıyamıyor", `HTTP ${mu.status}`);
          const ad = await rest(`variant_options?id=eq.${opt}`, { token: F.admin.token, method: "PATCH", body: { group_id: g2 } });
          ok(ad.status < 300 && one(`SELECT group_id FROM public.variant_options WHERE id = ${lit(opt)}`) === g2, "Yönetici değeri başka gruba taşıyabiliyor (aynı kimlik — ürünler bağlı kalır)", `HTTP ${ad.status}`);
        } finally {
          sql(`DELETE FROM public.variant_options WHERE id = ${lit(opt)}`);
          sql(`DELETE FROM public.variant_groups WHERE id IN (${lit(g1)}, ${lit(g2)})`);
        }
      });

      await part("Aynı barkod / SKU iki kez kaydedilemez (harf / boşluk farkı dahil)", async () => {
        // Geri alınan işlem içinde: hiçbir şey kalıcı olmaz, pazaryeri kuyruğuna da bir şey kalmaz
        const r = sql(`BEGIN;
          CREATE TEMP TABLE _bc (k text, v boolean);
          DO $bc$ DECLARE a uuid; BEGIN
            INSERT INTO public.product_variants (product_id, price, stock, is_active, barcode) VALUES (${lit(F.prod)}, 1, 0, false, 'RGT-BARKOD-1') RETURNING id INTO a;
            BEGIN
              INSERT INTO public.product_variants (product_id, price, stock, is_active, barcode) VALUES (${lit(F.prod)}, 1, 0, false, ' rgt-barkod-1 ');
              INSERT INTO _bc VALUES ('ikinci', false);
            EXCEPTION WHEN unique_violation THEN INSERT INTO _bc VALUES ('ikinci', true); END;
            UPDATE public.product_variants SET barcode = 'RGT-BARKOD-1' WHERE id = a;
            INSERT INTO _bc VALUES ('ayni_kayit', true);
            INSERT INTO public.product_variants (product_id, price, stock, is_active, barcode) VALUES (${lit(F.prod)}, 1, 0, false, 'RGT-BARKOD-2'), (${lit(F.prod)}, 1, 0, false, '  ');
            INSERT INTO _bc VALUES ('farkli_ve_bos', true);
            -- SKU: aynı kural
            UPDATE public.product_variants SET sku = 'RGT-SKU-1' WHERE id = a;
            BEGIN
              INSERT INTO public.product_variants (product_id, price, stock, is_active, sku) VALUES (${lit(F.prod)}, 1, 0, false, 'rgt-sku-1 ');
              INSERT INTO _bc VALUES ('sku_ikinci', false);
            EXCEPTION WHEN unique_violation THEN INSERT INTO _bc VALUES ('sku_ikinci', true); END;
            INSERT INTO public.product_variants (product_id, price, stock, is_active, sku) VALUES (${lit(F.prod)}, 1, 0, false, ''), (${lit(F.prod)}, 1, 0, false, NULL);
            INSERT INTO _bc VALUES ('sku_bos', true);
            -- Kural gelmeden önce oluşmuş tekrar: değiştirmeden yeniden kaydetmek de reddedilir (pasif ürün de olsa)
            ALTER TABLE public.product_variants DISABLE TRIGGER trg_variant_barcode_unique;
            INSERT INTO public.product_variants (product_id, price, stock, is_active, barcode) VALUES (${lit(F.prod)}, 1, 0, false, 'RGT-BARKOD-3') RETURNING id INTO a;
            INSERT INTO public.product_variants (product_id, price, stock, is_active, barcode) VALUES (${lit(F.prod)}, 1, 0, false, 'RGT-BARKOD-3');
            ALTER TABLE public.product_variants ENABLE TRIGGER trg_variant_barcode_unique;
            BEGIN
              UPDATE public.product_variants SET barcode = 'RGT-BARKOD-3' WHERE id = a;
              INSERT INTO _bc VALUES ('eski_tekrar', false);
            EXCEPTION WHEN unique_violation THEN INSERT INTO _bc VALUES ('eski_tekrar', true); END;
          END $bc$;
          SELECT k, v FROM _bc;
          ROLLBACK;`);
        const got = Object.fromEntries(r.map((x) => [x[0], x[1] === "t"]));
        ok(got.ikinci === true, "Aynı barkodla ikinci varyant reddediliyor (büyük / küçük harf, boşluk farkı da)", JSON.stringify(got));
        ok(got.ayni_kayit === true, "Barkodu değişmeyen varyant kaydedilebiliyor", JSON.stringify(got));
        ok(got.farkli_ve_bos === true, "Farklı barkod ve boş barkod serbest", JSON.stringify(got));
        ok(got.sku_ikinci === true, "Aynı SKU ile ikinci varyant reddediliyor (harf / boşluk farkı da)", JSON.stringify(got));
        ok(got.sku_bos === true, "Boş SKU serbest", JSON.stringify(got));
        ok(got.eski_tekrar === true, "Önceden kalmış tekrar barkod değiştirilmeden de kaydedilemiyor (pasif üründe de)", JSON.stringify(got));
        // Ürün formunun ön kontrolü: yalnız yönetici sorabilir
        const body = { p_product: null, p_barcodes: ["RGT-YOK-BARKOD"], p_skus: [] };
        const m = await rest("rpc/variant_code_conflicts", { token: F.member.token, method: "POST", body });
        ok(m.status >= 400, "Üye barkod ön kontrolünü çağıramıyor", `HTTP ${m.status}`);
        const ad = await rest("rpc/variant_code_conflicts", { token: F.admin.token, method: "POST", body });
        ok(ad.status === 200 && Array.isArray(ad.json) && ad.json.length === 0, "Yönetici barkod ön kontrolü çalışıyor", `HTTP ${ad.status}`);
      });

      await part("Üretilmeyen numara silinir (fiyat / stok listelerinden çıkar)", async () => {
        const vid = insert("product_variants", { product_id: F.prod, price: 1000, stock: 0, is_active: false });
        sql(`INSERT INTO public.item_prices (product_id, variant_id, price_list_id, amount) SELECT ${lit(F.prod)}, ${lit(vid)}, id, 900 FROM public.price_lists WHERE code = 'trendyol_sale'`);
        const mu = await rest(`product_variants?id=eq.${vid}`, { token: F.member.token, method: "DELETE" });
        ok(num(`SELECT count(*) FROM public.product_variants WHERE id = ${lit(vid)}`) === 1, "Üye numara silemiyor", `HTTP ${mu.status}`);
        const ad = await rest(`product_variants?id=eq.${vid}`, { token: F.admin.token, method: "DELETE" });
        ok(ad.status < 300 && num(`SELECT count(*) FROM public.product_variants WHERE id = ${lit(vid)}`) === 0
          && num(`SELECT count(*) FROM public.item_prices WHERE variant_id = ${lit(vid)}`) === 0,
          "Yönetici numarayı siliyor; fiyat listelerinden de çıkıyor", `HTTP ${ad.status}`);
      });

      await part("Ödeme alınmadan sevkiyat başlamıyor", async () => {
        const r = await order([MAIN(1)]);
        const id = r.json?.orderId;
        if (!id) return add("fail", "Sevkiyat testi için sipariş oluşturulamadı", why(r));
        const p = (body) => rest(`orders?id=eq.${id}`, { token: F.admin.token, method: "PATCH", body });
        for (const st of ["preparing", "shipped"]) {
          const x = await p({ shipment_status: st });
          ok(x.status >= 400 && ord(id).shipment_status === "waiting", `Ödemesi bekleyen sipariş “${st}” yapılamıyor`, `HTTP ${x.status} → ${ord(id).shipment_status}`);
        }
        const y = await p({ payment_status: "paid", status: "processing", shipment_status: "preparing" });
        ok(y.status < 300 && ord(id).shipment_status === "preparing", "Ödeme alındı + Hazırlanıyor birlikte yapılabiliyor", `HTTP ${y.status} → ${ord(id).shipment_status}`);
      });

      await part("Sipariş silme ve süresi dolan sipariş", async () => {
        if (O.del) {
          const s0 = stock();
          const d = await api("/api/admin/orders/delete", { token: F.admin.token, body: { orderId: O.del } });
          ok(d.status === 200 && !ord(O.del), "Yönetici test siparişini silebiliyor", why(d));
          ok(stock() === s0 + 1, "Silmede stok geri eklendi", `stok ${s0} → ${stock()}`);
          const used = num(`SELECT used_count FROM public.coupons WHERE code = ${lit(F.cF100)}`);
          ok(used === 0, "Silmede kupon kullanım sayısı düzeldi", `used_count ${used} (0 olmalı)`);
        } else add("fail", "Silinecek sipariş yok", "kupon bölümünde oluşturulamadı");

        if (O.expire) {
          const s0 = stock();
          sql(`UPDATE public.orders SET created_at = now() - interval '25 hours' WHERE id = ${lit(O.expire)}`);
          sql("SELECT public.expire_unpaid_orders()");
          const o = ord(O.expire);
          ok(o.status === "cancelled" && o.payment_status === "failed", "24 saatte ödenmeyen havale siparişi iptal oluyor", `${o.status}/${o.payment_status}`);
          ok(stock() === s0 + 1, "Süresi dolan siparişin stoğu geri eklendi", `stok ${s0} → ${stock()}`);
          ok(o.invoice_status === "not_required", "İptal olan siparişte fatura 'Gerekmiyor' (süre dolumuyla iptalde de)", `fatura: ${o.invoice_status}`);
        } else add("fail", "Süre dolumu denenemedi", "kupon bölümünde sipariş oluşturulamadı");
      });
    } finally {
      await part("Test verisi temizliği", async () => {
        await sleep(3000); // sipariş sonrası arka plan bildirimleri bitsin
        cleanup();
        const left = num(`SELECT (SELECT count(*) FROM auth.users WHERE email ILIKE '%@${DOMAIN}')
          + (SELECT count(*) FROM public.products WHERE title LIKE 'REGRESYON-TEST%')
          + (SELECT count(*) FROM public.coupons WHERE code LIKE 'RGT%')
          + (SELECT count(*) FROM public.affiliate_profiles WHERE code LIKE 'RGT%')
          + (SELECT count(*) FROM public.partner_opportunities WHERE title LIKE 'REGRESYON-TEST%')
          + (SELECT count(*) FROM public.shipping_methods WHERE name LIKE 'REGRESYON-TEST%')
          + (SELECT count(*) FROM public.categories WHERE slug = 'regresyon-test')`);
        ok(left === 0, "Test verisi silindi", `${left} kayıt kaldı — bir sonraki çalıştırma yeniden dener`);
      });
    }
  },
};
