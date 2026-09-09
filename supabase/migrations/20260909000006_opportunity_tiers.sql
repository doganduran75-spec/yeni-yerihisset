-- Fırsatlar seviye-merdiveni: rollere hiyerarşi (level) + fırsata min seviye.
-- Erişim kümülatif: kullanıcının en yüksek rol seviyesi >= fırsatın tier_level'i
-- ise kullanabilir (üst seviye alt seviyenin fırsatlarını da alır).
-- Ziyaretçi = seviye 0 (rol yok / giriş yok).

ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 0;

UPDATE public.roles SET level = 1 WHERE slug = 'uye'      AND level = 0;
UPDATE public.roles SET level = 2 WHERE slug = 'musteri'  AND level = 0;

-- Müdavim (sadakat) seviyesi — şimdilik elle atanır; otomasyon (≥N sipariş) sonra.
INSERT INTO public.roles (name, slug, level) VALUES ('Müdavim', 'mudavim', 3)
ON CONFLICT (slug) DO UPDATE SET level = 3;

-- Fırsatın erişim seviyesi (0 = Ziyaretçi/herkes)
ALTER TABLE public.partner_opportunities ADD COLUMN IF NOT EXISTS tier_level integer NOT NULL DEFAULT 0;

-- Mevcut dış-link iş ortağı fırsatları → Üye (1)
UPDATE public.partner_opportunities SET tier_level = 1 WHERE kind = 'external' AND tier_level = 0;
