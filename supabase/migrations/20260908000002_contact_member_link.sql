-- #6b Kişi ↔ Üye birleştirme
-- 1) Üye (profile) oluşunca aynı e-postalı kişileri otomatik ona bağla.
-- 2) Mevcut eşleşmeleri geriye dönük bağla (backfill).
-- 3) Admin için: mevcut mükerrer kişileri birleştirme + elle "üyeyle birleştir".
-- Bağlanan kişi (linked_user_id dolu) birleşik listede gizlenir; ilgili stok
-- bildirimleri üyeye atanır (geçmiş üyeye taşınır).

-- Bir üyeye, aynı e-postalı bağlanmamış kişileri bağla + stok bildirimlerini ata.
CREATE OR REPLACE FUNCTION public.link_contacts_for_user(p_user uuid, p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN RETURN; END IF;

  UPDATE public.stock_notifications sn
     SET user_id = p_user
    FROM public.contacts c
   WHERE sn.contact_id = c.id
     AND c.linked_user_id IS NULL
     AND lower(c.email) = lower(p_email);

  UPDATE public.contacts
     SET linked_user_id = p_user
   WHERE linked_user_id IS NULL
     AND lower(email) = lower(p_email);
END; $$;

-- profiles insert/update(email) → otomatik bağla
CREATE OR REPLACE FUNCTION public.on_profile_link_contacts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.link_contacts_for_user(NEW.id, NEW.email);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_profile_link_contacts ON public.profiles;
CREATE TRIGGER trg_profile_link_contacts
  AFTER INSERT OR UPDATE OF email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_link_contacts();

-- Backfill: mevcut üyelerle eşleşen kişileri bağla
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, email FROM public.profiles WHERE email IS NOT NULL LOOP
    PERFORM public.link_contacts_for_user(r.id, r.email);
  END LOOP;
END $$;

-- Admin: bir kişiyi elle bir üyeye bağla (stok bildirimlerini de ata)
CREATE OR REPLACE FUNCTION public.admin_link_contact_to_member(p_contact uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'yetkisiz'; END IF;
  UPDATE public.stock_notifications SET user_id = p_user WHERE contact_id = p_contact;
  UPDATE public.contacts SET linked_user_id = p_user WHERE id = p_contact;
END; $$;

-- Admin: mevcut mükerrer kişileri (aynı e-posta / aynı instagram, bağlanmamış)
-- en eskisinde birleştir; stok bildirimlerini taşı, boş alanları doldur.
CREATE OR REPLACE FUNCTION public.admin_merge_duplicate_contacts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  merged integer := 0;
  g record;
  keeper uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'yetkisiz'; END IF;

  -- E-posta bazlı
  FOR g IN
    SELECT array_agg(id ORDER BY created_at) AS ids
    FROM public.contacts
    WHERE email IS NOT NULL AND btrim(email) <> '' AND linked_user_id IS NULL
    GROUP BY lower(email) HAVING count(*) > 1
  LOOP
    keeper := g.ids[1];
    UPDATE public.stock_notifications SET contact_id = keeper WHERE contact_id = ANY(g.ids[2:]);
    UPDATE public.contacts kc SET
      full_name        = COALESCE(kc.full_name, d.full_name),
      phone            = COALESCE(kc.phone, d.phone),
      instagram_handle = COALESCE(kc.instagram_handle, d.instagram_handle),
      shoe_size        = COALESCE(kc.shoe_size, d.shoe_size),
      note             = COALESCE(kc.note, d.note)
    FROM (SELECT * FROM public.contacts WHERE id = ANY(g.ids[2:]) ORDER BY created_at LIMIT 1) d
    WHERE kc.id = keeper;
    DELETE FROM public.contacts WHERE id = ANY(g.ids[2:]);
    merged := merged + array_length(g.ids, 1) - 1;
  END LOOP;

  -- Instagram bazlı (e-posta birleştirmesinden sonra kalanlar)
  FOR g IN
    SELECT array_agg(id ORDER BY created_at) AS ids
    FROM public.contacts
    WHERE instagram_handle IS NOT NULL AND btrim(instagram_handle) <> '' AND linked_user_id IS NULL
    GROUP BY lower(instagram_handle) HAVING count(*) > 1
  LOOP
    keeper := g.ids[1];
    UPDATE public.stock_notifications SET contact_id = keeper WHERE contact_id = ANY(g.ids[2:]);
    UPDATE public.contacts kc SET
      full_name = COALESCE(kc.full_name, d.full_name),
      email     = COALESCE(kc.email, d.email),
      phone     = COALESCE(kc.phone, d.phone),
      shoe_size = COALESCE(kc.shoe_size, d.shoe_size),
      note      = COALESCE(kc.note, d.note)
    FROM (SELECT * FROM public.contacts WHERE id = ANY(g.ids[2:]) ORDER BY created_at LIMIT 1) d
    WHERE kc.id = keeper;
    DELETE FROM public.contacts WHERE id = ANY(g.ids[2:]);
    merged := merged + array_length(g.ids, 1) - 1;
  END LOOP;

  RETURN merged;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_link_contact_to_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_duplicate_contacts() TO authenticated;
