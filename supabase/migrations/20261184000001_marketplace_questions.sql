-- PAZARYERİ MÜŞTERİ SORULARI (kullanıcı 2026-11-14): Trendyol'daki ürün soruları tek noktada (Mesajlar › Trendyol
-- soruları); cevap panelden Trendyol'a gider. Trendyol bildirim göndermez → 5 dk'da bir çekilir (src/lib/marketplace/
-- trendyol-qna.ts, cron/marketplace-sync). Hepsiburada ("Satıcıya Sor") belge teyit edilince aynı tabloya eklenecek.
-- Durumlar (Trendyol): WAITING_FOR_ANSWER (cevap bekliyor) · WAITING_FOR_APPROVE (cevap Trendyol onayında) · ANSWERED ·
-- REPORTED · REJECTED · UNANSWERED (süresi doldu / cevaplanamaz).
CREATE TABLE IF NOT EXISTS public.marketplace_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel         text NOT NULL CHECK (channel IN ('trendyol', 'hepsiburada')),
  external_id     text NOT NULL,
  status          text NOT NULL,
  question        text NOT NULL,
  user_name       text,                 -- müşteri adını göstermeyi seçmediyse boş
  product_name    text,
  product_url     text,
  image_url       text,
  product_main_id text,                 -- Trendyol model kodu → products.model_code eşleşmesi
  product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,
  asked_at        timestamptz,
  answer          text,
  answered_at     timestamptz,
  answered_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reject_reason   text,                 -- Trendyol cevabı reddettiyse nedeni
  error           text,                 -- gönderim hatası (panelde gösterilir)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_mq_status ON public.marketplace_questions (status, asked_at DESC);
ALTER TABLE public.marketplace_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_questions FROM anon;
DROP POLICY IF EXISTS marketplace_questions_admin_read ON public.marketplace_questions;
CREATE POLICY marketplace_questions_admin_read ON public.marketplace_questions FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.marketplace_questions TO authenticated;

-- Yeni (cevap bekleyen) soru → Telegram "Müşteri mesajı" konusu (src/lib/telegram.ts › composeRefMessage)
DROP TRIGGER IF EXISTS trg_telegram_marketplace_question ON public.marketplace_questions;
CREATE TRIGGER trg_telegram_marketplace_question AFTER INSERT ON public.marketplace_questions
  FOR EACH ROW WHEN (NEW.status = 'WAITING_FOR_ANSWER') EXECUTE FUNCTION public.telegram_enqueue_ref('customer_message');

NOTIFY pgrst, 'reload schema';
