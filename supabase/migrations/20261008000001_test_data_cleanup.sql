-- ============================================================
-- TEST VERİSİ TEMİZLİĞİ (canlıya geçiş öncesi; tekrar çalıştırılabilir)
-- ============================================================
-- Kural: "işaretsiz SİTE kaydı = test". KALANLAR:
--   * yöneticiler (profiles.role='admin') ve uye/musteri/affiliate dışında rolü olanlar
--   * WooCommerce'ten aktarılanlar (orders.import_source / profiles.import_source)
--   * pazaryeri siparişleri (channel <> 'site'), p_delete ile açıkça istenmedikçe
--   * kalan bir siparişi olan üye (sipariş üyesiz kalamaz)
--   * p_keep listesindekiler (e-posta, sipariş no "YH1234"/"1234", kupon kodu)
-- STOĞA DOKUNULMAZ: test siparişi silinirken düştüğü stok geri eklenmez
-- (stok gerçek sayım; pazaryerlerine gidiyor).
-- Ürün, fiyat, ayar, şablon, içerik, kargo, iş ortağı/fırsat içerikleri kalır.
--
-- Kullanım: scripts/cleanup-test-data.mjs (önce deneme listesi, sonra --apply).
-- Fonksiyon tek işlemdir: bir hata olursa hiçbir şey silinmez.
-- Not: Supabase (pg_safeupdate) WHERE'siz DELETE/UPDATE'i reddeder → tümünü silmede "WHERE true".

