-- KVKK: "hesabımı sil" = yumuşak kapatma. Kişisel veri anonimleştirilir, giriş
-- kapatılır; ancak sipariş/işlem kayıtları yasal saklama gereği KORUNUR (orphan
-- olmaz). deleted_at bu durumu işaretler.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
