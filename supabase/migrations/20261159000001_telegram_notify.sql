-- TELEGRAM BİLDİRİMLERİ (kullanıcı isteği 2026-11-01). src/lib/telegram.ts
-- Konu bazlı (parametrik): şimdilik yalnız "Yeni sipariş" — sipariş no, müşteri, ürünler, stok kaçtan kaça düştü,
-- siparişten sonra hangi entegrasyonlar (Trendyol / Hepsiburada / Amazon / Google) güncellendi.
-- Diğer konular (yeni talep, sunucu uyarısı, entegrasyon hatası, günlük özet) aynı kuyrukla eklenecek.
-- Bot token gizli: settings'in yeni kolonları anon / üyeye açılmaz (tablo SELECT'i 20260926'da kaldırıldı,
-- yalnız tek tek GRANT edilen kolonlar okunur) — panel /api/admin/telegram üzerinden yönetir, token hiç geri dönmez.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_bot_token text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_topics jsonb NOT NULL DEFAULT '{"new_order": true}'::jsonb;

-- Gönderim kuyruğu: konu + kayıt başına bir mesaj. Yeni siparişte önce mesaj gider, entegrasyonlar
-- tamamlanınca (en çok ~10 dk) aynı mesaj güncellenir (message_id).
CREATE TABLE IF NOT EXISTS public.telegram_outbox (
  id          bigserial PRIMARY KEY,
  topic       text NOT NULL,                       -- new_order | …
  ref_id      uuid,                                -- sipariş vb. (FK yok: silinen kayıt atlanır)
  status      text NOT NULL DEFAULT 'pending',     -- pending | sending | sent | done | skipped | failed
  message_id  bigint,
  text        text,
  attempts    int NOT NULL DEFAULT 0,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  locked_at   timestamptz,
  sent_at     timestamptz,
  done_at     timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_outbox_topic_ref_uq ON public.telegram_outbox (topic, ref_id);
CREATE INDEX IF NOT EXISTS telegram_outbox_status_idx ON public.telegram_outbox (status, created_at);
ALTER TABLE public.telegram_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_outbox FROM anon, authenticated;
GRANT ALL ON public.telegram_outbox TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.telegram_outbox_id_seq TO service_role;

-- Yeni sipariş → kuyruk. Her kanal (site / Trendyol / Hepsiburada / Amazon) aynı yoldan:
--   * eski siteden aktarılan (import_source) sipariş bildirilmez;
--   * site kart siparişi ödeme gelince (ödemesiz kart denemesi bildirilmez); havale sipariş verilince.
CREATE OR REPLACE FUNCTION public.telegram_enqueue_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.import_source IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.channel, 'site') <> 'site' OR NEW.payment_method = 'bank_transfer' OR NEW.payment_status = 'paid' THEN
      INSERT INTO telegram_outbox (topic, ref_id) VALUES ('new_order', NEW.id) ON CONFLICT DO NOTHING;
    END IF;
  ELSIF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid'
        AND coalesce(NEW.channel, 'site') = 'site' AND coalesce(NEW.payment_method, '') <> 'bank_transfer' THEN
    INSERT INTO telegram_outbox (topic, ref_id) VALUES ('new_order', NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.telegram_enqueue_order() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_telegram_new_order ON public.orders;
CREATE TRIGGER trg_telegram_new_order AFTER INSERT OR UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.telegram_enqueue_order();

NOTIFY pgrst, 'reload schema';
