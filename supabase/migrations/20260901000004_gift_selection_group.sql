-- Birleşik ödül seçici için: ücretsiz ürünlerde "seçim grubu".
-- Aynı selection_group'taki ödüllerden yalnızca BİRİ seçilebilir (karşılıklı dışlama).
-- selection_group boş (NULL) olan ödüller bağımsızdır (birlikte seçilebilir/kombinlenebilir).
ALTER TABLE public.free_gift_rules
  ADD COLUMN IF NOT EXISTS selection_group text;
