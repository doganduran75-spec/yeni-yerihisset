-- Pazaryeri stok senkron GÖREVLERİ (v1: manuel iş takibi).
-- Website stoku 0'a düşünce her AKTİF kanal için "stoğu 0 yap/kapat" görevi
-- üretilir; admin manuel işaretler. İleride bir processor aynı tabloyu API ile
-- çözecek (başarısızsa görev manuel listede kalır). Tasarım tam entegrasyona göre.

-- 1) Kanallar (Trendyol/Hepsiburada/Amazon/Ozon). manage_url = yönetim paneli kısayolu.
CREATE TABLE IF NOT EXISTS public.marketplace_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  manage_url text,
  is_active boolean NOT NULL DEFAULT true,
  integration text NOT NULL DEFAULT 'manual', -- 'manual' | 'api'
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.marketplace_channels (name, sort_order)
SELECT x.name, x.ord FROM (VALUES
  ('Trendyol', 1), ('Hepsiburada', 2), ('Amazon', 3), ('Ozon', 4)
) AS x(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_channels m WHERE m.name = x.name);

-- 2) Görevler
CREATE TABLE IF NOT EXISTS public.stock_sync_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.marketplace_channels(id) ON DELETE CASCADE,
  barcode text,
  product_title text,
  target_stock int NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'stock_zero',
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'done' | 'skipped'
  method text,                             -- done olunca: 'manual' | 'api'
  done_at timestamptz,
  done_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_sync_tasks_status ON public.stock_sync_tasks(status, created_at DESC);
-- Aynı (birim, kanal) için birden fazla AÇIK görev olmasın
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_task_open_variant
  ON public.stock_sync_tasks(variant_id, channel_id) WHERE status = 'pending' AND variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_task_open_product
  ON public.stock_sync_tasks(product_id, channel_id) WHERE status = 'pending' AND variant_id IS NULL;

-- 3) Stok 0'a İLK geçişte görev üret (varyant + varyantsız ürün için ayrı tetik).
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
    -- products: yalnızca varyantı OLMAYAN ürünlerde (varyantlılar varyant düzeyinde izlenir)
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
    AND NOT EXISTS (
      SELECT 1 FROM public.stock_sync_tasks t
      WHERE t.channel_id = c.id AND t.status = 'pending'
        AND ((v_variant IS NOT NULL AND t.variant_id = v_variant)
          OR (v_variant IS NULL AND t.product_id = v_product AND t.variant_id IS NULL))
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_sync_variants ON public.product_variants;
CREATE TRIGGER trg_stock_sync_variants AFTER UPDATE OF stock ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.create_stock_sync_tasks();

DROP TRIGGER IF EXISTS trg_stock_sync_products ON public.products;
CREATE TRIGGER trg_stock_sync_products AFTER UPDATE OF stock ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.create_stock_sync_tasks();
