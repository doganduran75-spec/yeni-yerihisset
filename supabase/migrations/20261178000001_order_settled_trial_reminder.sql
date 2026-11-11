-- SATIŞ KESİNLEŞTİ (süreç kapandı) + DENEME HATIRLATMASI (kullanıcı kararları 2026-11-11)
--
-- A) Satış ortaklığı hakedişi "süreç kapanınca" doğar. Eskiden completed_at = ödendi + teslim + faturalandı idi; fatura
--    müşteri "oldu" deyince kesildiği için bugün denk geliyordu, ama fatura sevkiyatta kesilirse (yakında) komisyon müşteri
--    daha denerken doğardı. Site siparişinde artık ayrıca: müşteri "oldu" dedi / yönetici "Oldu say" / değişim ya da iade
--    talebi sonuçlandı / 14 gün cevapsız geçti — VE açık değişim / iade talebi yok. Pazaryeri ve deneme akışı olmayan
--    (eski / aktarılmış) siparişler eskisi gibi. Hakediş sonrası iade komisyona dokunmaz.
-- B) Teslimden 4 gün sonra, hâlâ cevap vermemiş müşteriye tek hatırlatma: "oldu mu?" (orders.trial_reminded_at).

-- 1) Kural (tek yer): sipariş kesinleşti mi?
CREATE OR REPLACE FUNCTION public.order_is_settled(p_id uuid, p_channel text, p_fit text, p_delivered timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(p_channel, 'site') <> 'site'
      OR (NOT EXISTS (SELECT 1 FROM public.order_cases c WHERE c.order_id = p_id AND c.closed_at IS NULL)
          AND (p_fit IS NULL OR p_fit IN ('ok', 'exchange', 'return')
               OR (p_fit = 'trial' AND p_delivered IS NOT NULL AND p_delivered <= now() - interval '14 days')))
$$;
REVOKE ALL ON FUNCTION public.order_is_settled(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_is_settled(uuid, text, text, timestamptz) TO service_role;

-- 2) Tamamlanma damgası: ödendi + teslim + faturalandı + KESİNLEŞTİ
CREATE OR REPLACE FUNCTION public.stamp_order_completed_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.completed_at IS NULL
     AND NEW.payment_status = 'paid'
     AND NEW.shipment_status = 'delivered'
     AND NEW.invoice_status = 'invoiced'
     AND public.order_is_settled(NEW.id, NEW.channel, NEW.fit_status, NEW.delivered_at) THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;

-- 3) Değişim / iade talebi kapanınca sipariş yeniden değerlendirilsin (fatura önce kesildiyse son adım talebin kapanması)
CREATE OR REPLACE FUNCTION public.trg_order_cases_settle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
    UPDATE public.orders SET updated_at = now() WHERE id = NEW.order_id AND completed_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_order_cases_settle ON public.order_cases;
CREATE TRIGGER trg_order_cases_settle AFTER UPDATE OF closed_at ON public.order_cases
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_cases_settle();

-- 4) Saatlik iş: 14 günü cevapsız dolan (faturası zaten kesilmiş) siparişler kesinleşir (src/app/api/cron/marketplace-sync)
CREATE OR REPLACE FUNCTION public.stamp_settled_orders()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.orders SET updated_at = now()
   WHERE completed_at IS NULL AND payment_status = 'paid' AND shipment_status = 'delivered' AND invoice_status = 'invoiced'
     AND public.order_is_settled(id, channel, fit_status, delivered_at);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.stamp_settled_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_settled_orders() TO service_role;

-- 5) Mevcut veri: hakedişi işlenmemiş ama henüz kesinleşmemiş siparişin damgası kalkar (kesinleşince yeniden basılır)
UPDATE public.orders SET completed_at = NULL
 WHERE completed_at IS NOT NULL AND commission_run_id IS NULL
   AND NOT public.order_is_settled(id, channel, fit_status, delivered_at);

-- 6) Deneme hatırlatması
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS trial_reminded_at timestamptz;

-- değişkenler: {{customer_name}} {{order_id}} {{days_left}} {{fit_buttons_html}} {{store_name}} {{store_url}}
INSERT INTO public.email_templates (trigger, subject, body_html, is_active)
SELECT 'trial_reminder',
  '{{store_name}} — Ayakkabınız oldu mu?',
  '<h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">Ayakkabınız oldu mu? 👣</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px">Merhaba {{customer_name}}, <b>{{order_id}}</b> numaralı siparişiniz birkaç gündür sizde. Umarız evde, günün farklı saatlerinde deneme fırsatı bulmuşsunuzdur.</p>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 6px">Nasıl olduğunu tek dokunuşla bize bildirebilirsiniz:</p>
{{fit_buttons_html}}
<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:14px 0 0;text-align:center">Değişim ya da iade için <b>{{days_left}} gününüz</b> kaldı. Her şey yolundaysa “Oldu” demeniz yeterli.</p>',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE trigger = 'trial_reminder');
