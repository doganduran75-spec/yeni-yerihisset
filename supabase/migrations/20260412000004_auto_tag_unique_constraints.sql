-- Otomatik etiket üretimi için UNIQUE kısıtları
-- PostgreSQL'de ADD CONSTRAINT IF NOT EXISTS desteklenmez,
-- bunun yerine CREATE UNIQUE INDEX IF NOT EXISTS kullanılır.

CREATE UNIQUE INDEX IF NOT EXISTS member_tag_groups_name_key
  ON member_tag_groups (name);

CREATE UNIQUE INDEX IF NOT EXISTS member_tag_options_group_value_key
  ON member_tag_options (group_id, value);
