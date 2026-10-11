-- Güvenlik turu devamı (2026-10-11): yalnız diğer yetkili (SECURITY DEFINER) fonksiyonların içinden çağrılan iki
-- yardımcı dışarıdan da çağrılabiliyordu (hangi barkodun pazaryerinde ilanda olduğu / kanala gidecek stok tamponu
-- sızabiliyordu). İçeriden çağrılar sahibin yetkisiyle çalıştığı için etkilenmez.
REVOKE ALL ON FUNCTION public.marketplace_is_listed(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_is_listed(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.marketplace_send_qty(text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_send_qty(text, uuid, int) TO service_role;
