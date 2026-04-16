-- Kupon sistemi

CREATE TABLE IF NOT EXISTS coupons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text UNIQUE NOT NULL,
  name                text NOT NULL,
  description         text,
  type                text NOT NULL CHECK (type IN ('percentage', 'fixed', 'free_shipping')),
  amount              numeric(10,2) NOT NULL DEFAULT 0,
  min_order_amount    numeric(10,2) NOT NULL DEFAULT 0,
  max_discount_amount numeric(10,2) DEFAULT NULL,
  is_personal         boolean NOT NULL DEFAULT false,
  max_uses            integer DEFAULT NULL,
  per_user_limit      integer NOT NULL DEFAULT 1,
  used_count          integer NOT NULL DEFAULT 0,
  starts_at           timestamptz DEFAULT now(),
  expires_at          timestamptz DEFAULT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Kullanıcı-kupon atamaları ve kullanım takibi
CREATE TABLE IF NOT EXISTS user_coupons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coupon_id     uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  use_count     integer NOT NULL DEFAULT 0,
  last_used_at  timestamptz DEFAULT NULL,
  last_order_id uuid DEFAULT NULL,
  added_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, coupon_id)
);

-- Siparişlere kupon alanları ekle
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_id       uuid REFERENCES coupons(id),
  ADD COLUMN IF NOT EXISTS coupon_discount numeric(10,2) DEFAULT 0;

-- RLS
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_coupons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read active coupons"
    ON coupons FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage coupons"
    ON coupons FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users see own coupons"
    ON user_coupons FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users insert own coupons"
    ON user_coupons FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users update own coupons"
    ON user_coupons FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage user_coupons"
    ON user_coupons FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons(user_id);
