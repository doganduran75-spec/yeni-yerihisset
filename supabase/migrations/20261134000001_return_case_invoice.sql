-- İADE TALEBİNDE FATURA (kullanıcı kararları 2026-10-20):
--   * Siparişin TAMAMI iade ediliyorsa (ücretli bütün kalemler talepte) ve fatura "Bekleniyor"daysa → "Gerekmiyor".
--     Kısmi iadede fatura "Bekleniyor"da kalır (kalan ürün için kesilir); kesilmiş faturaya dokunulmaz;
--     değişimde değişmez (fatura son numarayla kesilir).
--   * Talep iade gelmeden kapanırsa (müşteri vazgeçti) yalnız bu kuralın değiştirdiği fatura "Bekleniyor"a döner.
--   * İade gelince (received) "Gerekmiyor" kalır.
-- Talep hangi yoldan açılırsa açılsın (yönetici "İade gelecek" / müşterinin bağlantısı) aynı kural.

ALTER TABLE public.order_cases ADD COLUMN IF NOT EXISTS invoice_auto boolean NOT NULL DEFAULT false;

-- Talep, siparişin ücretli ve henüz iade gelmemiş bütün kalemlerini kapsıyor mu
CREATE OR REPLACE FUNCTION public.order_case_is_full_return(p_order uuid, p_items jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = p_order AND coalesce(i.unit_price, 0) > 0
                   AND coalesce(i.returned_qty, 0) < i.quantity)
     AND NOT EXISTS (
       SELECT 1 FROM public.order_items i
        WHERE i.order_id = p_order AND coalesce(i.unit_price, 0) > 0 AND coalesce(i.returned_qty, 0) < i.quantity
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x WHERE x->>'order_item_id' = i.id::text));
$$;

CREATE OR REPLACE FUNCTION public.order_case_invoice_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind = 'return' AND NEW.closed_at IS NULL AND public.order_case_is_full_return(NEW.order_id, NEW.items) THEN
      UPDATE public.orders SET invoice_status = 'not_required'
       WHERE id = NEW.order_id AND coalesce(invoice_status, 'pending') = 'pending';
      IF FOUND THEN NEW.invoice_auto := true; END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- Kapanış: iade gelmeden kapandıysa (vazgeçildi) kuralın değiştirdiği faturayı geri al
  IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL AND OLD.invoice_auto AND NEW.status <> 'received' THEN
    UPDATE public.orders SET invoice_status = 'pending'
     WHERE id = NEW.order_id AND invoice_status = 'not_required';
    NEW.invoice_auto := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_order_case_invoice_rule ON public.order_cases;
CREATE TRIGGER trg_order_case_invoice_rule
  BEFORE INSERT OR UPDATE OF closed_at ON public.order_cases
  FOR EACH ROW EXECUTE FUNCTION public.order_case_invoice_rule();

REVOKE ALL ON FUNCTION public.order_case_is_full_return(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_case_invoice_rule() FROM PUBLIC, anon, authenticated;

-- Bugün açık olan tam iade talepleri (ör. "İade gelecek" ile açılanlar): bir kerelik aynı kural
WITH t AS (
  SELECT c.id, c.order_id FROM public.order_cases c
    JOIN public.orders o ON o.id = c.order_id
   WHERE c.kind = 'return' AND c.closed_at IS NULL AND coalesce(o.invoice_status, 'pending') = 'pending'
     AND public.order_case_is_full_return(c.order_id, c.items)
), u AS (
  UPDATE public.orders o SET invoice_status = 'not_required' FROM t WHERE o.id = t.order_id RETURNING o.id
)
UPDATE public.order_cases c SET invoice_auto = true FROM t WHERE c.id = t.id AND t.order_id IN (SELECT id FROM u);
