-- İPTAL EDİLEN SİPARİŞTE FATURA "GEREKMİYOR" (kullanıcı isteği 2026-10-20). Panelden "İptal et" bunu zaten yapıyordu
-- (cancel_order, 20261020); ama süresi dolan havale siparişi, başarısız kart ödemesi, pazaryerinden gelen iptal gibi
-- diğer yollar faturayı "Bekleniyor"da bırakıyordu. Artık hangi yoldan olursa olsun iptal anında:
--   fatura bekleniyor (pending) → gerekmiyor (not_required). Kesilmiş fatura (invoiced) değişmez (iade faturası gerekir).
-- Sipariş yeniden açılırsa (iptalden çıkarsa) "gerekmiyor" → yeniden "bekleniyor".

CREATE OR REPLACE FUNCTION public.order_cancel_invoice_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND coalesce(NEW.invoice_status, 'pending') = 'pending' THEN
    NEW.invoice_status := 'not_required';
  ELSIF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled'
     AND NEW.invoice_status = 'not_required' AND OLD.invoice_status = 'not_required' THEN
    NEW.invoice_status := 'pending';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_order_cancel_invoice_status ON public.orders;
CREATE TRIGGER trg_order_cancel_invoice_status
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_cancel_invoice_status();

REVOKE ALL ON FUNCTION public.order_cancel_invoice_status() FROM PUBLIC, anon, authenticated;

-- Eski kayıtlar: iptal edilmiş ama faturası "bekleniyor" kalmış siparişler
UPDATE public.orders SET invoice_status = 'not_required'
 WHERE status = 'cancelled' AND coalesce(invoice_status, 'pending') = 'pending';
