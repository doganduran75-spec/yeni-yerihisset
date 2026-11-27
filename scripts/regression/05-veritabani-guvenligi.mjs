// VERİTABANI GÜVENLİĞİ — her deploy'da yetki denetimi (salt okur, hiçbir şeyi değiştirmez).
// scripts/security-audit.sql'in otomatik hâli: yeni bir tablo / politika / fonksiyon eklenirken
// yanlışlıkla dışarıya açılan bir şey olursa burada yakalanır.
//   * RLS kapalı tablo → HATA (anon anahtarla herkes okur/yazar)
//   * anon'a (girişsiz ziyaretçiye) yazma izni veren politika → HATA
//   * üyenin kendi profilinde rol / doğrulama alanını değiştirebilmesi → HATA
//   * Storage'da girişsiz yükleme / silme / değiştirme → HATA; boyut sınırsız kova → uyarı
//   * anon'un çalıştırabildiği SECURITY DEFINER fonksiyon → bilinenler dışında uyarı
export default {
  name: "Veritabanı güvenliği",
  async run(t) {
    const { one, add, part, rest } = t;
    const list = (q) => { try { return JSON.parse(one(`SELECT coalesce(jsonb_agg(x), '[]') FROM (${q}) x`) || "[]"); } catch (e) { return { error: String(e.message).split("\n")[0] }; } };
    const check = (name, rows, bad, fmt, level = "fail") => {
      if (rows?.error) return add("warn", name, `kontrol edilemedi: ${rows.error}`);
      rows.length === 0 ? add("ok", name) : add(level, name, `${bad}: ${rows.map(fmt).join(", ")}`);
    };

    await part("Veritabanı güvenliği (yetki denetimi)", async () => {
      check("Tüm tablolarda satır güvenliği (RLS) açık",
        list(`SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity ORDER BY 1`),
        "RLS KAPALI (herkes okuyup yazabilir)", (r) => r.t);

      // "public" rolüne yazılmış kurallar girişsiz ziyaretçiyi de kapsar; ama içinde "yalnız yönetici" (is_admin),
      // "yalnız kendi kaydı" (auth.uid) ya da "yalnız giriş yapmış / servis" şartı varsa anon geçemez → ayıklanır.
      check("Girişsiz ziyaretçiye yazma izni veren politika yok",
        list(`SELECT tablename AS t, policyname AS p, cmd, left(coalesce(qual, '-'), 80) AS q, left(coalesce(with_check, '-'), 80) AS w
              FROM pg_policies
              WHERE schemaname = 'public' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
                AND (roles && ARRAY['anon','public']::name[])
                AND coalesce(qual, '') || ' ' || coalesce(with_check, '') !~* '(is_admin|auth\\.uid|auth\\.jwt|auth\\.role\\(\\)\\s*=\\s*''(authenticated|service_role)'')'
              ORDER BY 1, 2`),
        "anon yazabilir", (r) => `${r.t}.${r.p} (${r.cmd}; koşul: ${r.q} / ${r.w})`);

      // Herkesin (giriş yapmış her üyenin) TÜM satırları değiştirebildiği / sildiği kural
      check("Üyeye tüm kayıtları değiştirme izni veren kural yok",
        list(`SELECT tablename AS t, policyname AS p, cmd FROM pg_policies
              WHERE schemaname = 'public' AND cmd IN ('UPDATE','DELETE','ALL')
                AND btrim(coalesce(qual, 'true')) IN ('true', '(true)') ORDER BY 1, 2`),
        "herkes değiştirebilir", (r) => `${r.t}.${r.p} (${r.cmd})`);

      // Kişisel veri tutan tablolarda "herkes okur" kuralı
      const PII = ["profiles", "orders", "order_items", "order_cases", "contacts", "stock_notifications", "messages", "feedback",
        "user_coupons", "affiliate_profiles", "affiliate_conversions", "store_credit_ledger", "notification_log", "email_queue",
        "analytics_sessions", "analytics_events", "client_errors", "marketing_consent_log", "user_tags", "member_notes", "addresses"];
      check("Kişisel veri tablolarında herkese açık okuma yok",
        list(`SELECT tablename AS t, policyname AS p FROM pg_policies
              WHERE schemaname = 'public' AND cmd IN ('SELECT','ALL') AND btrim(coalesce(qual, 'true')) IN ('true', '(true)')
                AND tablename = ANY (ARRAY[${PII.map((x) => `'${x}'`).join(",")}]) ORDER BY 1, 2`),
        "herkes okuyabilir", (r) => `${r.t}.${r.p}`);

      check("Üye kendi rolünü / doğrulama durumunu değiştiremiyor",
        list(`SELECT column_name AS c FROM information_schema.column_privileges
              WHERE table_schema = 'public' AND table_name = 'profiles' AND privilege_type = 'UPDATE'
                AND grantee IN ('authenticated','anon','PUBLIC')
                AND column_name IN ('role','email_verified','email_verified_at','email_verify_token','member_level','email')`),
        "üye güncelleyebiliyor", (r) => r.c);

      check("Gizli ayarlar (SMTP, anahtarlar) dışarıya kapalı",
        list(`SELECT DISTINCT column_name AS c FROM information_schema.column_privileges
              WHERE table_schema = 'public' AND table_name = 'settings' AND privilege_type = 'SELECT'
                AND grantee IN ('anon','authenticated','PUBLIC') AND column_name ~* '(password|secret|token|api_key|apikey|private|_key$|webhook|credential|smtp_)'`), // 2026-11-27: _key / webhook (basitkargo_webhook_key, hepsiburada_service_key) da
        "okunabilir", (r) => r.c);

      check("Dosya deposunda girişsiz yükleme / silme yok",
        list(`SELECT policyname AS p, cmd FROM pg_policies
              WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
                AND (roles && ARRAY['anon','public']::name[])
                AND coalesce(qual, '') || coalesce(with_check, '') !~* 'is_admin|auth\\.uid|auth\\.role\\(\\)\\s*=\\s*''authenticated''' ORDER BY 1`),
        "girişsiz yazılabilir", (r) => `${r.p} (${r.cmd})`);

      check("Dosya kovalarında boyut sınırı var",
        list(`SELECT id FROM storage.buckets WHERE file_size_limit IS NULL ORDER BY 1`),
        "sınırsız", (r) => r.id, "warn");

      // Girişsiz çağrılabilen SECURITY DEFINER fonksiyonlar: bilinçli açık olanlar dışında uyarı.
      // Yeni bir fonksiyon bilerek herkese açıksa buraya eklenir.
      const PUBLIC_OK = new Set([
        "is_admin", "get_product_rating", "get_product_ratings", "product_review_stats", "marketplace_listing_key",
        "handle_new_user", "member_account_state",
        // Bilinçli herkese açık: ürün sayfasında "bekleyen havale var, stok dönebilir" bilgisi; yorumcu adı (maskeli)
        "product_hold_info", "review_author_names",
      ]);
      const fns = list(`SELECT DISTINCT p.proname AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
                          AND p.prorettype <> 'trigger'::regtype ORDER BY 1`);
      check("Girişsiz çağrılabilen yetkili (SECURITY DEFINER) fonksiyonlar bilinenlerden ibaret",
        fns.error ? fns : fns.filter((r) => !PUBLIC_OK.has(r.f)),
        "gözden geçir (anon çalıştırabiliyor)", (r) => r.f, "warn");

      // 2026-11-16 (MIG 20261190): SECURITY DEFINER içinde current_user HER ZAMAN fonksiyonun sahibidir (postgres) →
      // "current_user IN / NOT IN (…)" ile yapılan yetki kontrolü hiç çalışmaz (apply_price_changes böyle açıktı).
      // Güvenilen çağıran için public.trusted_db_caller() (session_user / service_role) kullanılır.
      check("Yetkili (SECURITY DEFINER) fonksiyonlarda current_user'a dayanan yetki kontrolü yok",
        list(`SELECT p.proname AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.prosecdef AND p.prosrc ~* 'current_user\\s+(not\\s+)?in\\s*\\(' ORDER BY 1`),
        "kontrol çalışmıyor (current_user = sahibi)", (r) => r.f);

      // Üyenin (giriş yapmış) çağırabildiği yetkili fonksiyonlar içeride kimlik kontrolü yapmalı (yönetici ya da kendi kaydı)
      const MEMBER_OK = new Set([...PUBLIC_OK, "my_member_status"]);
      const memFns = list(`SELECT DISTINCT p.proname AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                           WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                             AND p.prorettype <> 'trigger'::regtype
                             AND p.prosrc !~* '(is_admin\\s*\\(|auth\\.uid\\s*\\(|trusted_db_caller\\s*\\()' ORDER BY 1`);
      check("Üyenin çağırabildiği yetkili fonksiyonlar içeride kimlik kontrolü yapıyor",
        memFns.error ? memFns : memFns.filter((r) => !MEMBER_OK.has(r.f)),
        "gözden geçir (üye çalıştırabiliyor, kontrol görünmüyor)", (r) => r.f, "warn");

      // Para / indirim / fiyat / yorum onayı tutan tablolarda üyeye yazma kuralı yok (yalnız yönetici ya da sunucu).
      // İstisna: order_reviews ekleme kuralı ONAYSIZ (is_approved = false) şartıyla (Hesabım › Yorum yap).
      const MONEY = ["affiliate_profiles", "affiliate_conversions", "store_credit_ledger", "user_coupons", "coupons", "order_coupons",
        "orders", "order_items", "products", "product_variants", "item_prices", "price_lists", "order_reviews"];
      check("Para / fiyat / kupon / yorum onayı tablolarında üyeye yazma kuralı yok",
        list(`SELECT tablename AS t, policyname AS p, cmd FROM pg_policies
              WHERE schemaname = 'public' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
                AND tablename = ANY (ARRAY[${MONEY.map((x) => `'${x}'`).join(",")}])
                AND coalesce(qual, '') || ' ' || coalesce(with_check, '') !~* '(is_admin|role\\s*=\\s*''admin'')'
                AND NOT (tablename = 'order_reviews' AND cmd = 'INSERT' AND coalesce(with_check, '') ~* 'is_approved\\s*=\\s*false')
              ORDER BY 1, 2`),
        "üye yazabiliyor", (r) => `${r.t}.${r.p} (${r.cmd})`);

      // 20261107: dışarıdan çağrılabilen yetkili fonksiyonlar kapatıldı (gerçek çağrıyla dene; zararsız parametreler)
      const rpc = async (fn, body) => (await rest(`rpc/${fn}`, { method: "POST", body })).status;
      const l = await rpc("link_contacts_for_user", { p_user: "00000000-0000-0000-0000-000000000000", p_email: "rgt-yok@yerihisset.test" });
      l >= 400 ? add("ok", "Başkasının kişi kayıtları hesaba bağlanamıyor (link_contacts_for_user kapalı)")
        : add("fail", "link_contacts_for_user dışarıdan çağrılabiliyor", `HTTP ${l} — 20261107 migration'ı`);
      const r = await rpc("rollup_analytics_daily", {});
      r >= 400 ? add("ok", "Analitik özetleri dışarıdan silinemiyor") : add("fail", "rollup_analytics_daily dışarıdan çağrılabiliyor", `HTTP ${r} — 20261107 migration'ı`);
    });
  },
};
