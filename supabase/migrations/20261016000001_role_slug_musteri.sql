-- ============================================================
-- "Müşteri" rolünün kısa adı kodla aynı: 'musteri'
-- ============================================================
-- Sunucudaki rol 'customer' kısa adıyla duruyordu; kodun her yeri (sipariş sonrası rol,
-- Fırsatlar seviyeleri, refresh_member_auto_tags) 'musteri' arıyor → rol hiç atanmıyordu.
-- Rolün adı, id'si ve mevcut atamaları DEĞİŞMEZ; yalnız kısa adı düzelir. Tekrar çalıştırmak güvenli.

DO $$
DECLARE v_cust uuid; v_must uuid;
BEGIN
  SELECT id INTO v_cust FROM public.roles WHERE slug = 'customer' LIMIT 1;
  SELECT id INTO v_must FROM public.roles WHERE slug = 'musteri' LIMIT 1;
  IF v_cust IS NOT NULL AND v_must IS NULL THEN
    UPDATE public.roles SET slug = 'musteri' WHERE id = v_cust;
    RAISE NOTICE 'Müşteri rolü: customer → musteri';
  ELSIF v_cust IS NOT NULL AND v_must IS NOT NULL THEN
    -- İkisi birden varsa birleştir: atamaları musteri'ye taşı, customer'ı sil
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT ur.user_id, v_must FROM public.user_roles ur WHERE ur.role_id = v_cust
    ON CONFLICT (user_id, role_id) DO NOTHING;
    DELETE FROM public.roles WHERE id = v_cust;
    RAISE NOTICE 'customer rolü musteri ile birleştirildi';
  ELSIF v_must IS NULL THEN
    INSERT INTO public.roles (name, slug) VALUES ('Müşteri', 'musteri');
    RAISE NOTICE 'Müşteri rolü oluşturuldu';
  END IF;
END $$;

-- Fırsatlar seviyesi (20260909000006 'musteri' bulamadığı için uygulanmamış olabilir)
UPDATE public.roles SET level = 2 WHERE slug = 'musteri' AND coalesce(level, 0) = 0;

-- Müşteri rolünü geriye dönük ata (ödenmiş, iptal edilmemiş siparişi olanlar)
SELECT 'Müşteri rolü ataması' AS adim, public.refresh_member_auto_tags() AS sonuc;

SELECT r.name, r.slug, r.level, count(ur.user_id) AS uye
FROM public.roles r LEFT JOIN public.user_roles ur ON ur.role_id = r.id
GROUP BY r.id, r.name, r.slug, r.level ORDER BY r.level NULLS LAST, r.name;
