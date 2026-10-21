-- PAZARYERİNE FATURA YÜKLEME (kullanıcı isteği 2026-10-21). Eski e-fatura firması faturayı Trendyol'a otomatik
-- yüklüyordu; Paraşüt'e geçince Trendyol'da sipariş "fatura bekleniyor"da kaldı. Paraşüt faturası bitince (PDF özel
-- depoda) PDF Trendyol'a dosya olarak yüklenir (seller-invoice-file); olmazsa siparişte "Trendyol'a yükle" düğmesi.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS mp_invoice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS mp_invoice_error   text;
