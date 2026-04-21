-- Fırsatlara rol kısıtlaması eklendi
-- Boş dizi = herkese açık; dolu = sadece listelenen slug'a sahip üyeler erişebilir

ALTER TABLE partner_opportunities
  ADD COLUMN IF NOT EXISTS allowed_role_slugs text[] DEFAULT '{}';
