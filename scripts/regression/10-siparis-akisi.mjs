// FONKSİYONEL SENARYOLAR — SİPARİŞ AKIŞI (havale). Gerçek uçlarla, gerçek veritabanında uçtan uca:
// fiyat doğrulama, stok düşümü/iadesi, kargo, kuponların TÜM kuralları, hediye, misafir siparişi,
// yetki, ödeme onayı → Müşteri rolü, ücret iadesi, iptal, kargo → teslim → iade al, satış ortaklığı,
// stok bildirimi, silme, süresi dolan sipariş.
//
// Test verisi: kategori "regresyon-test", pasif ürünler "REGRESYON-TEST …" (mağazada görünmez,
// SKU/barkod yok → pazaryerine gitmez), kuponlar "RGT…", üyeler "rgt-…@yerihisset.test"
// (bu adreslere e-posta asla gitmez, yöneticiye "yeni sipariş" bildirimi düşmez).
// Başta önceki çalıştırmadan kalan, sonda bu çalıştırmanın verisi silinir.
import { randomBytes } from "node:crypto";

const DOMAIN = "yerihisset.test";

export default {
  name: "Sipariş akışı",
  async run(t) {
    const { sql, one, num, lit, add, part, api, rest, auth, sleep } = t;
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
        DO $$ BEGIN
          IF to_regclass('public.contacts') IS NOT NULL THEN DELETE FROM public.contacts WHERE email ILIKE '%@${DOMAIN}'; END IF;
        END $$;
        DELETE FROM public.profiles WHERE email ILIKE '%@${DOMAIN}';
        DELETE FROM auth.users WHERE email ILIKE '%@${DOMAIN}';
        DELETE FROM public.affiliate_profiles WHERE code LIKE 'RGT%';
        DELETE FROM public.stock_notifications WHERE product_id IN (${prods}) OR email ILIKE '%@${DOMAIN}';
        DELETE FROM public.free_gift_rules WHERE name LIKE 'REGRESYON-TEST%';
        DELETE FROM public.products WHERE title LIKE 'REGRESYON-TEST%';
        DELETE FROM public.categories WHERE slug = 'regresyon-test';
        DELETE FROM public.coupons WHERE code LIKE 'RGT%';
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
      F.ship = row("SELECT fee, free_over FROM public.shipping_methods WHERE is_active ORDER BY sort_order LIMIT 1");
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

        // Kısmi ücret iadesi: onaysız reddedilir, onaylı kaydedilir
        const r1 = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "refund", orderId: O.paid, amount: 100, method: "bank_transfer" } });
        ok(r1.status === 400, "Onay kutusu işaretlenmeden iade kaydedilmiyor", why(r1));
        const r2 = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "refund", orderId: O.paid, amount: 100, method: "bank_transfer", confirmed: true, note: "regresyon" } });
        const o2 = ord(O.paid);
        ok(r2.status === 200 && o2.payment_status === "partial_refund" && eq(o2.refunded_amount, 100), "Kısmi ücret iadesi", `${why(r2)} → ${o2.payment_status}, iade ${o2.refunded_amount}`);

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
        const rr = await api("/api/admin/orders/action", {
          token: F.admin.token,
          body: { action: "return", orderId: O.ret, items: [{ item_id: item?.id, qty: 1, restock: true }], note: "regresyon", refund: { amount: 1000, method: "bank_transfer" }, confirmed: true },
        });
        const o = ord(O.ret);
        ok(rr.status === 200 && o.shipment_status === "returned", "İade al → kargo durumu 'İade geldi'", `${why(rr)} → ${o.shipment_status}`);
        ok(stock() === s0 + 1, "İade gelen sağlam ürün stoğa eklendi", `stok ${s0} → ${stock()}`);
        const wantPay = total > 1000 ? "partial_refund" : "refunded";
        ok(eq(o.refunded_amount, 1000) && o.payment_status === wantPay, "İadeyle birlikte ücret iadesi kaydedildi", `iade ${o.refunded_amount}, ödeme ${o.payment_status} (beklenen 1000 / ${wantPay})`);
        const ri = row(`SELECT restocked_qty FROM public.order_items WHERE id = ${lit(item?.id)}`);
        ok(ri && Number(ri.restocked_qty) === 1, "Kalemde stoğa eklenen adet işlendi", JSON.stringify(ri));
        const twice = await api("/api/admin/orders/action", { token: F.admin.token, body: { action: "return", orderId: O.ret, items: [{ item_id: item?.id, qty: 1, restock: true }] } });
        ok(stock() === s0 + 1, "Aynı ürün iki kez stoğa eklenmiyor", `${why(twice)}; stok ${s0 + 1} → ${stock()}`);
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
          + (SELECT count(*) FROM public.categories WHERE slug = 'regresyon-test')`);
        ok(left === 0, "Test verisi silindi", `${left} kayıt kaldı — bir sonraki çalıştırma yeniden dener`);
      });
    }
  },
};
