-- SİSTEM DURUMU (pano yeniden düzeni, 2026-10-11): üstte sistem şeridi (yeşil / sarı / kırmızı),
-- altında satış. Ayrıntı: /admin/system. Veri: /api/admin/system-status.
--
-- 1) client_errors: müşterinin karşılaştığı hatalar (ödeme sayfasında gösterilen hata, stok yarışı,
--    başarısız kart ödemesi). Kişisel veri YOK: tür, kısa mesaj, sayfa, (varsa) sipariş/üye kimliği.
--    Yalnız sunucu yazar/okur; 90 günden eski kayıtlar analitik bakım cron'unda silinir.
CREATE TABLE IF NOT EXISTS public.client_errors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind       text NOT NULL,          -- checkout · stock · payment_failed · after_sale · other
  message    text,
  path       text,
  user_id    uuid,
  order_id   uuid
);
CREATE INDEX IF NOT EXISTS idx_client_errors_time ON public.client_errors(created_at DESC);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM anon, authenticated;

-- 2) Yönetici girişleri (Supabase Auth kayıtlarından): son N gün; "yeni IP" = bu girişten önceki 30 günde
--    o yöneticinin hiç kullanmadığı IP. Kolon farklarına dayanıklı (to_jsonb).
CREATE OR REPLACE FUNCTION public.admin_login_activity(p_days int DEFAULT 7)
RETURNS TABLE (email text, ip text, created_at timestamptz, new_ip boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  WITH admins AS (SELECT id::text AS id, email FROM public.profiles WHERE role = 'admin' AND email NOT ILIKE '%.test'), -- regresyon test yöneticileri hariç
  logins AS (
    SELECT a.created_at, ad.email,
           nullif(coalesce(to_jsonb(a)->>'ip_address', a.payload::jsonb->>'ip_address', ''), '') AS ip,
           a.payload::jsonb->>'actor_id' AS actor
      FROM auth.audit_log_entries a
      JOIN admins ad ON ad.id = a.payload::jsonb->>'actor_id'
     WHERE a.payload::jsonb->>'action' = 'login'
       AND a.created_at > now() - make_interval(days => p_days + 30)
  )
  SELECT l.email, l.ip, l.created_at,
         (l.ip IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM logins p WHERE p.actor = l.actor AND p.ip = l.ip
               AND p.created_at < l.created_at AND p.created_at > l.created_at - interval '30 days')) AS new_ip
    FROM logins l
   WHERE l.created_at > now() - make_interval(days => p_days)
   ORDER BY l.created_at DESC
   LIMIT 50
$$;
REVOKE ALL ON FUNCTION public.admin_login_activity(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login_activity(int) TO service_role;

SELECT count(*) AS son_7_gun_yonetici_girisi FROM public.admin_login_activity(7);
