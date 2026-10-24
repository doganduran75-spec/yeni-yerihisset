-- "PAKET HAZIR" AKIŞI (kullanıcı kararları 2026-10-24):
--   * Pazaryeri (Trendyol / Hepsiburada): etiket basılır → "Paket hazır" → Paraşüt faturası kendiliğinden kesilir →
--     pazaryerine yüklenir → Trendyol paketi "İşleme al" (Picking) yapılır. Elle "Faturayı kes" düğmesi kalkar.
--   * Site: "Paket hazır" = Kargo bekliyor (müşteriye e-posta GİTMEZ; gece paketlenebilir). Kurye alınca
--     "Kurye aldı" (toplu) → Kargoda + kargo e-postası o an. Kargonomi kodu gelince de artık kendiliğinden
--     "Kargoda" yapılmaz (kod gelir, paket hazırlanır, kurye alınca kargoya çıkar).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS packed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS mp_picking_at    timestamptz,  -- Trendyol'da "İşleme al" yapıldı
  ADD COLUMN IF NOT EXISTS mp_picking_error text;
