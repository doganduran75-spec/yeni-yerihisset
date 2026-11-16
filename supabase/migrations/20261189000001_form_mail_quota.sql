-- Herkese açık formların aynı adrese e-posta sınırı (güvenlik taraması 2026-11-16, 3. parça bulgu 2).
-- Bülten, kampanya kuponu, ücretsiz kargo (lead magnet) ve stok bildirimi formları yazılan her adrese e-posta
-- gönderiyordu; IP sınırı her uygulama işleminin belleğinde tutulduğu ve IP değiştirilebildiği için biri başkasının
-- adresine e-posta yağdırabiliyordu. Burada adres başına sayaç veritabanında tutulur (tüm işlemler ortak, yeniden
-- başlatmada sıfırlanmaz). Kişisel veri: yalnız e-posta + form adı + zaman, 2 günden eski satırlar silinir.

CREATE TABLE IF NOT EXISTS public.form_mail_log (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  form text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_mail_log_email ON public.form_mail_log (email, sent_at);
CREATE INDEX IF NOT EXISTS idx_form_mail_log_sent ON public.form_mail_log (sent_at);
ALTER TABLE public.form_mail_log ENABLE ROW LEVEL SECURITY; -- politika yok: yalnız sunucu (service_role)
REVOKE ALL ON public.form_mail_log FROM anon, authenticated;

-- true → bu adrese şimdi e-posta gönderilebilir (sayılır); false → son p_hours saatte p_max'a ulaşıldı, gönderme.
CREATE OR REPLACE FUNCTION public.form_mail_allowed(p_email text, p_form text, p_max int DEFAULT 3, p_hours int DEFAULT 24)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e text := lower(btrim(coalesce(p_email, ''))); v_n int;
BEGIN
  IF v_e = '' THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('form_mail:' || v_e)); -- aynı adrese aynı anda gelen istekler sırayla
  DELETE FROM form_mail_log WHERE sent_at < now() - interval '2 days';
  SELECT count(*) INTO v_n FROM form_mail_log WHERE email = v_e AND sent_at > now() - make_interval(hours => p_hours);
  IF v_n >= p_max THEN RETURN false; END IF;
  INSERT INTO form_mail_log (email, form) VALUES (v_e, left(coalesce(p_form, ''), 40));
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.form_mail_allowed(text, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.form_mail_allowed(text, text, int, int) TO service_role;
