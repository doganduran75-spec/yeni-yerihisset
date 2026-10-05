-- ============================================================
-- CRM kişileri: aynı e-postayla İKİNCİ kayıt oluşamaz → "Mükerrerleri Temizle" kalktı
-- ============================================================
-- Kişi oluşturan yollar (bülten, stok bildirimi, elle ekleme) zaten önce e-postayı arıyordu;
-- tek açık elle eklemedeki "yine de ekle" idi (kaldırıldı). Burada: mevcut mükerrerler son
-- bir kez birleştirilir, sonra e-posta veritabanında tekil yapılır (üyeye bağlı olmayanlar).

DO $$
DECLARE g record; keeper uuid;
BEGIN
  FOR g IN
    SELECT array_agg(id ORDER BY created_at) AS ids
    FROM public.contacts
    WHERE email IS NOT NULL AND btrim(email) <> '' AND linked_user_id IS NULL
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  LOOP
    keeper := g.ids[1];
    UPDATE public.stock_notifications SET contact_id = keeper WHERE contact_id = ANY (g.ids[2:]);
    UPDATE public.contacts kc SET
      full_name        = COALESCE(kc.full_name, d.full_name),
      phone            = COALESCE(kc.phone, d.phone),
      instagram_handle = COALESCE(kc.instagram_handle, d.instagram_handle),
      shoe_size        = COALESCE(kc.shoe_size, d.shoe_size),
      note             = COALESCE(kc.note, d.note)
    FROM (SELECT * FROM public.contacts WHERE id = ANY (g.ids[2:]) ORDER BY created_at LIMIT 1) d
    WHERE kc.id = keeper;
    DELETE FROM public.contacts WHERE id = ANY (g.ids[2:]);
    RAISE NOTICE 'birleştirildi: % kayıt', array_length(g.ids, 1) - 1;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_unique
  ON public.contacts (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '' AND linked_user_id IS NULL;

DROP FUNCTION IF EXISTS public.admin_merge_duplicate_contacts();

SELECT 'contacts e-posta tekil' AS durum, count(*) AS kisi FROM public.contacts;
