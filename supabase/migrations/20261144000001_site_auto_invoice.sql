-- YERİHİSSET SİPARİŞİNDE OTOMATİK FATURA (kullanıcı kararları 2026-10-24):
--   * Karar netleşince (müşteri "oldu" dedi / yönetici "oldu say" / değişimde tutulmayan ürün geri geldi) Paraşüt
--     faturası kendiliğinden kesilir; PDF müşteriye BİZDEN e-postayla gider (bir kez — invoice_emailed_at).
--   * 14 gün cevap yoksa otomatik kesilmez: "Bekleyen işler"e düşer, yönetici onaylar.
--   * Paraşüt'ün kendi e-Arşiv e-postası canlıya geçmeden kapatılacak (Paraşüt'e e-posta adresi gönderilmeyecek).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_emailed_at timestamptz;
