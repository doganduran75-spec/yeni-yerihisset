-- ─────────────────────────────────────────────────────────────────────────────
-- F14/F15: Kişiler (contacts) — auth'suz, kanaldan gelen kişi kayıtları
--
-- Amaç: markayla bir kez temas etmiş herkesi (üye olmasa da) tek yerde tutmak.
-- Tüm kimlik alanları opsiyonel (Instagram-only kişi de kaydedilebilir).
-- Kişi ileride gerçek üyeye dönüşürse linked_user_id ile bağlanır (listede
-- çift görünmemesi için linked olanlar birleşik listede gizlenir).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         text,
  email             text,
  phone             text,
  instagram_handle  text,
  shoe_size         text,
  source_channel    text NOT NULL DEFAULT 'other',  -- email|instagram|whatsapp|phone|in_person|lead_magnet|stock_notify|other
  status            text NOT NULL DEFAULT 'lead',    -- lead|contacted|converted
  note              text,
  linked_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  CONSTRAINT contacts_identity_check CHECK (
    full_name IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL OR instagram_handle IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS contacts_email_idx     ON public.contacts (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_instagram_idx ON public.contacts (lower(instagram_handle)) WHERE instagram_handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_linked_idx    ON public.contacts (linked_user_id);

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Yalnızca admin görebilir/yönetebilir (service_role RLS'i atlar)
DROP POLICY IF EXISTS "admin manage contacts" ON public.contacts;
CREATE POLICY "admin manage contacts"
  ON public.contacts FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
