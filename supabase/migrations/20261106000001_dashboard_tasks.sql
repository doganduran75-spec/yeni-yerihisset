-- PANO NOTLARI (2026-10-11):
-- 1) E-posta sağlığı: "e-posta atıyorum sanıyorum ama gitmiyor" durumunu yakalamak için.
--    Tüm uygulama e-postaları mail-guard'dan geçer → her gerçek gönderim (kilit / test adresi engeli
--    hariç) mail_health_record ile sonucu yazar. 15 dk'da bir sağlık cron'u SMTP girişini doğrular
--    (e-posta göndermeden). Pano › Sistem › "E-posta" kutusu buradan okur.
CREATE TABLE IF NOT EXISTS public.mail_health (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_ok_at    timestamptz,
  last_fail_at  timestamptz,
  last_error    text,
  fail_streak   int NOT NULL DEFAULT 0,      -- art arda başarısız gerçek gönderim
  verify_at     timestamptz,                 -- son SMTP bağlantı doğrulaması
  verify_ok     boolean,
  verify_error  text
);
INSERT INTO public.mail_health (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.mail_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_health FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.mail_health_record(p_ok boolean, p_error text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.mail_health (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  UPDATE public.mail_health SET
    last_ok_at   = CASE WHEN p_ok THEN now() ELSE last_ok_at END,
    last_fail_at = CASE WHEN p_ok THEN last_fail_at ELSE now() END,
    last_error   = CASE WHEN p_ok THEN last_error ELSE left(p_error, 300) END,
    fail_streak  = CASE WHEN p_ok THEN 0 ELSE fail_streak + 1 END
  WHERE id = 1;
$$;
REVOKE ALL ON FUNCTION public.mail_health_record(boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_health_record(boolean, text) TO service_role;

-- 2) Sonuçsuz aramalar: "sil" = o terimi listeden düşür (analitik geçmişi silinmez). Terim
--    silindikten SONRA yeniden aranırsa listeye geri gelir. Bot oturumlarının aramaları sayılmaz.
CREATE TABLE IF NOT EXISTS public.search_dismissals (
  term          text PRIMARY KEY,            -- küçük harf, kenar boşluksuz
  dismissed_at  timestamptz NOT NULL DEFAULT now(),
  action        text NOT NULL DEFAULT 'deleted', -- deleted · to_feedback (talebe eklendi)
  dismissed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.search_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_dismissals FROM anon;
DROP POLICY IF EXISTS search_dismissals_admin ON public.search_dismissals;
CREATE POLICY search_dismissals_admin ON public.search_dismissals FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.no_result_searches(p_days int DEFAULT 30)
RETURNS TABLE (term text, cnt bigint, last_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT x.t, count(*), max(x.created_at)
  FROM (
    SELECT lower(btrim(e.meta ->> 'term')) AS t, e.created_at
    FROM public.analytics_events e
    JOIN public.analytics_sessions s ON s.session_id = e.session_id
    WHERE e.event_type = 'search'
      AND e.meta ->> 'results_count' = '0'
      AND e.created_at >= now() - make_interval(days => GREATEST(p_days, 1))
      AND NOT s.is_bot
  ) x
  LEFT JOIN public.search_dismissals d ON d.term = x.t
  WHERE x.t <> '' AND (d.term IS NULL OR x.created_at > d.dismissed_at)
  GROUP BY x.t
  ORDER BY 2 DESC, 3 DESC
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.no_result_searches(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.no_result_searches(int) TO authenticated, service_role;

-- Yönetici "yeni ekle" ile kendi talebini girer (kaynak: admin / search)
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3) Pazaryeri stok görevleri: API entegrasyonu AÇIK kanal için manuel görev ÜRETİLMEZ (stok oraya
--    otomatik gidiyor; gönderim hatası Pano › Sistem › Entegrasyonlar'da görünür). Görev yalnız
--    entegrasyonu olmayan (integration = 'manual') aktif kanallar için. Bayrağı stok senkron
--    işleyicisi her çalışmada ayarlardan (trendyol/hepsiburada/amazon_enabled) günceller.
CREATE OR REPLACE FUNCTION public.create_stock_sync_tasks()
RETURNS trigger AS $$
DECLARE
  v_product uuid;
  v_variant uuid;
  v_barcode text;
  v_title text;
BEGIN
  IF NOT (NEW.stock = 0 AND COALESCE(OLD.stock, 0) > 0) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'product_variants' THEN
    v_variant := NEW.id;
    v_product := NEW.product_id;
    v_barcode := NEW.barcode;
    SELECT title INTO v_title FROM public.products WHERE id = NEW.product_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = NEW.id) THEN
      RETURN NEW;
    END IF;
    v_variant := NULL;
    v_product := NEW.id;
    v_barcode := NULL;
    v_title := NEW.title;
  END IF;

  INSERT INTO public.stock_sync_tasks (product_id, variant_id, channel_id, barcode, product_title, reason)
  SELECT v_product, v_variant, c.id, v_barcode, v_title, 'stock_zero'
  FROM public.marketplace_channels c
  WHERE c.is_active
    AND c.integration = 'manual'
    AND NOT EXISTS (
      SELECT 1 FROM public.stock_sync_tasks t
      WHERE t.channel_id = c.id AND t.status = 'pending'
        AND ((v_variant IS NOT NULL AND t.variant_id = v_variant)
          OR (v_variant IS NULL AND t.product_id = v_product AND t.variant_id IS NULL))
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bayrakları şimdiki ayarlardan kur + entegre kanalların bekleyen görevlerini kapat
UPDATE public.marketplace_channels c SET integration = CASE
    WHEN lower(c.name) = 'trendyol'    AND COALESCE(s.trendyol_enabled, false)    THEN 'api'
    WHEN lower(c.name) = 'hepsiburada' AND COALESCE(s.hepsiburada_enabled, false) THEN 'api'
    WHEN lower(c.name) = 'amazon'      AND COALESCE(s.amazon_enabled, false)      THEN 'api'
    ELSE 'manual' END
FROM (SELECT * FROM public.settings ORDER BY id LIMIT 1) s;

UPDATE public.stock_sync_tasks t
SET status = 'done', method = 'api', done_at = now(), note = 'Entegrasyon açık — stok otomatik gidiyor'
FROM public.marketplace_channels c
WHERE c.id = t.channel_id AND c.integration = 'api' AND t.status = 'pending';
