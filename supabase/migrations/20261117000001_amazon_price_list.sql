-- ============================================================
-- AMAZON FİYAT LİSTESİ
-- ============================================================
-- Fiyatlar sayfasında "Amazon Satış" sütunu. Kaydet ve pazaryerlerine gönder →
-- enqueue_marketplace_prices('amazon', …) (kanal_sale listesi; Amazon'da PSF yok) →
-- src/lib/marketplace/price-sync.ts amazon adaptörü (purchasable_offer, KDV dahil TRY).
-- Kuyruk, ilan kontrolü ve geçmiş Trendyol / Hepsiburada ile aynı (20261007, 20261018).

INSERT INTO public.price_lists (code, name, channel, kind, currency, sort_order, builtin)
VALUES ('amazon_sale', 'Amazon Satış', 'amazon', 'sale', 'TRY', 60, true)
ON CONFLICT (code) DO UPDATE SET channel = 'amazon', kind = 'sale', builtin = true;
