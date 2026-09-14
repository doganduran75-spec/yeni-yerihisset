-- Mesajlaşma artık SİPARİŞ bağlantılı. messages'a order_id eklenir; müşteri
-- mesajları her zaman bir siparişe bağlıdır (sipariş satırındaki "Mesaj" butonu).
-- Site canlı olmadığından eski (bağsız) mesajlar temizlenir.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE;

-- Eski bağsız mesajları sil (temiz başlangıç — canlı değiliz)
DELETE FROM public.messages WHERE order_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_order ON public.messages (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_order_unread ON public.messages (order_id) WHERE is_read = false AND sender_role = 'user';
