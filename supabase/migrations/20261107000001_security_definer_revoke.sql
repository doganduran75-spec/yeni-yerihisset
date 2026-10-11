-- GÜVENLİK TURU (2026-10-11): PostgreSQL fonksiyonları varsayılan olarak HERKESE (anon dahil) çalıştırma izni
-- verir. SECURITY DEFINER fonksiyonlar sahibinin (tam yetki) haklarıyla çalıştığından, açık kalanlar RPC ile
-- doğrudan çağrılabiliyordu:
--   * link_contacts_for_user(p_user, p_email): üye kendi kimliğiyle BAŞKASININ e-postasını verip o kişinin
--     stok bildirimi / kişi kayıtlarını (telefon, Instagram) kendi hesabına bağlayabiliyor → "kendi kaydını oku"
--     kuralıyla okuyabiliyordu. Yalnız tetikleyici (on_profile_link_contacts) kullanır.
--   * rollup_analytics_daily(day) / prune_analytics(): girişsiz çağrı geçmiş günlük istatistiği silip boş
--     yeniden yazabiliyordu. Yalnız bakım cron'u (servis rolü) kullanır.
REVOKE ALL ON FUNCTION public.link_contacts_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_contacts_for_user(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.rollup_analytics_daily(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_analytics_daily(date) TO service_role;

REVOKE ALL ON FUNCTION public.prune_analytics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_analytics() TO service_role;

-- İlk sürümden kalmış olabilecek "her üye TÜM stok bildirimlerini okur / günceller" kuralları
-- (self-host'ta yerini "kendi kaydı" + "yönetici" kurallarına bırakmıştı; varsa kaldır).
DROP POLICY IF EXISTS "Authenticated users can read stock_notifications" ON public.stock_notifications;
DROP POLICY IF EXISTS "Authenticated users can update stock_notifications" ON public.stock_notifications;