-- WooCommerce aktarım işaretleri (Faz 1 aktarımı bunları doldurur)
ALTER TABLE public.orders   ADD COLUMN IF NOT EXISTS import_source text;  -- woo_yerihisset | woo_attipas
ALTER TABLE public.orders   ADD COLUMN IF NOT EXISTS import_ref text;     -- eski sistemdeki sipariş id
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS import_source text;  -- ilk geldiği kaynak
CREATE UNIQUE INDEX IF NOT EXISTS orders_import_ref_uidx
  ON public.orders(import_source, import_ref) WHERE import_source IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cleanup_test_data(
  p_apply boolean DEFAULT false,
  p_keep text[] DEFAULT '{}',
  p_delete text[] DEFAULT '{}',
  p_analytics boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
  k text[] := ARRAY(SELECT lower(trim(x)) FROM unnest(coalesce(p_keep, '{}')) x WHERE trim(x) <> '');
  d text[] := ARRAY(SELECT lower(trim(x)) FROM unnest(coalesce(p_delete, '{}')) x WHERE trim(x) <> '');
  rep jsonb := '{}'::jsonb;
  n int;
BEGIN
  -- Sipariş no "YH1234" ya da "1234" yazılabilir
  k := k || ARRAY(SELECT substr(x, 3) FROM unnest(k) x WHERE x LIKE 'yh%');

  DROP TABLE IF EXISTS t_orders, t_users, t_coupons, t_contacts;

  -- 1) Silinecek siparişler
  CREATE TEMP TABLE t_orders ON COMMIT DROP AS
  SELECT o.id FROM public.orders o
  WHERE (o.channel = 'site' AND o.import_source IS NULL
         AND NOT (lower(coalesce(o.order_number, '')) = ANY (k)))
     OR (o.channel <> 'site'
         AND (lower(coalesce(o.external_order_number, '')) = ANY (d)
              OR lower(coalesce(o.external_package_id, '')) = ANY (d)));

  -- 2) Silinecek üyeler
  CREATE TEMP TABLE t_users ON COMMIT DROP AS
  SELECT u.id FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE coalesce(p.role, 'customer') <> 'admin'
    AND p.import_source IS NULL
    AND NOT (lower(coalesce(u.email, '')) = ANY (k))
    AND NOT (lower(coalesce(p.email, '')) = ANY (k))
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                    WHERE ur.user_id = u.id AND r.slug NOT IN ('uye', 'musteri', 'affiliate'))
    AND NOT EXISTS (SELECT 1 FROM public.orders o
                    WHERE o.user_id = u.id AND o.id NOT IN (SELECT id FROM t_orders));

  -- 3) Silinecek kuponlar (kalan bir siparişte kullanılmış olan kalır)
  CREATE TEMP TABLE t_coupons ON COMMIT DROP AS
  SELECT c.id FROM public.coupons c
  WHERE NOT (lower(c.code) = ANY (k))
    AND NOT EXISTS (SELECT 1 FROM public.orders o
                    WHERE o.coupon_id = c.id AND o.id NOT IN (SELECT id FROM t_orders));

  -- 4) CRM kişileri: silinen üyeye bağlı/aynı e-postalı olanlar + p_delete'teki e-postalar
  CREATE TEMP TABLE t_contacts ON COMMIT DROP AS
  SELECT ct.id FROM public.contacts ct
  WHERE NOT (lower(coalesce(ct.email, '')) = ANY (k))
    AND (ct.linked_user_id IN (SELECT id FROM t_users)
         OR lower(coalesce(ct.email, '')) IN (SELECT lower(email) FROM auth.users WHERE id IN (SELECT id FROM t_users))
         OR lower(coalesce(ct.email, '')) = ANY (d));

  -- ── Rapor (deneme ve uygulama için aynı) ──
  rep := jsonb_build_object(
    'orders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'no', 'YH' || o.order_number, 'channel', o.channel, 'date', o.created_at, 'status', o.status,
        'total', o.total_amount, 'email', coalesce(p.email, o.customer_name, '')) ORDER BY o.created_at), '[]')
      FROM public.orders o LEFT JOIN public.profiles p ON p.id = o.user_id
      WHERE o.id IN (SELECT id FROM t_orders)),
    'kept_orders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'no', 'YH' || o.order_number, 'channel', o.channel, 'external', coalesce(o.external_order_number, ''),
        'date', o.created_at, 'status', o.status, 'total', o.total_amount,
        'reason', CASE WHEN o.import_source IS NOT NULL THEN 'woocommerce' WHEN o.channel <> 'site' THEN 'pazaryeri' ELSE 'kalsın listesi' END)
        ORDER BY o.created_at), '[]')
      FROM public.orders o WHERE o.id NOT IN (SELECT id FROM t_orders)),
    'users', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'email', u.email, 'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
        'created', u.created_at, 'orders', (SELECT count(*) FROM public.orders o WHERE o.user_id = u.id),
        'affiliate', EXISTS (SELECT 1 FROM public.affiliate_profiles a WHERE a.user_id = u.id)) ORDER BY u.created_at), '[]')
      FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
      WHERE u.id IN (SELECT id FROM t_users)),
    'kept_users', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'email', u.email, 'reason', CASE WHEN p.role = 'admin' THEN 'yönetici' WHEN p.import_source IS NOT NULL THEN 'woocommerce'
                                          WHEN lower(coalesce(u.email, '')) = ANY (k) THEN 'kalsın listesi' ELSE 'rol / kalan sipariş' END)
        ORDER BY u.created_at), '[]')
      FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
      WHERE u.id NOT IN (SELECT id FROM t_users) AND p.import_source IS NULL),
    'kept_users_imported', (SELECT count(*) FROM public.profiles WHERE import_source IS NOT NULL),
    'coupons', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'code', c.code, 'name', c.name, 'used', c.used_count, 'active', c.is_active, 'personal', c.is_personal) ORDER BY c.created_at), '[]')
      FROM public.coupons c WHERE c.id IN (SELECT id FROM t_coupons)),
    'kept_coupons', (SELECT coalesce(jsonb_agg(c.code ORDER BY c.code), '[]')
      FROM public.coupons c WHERE c.id NOT IN (SELECT id FROM t_coupons)),
    'contacts', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', ct.full_name, 'email', ct.email, 'source', ct.source_channel)), '[]')
      FROM public.contacts ct WHERE ct.id IN (SELECT id FROM t_contacts)),
    'kept_contacts', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', ct.full_name, 'email', ct.email, 'source', ct.source_channel)), '[]')
      FROM public.contacts ct WHERE ct.id NOT IN (SELECT id FROM t_contacts)),
    'counts', jsonb_build_object(
      'stock_notifications', (SELECT count(*) FROM public.stock_notifications sn
                              WHERE NOT (lower(coalesce(sn.email, '')) = ANY (k))
                                AND (sn.user_id IS NULL OR sn.user_id NOT IN (SELECT id FROM public.profiles WHERE import_source IS NOT NULL))),
      'feedback', (SELECT count(*) FROM public.feedback f WHERE NOT (lower(coalesce(f.email, '')) = ANY (k))),
      'messages', (SELECT count(*) FROM public.messages m WHERE m.user_id IN (SELECT id FROM t_users) OR m.order_id IN (SELECT id FROM t_orders)),
      'affiliates', (SELECT count(*) FROM public.affiliate_profiles a WHERE a.user_id IN (SELECT id FROM t_users)),
      'affiliate_clicks', (SELECT count(*) FROM public.affiliate_clicks),
      'affiliate_payout_runs', (SELECT count(*) FROM public.affiliate_payout_runs),
      'store_credit_ledger', (SELECT count(*) FROM public.store_credit_ledger),
      'email_queue', (SELECT count(*) FROM public.email_queue),
      'email_campaign_sends', (SELECT count(*) FROM public.email_campaign_sends),
      'popup_impressions', (SELECT count(*) FROM public.popup_impressions),
      'opportunity_clicks', (SELECT count(*) FROM public.opportunity_clicks),
      'analytics_events', CASE WHEN p_analytics THEN (SELECT count(*) FROM public.analytics_events) ELSE NULL END,
      'analytics_sessions', CASE WHEN p_analytics THEN (SELECT count(*) FROM public.analytics_sessions) ELSE NULL END
    )
  );

  IF NOT p_apply THEN
    RETURN rep || jsonb_build_object('applied', false);
  END IF;

  -- ── Uygulama (sıra önemli: sipariş → kupon → üye) ──
  DELETE FROM public.messages WHERE user_id IN (SELECT id FROM t_users) OR order_id IN (SELECT id FROM t_orders);
  DELETE FROM public.orders WHERE id IN (SELECT id FROM t_orders);           -- satırlar, olaylar, yorumlar, komisyonlar CASCADE
  DELETE FROM public.coupons WHERE id IN (SELECT id FROM t_coupons);         -- user_coupons CASCADE
  DELETE FROM public.contacts WHERE id IN (SELECT id FROM t_contacts);
  DELETE FROM public.stock_notifications sn
   WHERE NOT (lower(coalesce(sn.email, '')) = ANY (k))
     AND (sn.user_id IS NULL OR sn.user_id NOT IN (SELECT id FROM public.profiles WHERE import_source IS NOT NULL));
  DELETE FROM public.feedback f WHERE NOT (lower(coalesce(f.email, '')) = ANY (k));
  DELETE FROM public.store_credit_ledger WHERE true;
  DELETE FROM public.affiliate_payout_runs WHERE true;
  DELETE FROM public.affiliate_clicks WHERE true;
  DELETE FROM public.email_queue WHERE true;
  DELETE FROM public.email_campaign_sends WHERE true;
  DELETE FROM public.popup_impressions WHERE true;
  DELETE FROM public.opportunity_clicks WHERE true;
  -- Profil + adresler AÇIKÇA (bağlantı düşmüş olsa bile sahipsiz kalmasın; bkz. 20261014000001)
  DELETE FROM public.user_addresses WHERE user_id IN (SELECT id FROM t_users);
  DELETE FROM public.profiles WHERE id IN (SELECT id FROM t_users);          -- rol, etiket, affiliate… CASCADE
  DELETE FROM auth.users WHERE id IN (SELECT id FROM t_users);
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Kalanların sayaçlarını gerçeğe çek
  UPDATE public.affiliate_profiles SET credit_balance = 0 WHERE credit_balance <> 0;
  UPDATE public.coupons c SET used_count = (SELECT count(*) FROM public.orders o WHERE o.coupon_id = c.id AND o.status <> 'cancelled') WHERE true;

  IF p_analytics THEN
    DELETE FROM public.analytics_events WHERE true;
    DELETE FROM public.analytics_sessions WHERE true;
    DELETE FROM public.analytics_daily WHERE true;
  END IF;

  RETURN rep || jsonb_build_object('applied', true, 'deleted_users', n);
END $$;

REVOKE ALL ON FUNCTION public.cleanup_test_data(boolean, text[], text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_test_data(boolean, text[], text[], boolean) TO service_role;
