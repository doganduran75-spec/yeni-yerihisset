-- ─────────────────────────────────────────────────────────────────────────────
-- F5: Sipariş yaşam döngüsü / süreç takibi
--
-- order_events: siparişin kapanana kadarki tüm adımları (kargo, kargo no yanlış,
-- değişim, yeni kargo, iade bekleniyor, iade geldi, düzeltme, fatura, kapanış,
-- iade yöntemi, serbest not) zaman çizelgesi olarak tutar.
--
-- orders.is_closed / closed_at: süreç tamamen bitince (fatura kesilip kapatılınca)
-- işaretlenir → Dashboard "tamamlanmamış siparişler" bunu kullanır.
-- orders.refund_method: iade geldiğinde ücret iadesinin nasıl yapıldığı.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  type          text NOT NULL,   -- shipped|tracking_wrong|exchange|reshipped|return_expected|return_received|corrected|invoiced|closed|refund|note
  note          text,
  tracking_code text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_events_order_idx ON public.order_events (order_id, created_at);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manage order_events" ON public.order_events;
CREATE POLICY "admin manage order_events"
  ON public.order_events FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_closed     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS refund_method text;

CREATE INDEX IF NOT EXISTS orders_open_idx ON public.orders (is_closed, created_at DESC) WHERE is_closed = false;
