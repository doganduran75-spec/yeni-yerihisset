-- TELEGRAM: diğer konular (kullanıcı isteği 2026-11-01). src/lib/telegram.ts
--   stock_request       yeni stok talebi ("stoğa gelince haber ver"; yöneticinin elle eklediği hariç)
--   after_sale_request  müşterinin iade / değişim talebi (order_cases)
--   customer_message    müşterinin sipariş mesajı (messages, sender_role = 'user')
--   integration_error   Paraşüt / pazaryeri fatura / Trendyol işleme al / Kargonomi / pazaryeri stok / Google hataları
--   server_alert        sunucu sağlığı uyarısı (e-postayla aynı an)
--   daily_summary       her sabah (saat ayarlanır) dünkü satış + bekleyen işler
-- Tekrarsızlık: hata bildirimleri dedupe_key ile bir kez; dönemsel işlerin imleci telegram_state'te.
ALTER TABLE public.telegram_outbox ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_outbox_dedupe_uq ON public.telegram_outbox (dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_state (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_state FROM anon, authenticated;
GRANT ALL ON public.telegram_state TO service_role;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_daily_hour int NOT NULL DEFAULT 9 CHECK (telegram_daily_hour BETWEEN 0 AND 23);

-- Kayıt → kuyruk (konu TG_ARGV[0]). TG_ARGV[1] = 'skip_admin' → yöneticinin elle eklediği bildirilmez.
CREATE OR REPLACE FUNCTION public.telegram_enqueue_ref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_NARGS > 1 AND TG_ARGV[1] = 'skip_admin' AND public.is_admin() THEN RETURN NEW; END IF;
  INSERT INTO telegram_outbox (topic, ref_id) VALUES (TG_ARGV[0], NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.telegram_enqueue_ref() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_telegram_stock_request ON public.stock_notifications;
CREATE TRIGGER trg_telegram_stock_request AFTER INSERT ON public.stock_notifications
  FOR EACH ROW EXECUTE FUNCTION public.telegram_enqueue_ref('stock_request', 'skip_admin');

DROP TRIGGER IF EXISTS trg_telegram_after_sale ON public.order_cases;
CREATE TRIGGER trg_telegram_after_sale AFTER INSERT ON public.order_cases
  FOR EACH ROW EXECUTE FUNCTION public.telegram_enqueue_ref('after_sale_request', 'skip_admin');

DROP TRIGGER IF EXISTS trg_telegram_customer_message ON public.messages;
CREATE TRIGGER trg_telegram_customer_message AFTER INSERT ON public.messages
  FOR EACH ROW WHEN (NEW.sender_role = 'user') EXECUTE FUNCTION public.telegram_enqueue_ref('customer_message');

NOTIFY pgrst, 'reload schema';
