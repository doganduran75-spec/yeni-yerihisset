-- ============================================================
-- Çok-çok kullanıcı rolleri + üye etiket sistemi
-- ============================================================

-- Varsayılan rolleri ekle (varsa atla)
INSERT INTO roles (name, slug) VALUES
  ('Üye',       'uye'),
  ('Müşteri',   'musteri'),
  ('Affiliate', 'affiliate')
ON CONFLICT (slug) DO NOTHING;

-- user_roles: bir kullanıcı birden fazla role sahip olabilir
CREATE TABLE user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

-- Mevcut profillere Üye rolünü toplu ata
INSERT INTO user_roles (user_id, role_id)
SELECT p.id, r.id
FROM profiles p
CROSS JOIN roles r
WHERE r.slug = 'uye'
ON CONFLICT DO NOTHING;

-- Yeni profil oluştuğunda otomatik Üye rolü ata
CREATE OR REPLACE FUNCTION assign_default_member_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role_id uuid;
BEGIN
  SELECT id INTO v_role_id FROM roles WHERE slug = 'uye' LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id)
    VALUES (NEW.id, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_assign_role
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION assign_default_member_role();

-- ============================================================
-- Üye etiket sistemi
-- ============================================================

-- Etiket grupları (örn: "Ayakkabı Numarası", "İlgi Alanı", "Şehir")
CREATE TABLE member_tag_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Her grubun seçenekleri (örn: 36, 37, 38 / Spor, Moda, Dekor)
CREATE TABLE member_tag_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES member_tag_groups(id) ON DELETE CASCADE,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_member_tag_options_group_id ON member_tag_options(group_id);

-- Üye-etiket ilişkisi
CREATE TABLE user_tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_option_id uuid NOT NULL REFERENCES member_tag_options(id) ON DELETE CASCADE,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag_option_id)
);

CREATE INDEX idx_user_tags_user_id ON user_tags(user_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE user_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_tag_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_tag_options  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tags           ENABLE ROW LEVEL SECURITY;

-- user_roles
CREATE POLICY "Kullanıcı kendi rollerini görebilir"
  ON user_roles FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "Admin user_roles yönetebilir"
  ON user_roles FOR ALL USING (is_admin());

-- member_tag_groups & options: herkes okuyabilir, admin yönetir
CREATE POLICY "Herkes tag gruplarını görebilir"
  ON member_tag_groups FOR SELECT USING (true);
CREATE POLICY "Admin tag gruplarını yönetir"
  ON member_tag_groups FOR ALL USING (is_admin());

CREATE POLICY "Herkes tag seçeneklerini görebilir"
  ON member_tag_options FOR SELECT USING (true);
CREATE POLICY "Admin tag seçeneklerini yönetir"
  ON member_tag_options FOR ALL USING (is_admin());

-- user_tags
CREATE POLICY "Kullanıcı kendi etiketlerini görebilir"
  ON user_tags FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "Admin user_tags yönetebilir"
  ON user_tags FOR ALL USING (is_admin());
