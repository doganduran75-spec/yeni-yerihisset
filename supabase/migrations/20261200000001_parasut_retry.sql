-- PARAŞÜT KESİNTİSİNDE OTOMATİK YENİDEN DENEME (kullanıcı 2026-11-25: Paraşüt "Teknik Bakım" sayfası döndü, faturası kesilemeyen
-- siparişler "Bekleyen sipariş işi"nde yapılacak bir şey olmadan duruyordu).
-- parasut_status = 'retry': Paraşüt bakımda / ulaşılamıyor, istek işlenmedi → pollParasut (10 dk) kendiliğinden yeniden dener.
-- parasut_retry_since: ilk kesinti anı; PARASUT_RETRY_HOURS (12 saat) geçerse 'error' olur ve yöneticinin işine düşer.
-- src/lib/parasut-invoice.ts (invoiceOrder / retryUnavailable), src/lib/order-next-step.ts.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS parasut_retry_since timestamptz;
COMMENT ON COLUMN public.orders.parasut_status IS 'creating | created | job_pending | pdf_pending | done | error | retry (Paraşüt kesintisi, kendiliğinden yeniden denenir)';
