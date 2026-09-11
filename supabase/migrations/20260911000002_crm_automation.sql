-- Dalga 4: CRM otomasyonu — sepet-terk hatırlatma + "Sıcak Lead" etiketi.
-- Sepet-terk cron'u (/api/cron/cart-abandonment) mailledikten sonra tekrar
-- maillemesin diye oturuma damga; "Sıcak Lead" etiketini de otomatik atar.

-- Sepet-terk maili gönderildi damgası (tekrar göndermeyi engeller)
ALTER TABLE public.analytics_sessions
  ADD COLUMN IF NOT EXISTS abandoned_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_asessions_abandon
  ON public.analytics_sessions (last_seen_at)
  WHERE abandoned_notified_at IS NULL AND user_id IS NOT NULL AND is_bot = false;

-- "CRM Durumu" etiket grubu + "Sıcak Lead" seçeneği (idempotent seed)
DO $$
DECLARE gid uuid;
BEGIN
  SELECT id INTO gid FROM public.member_tag_groups WHERE name = 'CRM Durumu' LIMIT 1;
  IF gid IS NULL THEN
    INSERT INTO public.member_tag_groups (name, description)
    VALUES ('CRM Durumu', 'Otomasyon etiketleri (sepet-terk vb.)')
    RETURNING id INTO gid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.member_tag_options WHERE group_id = gid AND value = 'Sıcak Lead') THEN
    INSERT INTO public.member_tag_options (group_id, value) VALUES (gid, 'Sıcak Lead');
  END IF;
END $$;
