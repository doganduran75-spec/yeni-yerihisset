-- ============================================================
-- FORM SPAM KORUMASI — engellenen bot denemeleri (src/lib/bot-guard.ts)
-- ============================================================
-- Herkese açık formlarda (bülten, stok bildirimi, geri bildirim, kayıt, şifre sıfırlama,
-- fırsat kodu, misafir sipariş) bal küpü / süre / anlamsız metin kontrolüne takılan istekler.
-- IP ham tutulmaz (günlük tuzlu özet). 30 günden eskiler cron'da silinir.
-- Sunucu Sağlığı kartı "son 24 saatte N bot denemesi engellendi" gösterir.

CREATE TABLE IF NOT EXISTS public.bot_blocks (
  id         bigserial PRIMARY KEY,
  endpoint   text NOT NULL,
  reason     text NOT NULL,
  ip_hash    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bot_blocks_created ON public.bot_blocks(created_at DESC);
ALTER TABLE public.bot_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bot_blocks FROM anon, authenticated;
GRANT ALL ON public.bot_blocks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bot_blocks_id_seq TO service_role;

SELECT 'bot_blocks hazır' AS durum;
