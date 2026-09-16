-- Faz 1: Satış ortaklığı → "YeriHisset Kredisi" (mağaza kredisi) altyapısı.
-- Komisyon artık sipariş anında değil, aylık hakediş raporuyla hesaplanır:
-- geçen ay içinde ödeme+sevkiyat+fatura TAMAMLANAN, iade edilmemiş, atıflı
-- (link veya affiliate'e ait kupon) siparişlerden. Kazanç, affiliate'in tek
-- cüzdan bakiyesine eklenir; sitede indirim olarak harcanır (Faz 2).

-- 1) Sipariş tamamlanma damgası (3 durum ilk kez tamamlandığında) + dönem bağı
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_run_id uuid;

CREATE OR REPLACE FUNCTION public.stamp_order_completed_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.completed_at IS NULL
     AND NEW.payment_status = 'paid'
     AND NEW.shipment_status = 'delivered'
     AND NEW.invoice_status = 'invoiced' THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stamp_order_completed_at ON public.orders;
CREATE TRIGGER trg_stamp_order_completed_at
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_order_completed_at();

-- Mevcut tamamlanmış siparişleri geriye dönük damgala (staging testi için)
UPDATE public.orders
SET completed_at = COALESCE(updated_at, created_at)
WHERE completed_at IS NULL
  AND payment_status = 'paid'
  AND shipment_status = 'delivered'
  AND invoice_status = 'invoiced';

-- 2) Kuponu affiliate'e bağla (kod ile atıf → komisyon aynı affiliate'e)
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.affiliate_profiles(id) ON DELETE SET NULL;

-- 3) Affiliate cüzdan bakiyesi (tek rakam, harcanabilir)
ALTER TABLE public.affiliate_profiles ADD COLUMN IF NOT EXISTS credit_balance numeric(12,2) NOT NULL DEFAULT 0;

-- 4) Konversiyon: dönem çalıştırma bağı + sipariş başına tek kayıt (çift sayım guard)
ALTER TABLE public.affiliate_conversions ADD COLUMN IF NOT EXISTS run_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_conversions_order ON public.affiliate_conversions(order_id);

-- 5) Hakediş dönem çalıştırmaları
CREATE TABLE IF NOT EXISTS public.affiliate_payout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,                    -- 'YYYY-MM'
  status text NOT NULL DEFAULT 'posted',
  order_count integer NOT NULL DEFAULT 0,
  total_commission numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6) Cüzdan hareket defteri (şeffaflık: +dönem kazancı / -sepet harcaması[Faz 2])
CREATE TABLE IF NOT EXISTS public.store_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type text NOT NULL,                      -- 'earning' | 'spend'
  amount numeric(12,2) NOT NULL,           -- +kazanç / -harcama
  balance_after numeric(12,2),
  period text,                             -- earning için 'YYYY-MM'
  run_id uuid REFERENCES public.affiliate_payout_runs(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_credit_ledger_affiliate ON public.store_credit_ledger(affiliate_id);
