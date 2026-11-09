-- Paraşüt kanal ayarı: "attipas" (attipas.com.tr WooCommerce siparişleri, scripts/woo-import.mjs kanal "attipas").
-- 2026-11-09: Attipas siparişinde "“attipas” kanalı için Paraşüt ayarı yok". Başlangıç: sitenin tahsilat hesabı ve
-- "tahsil edildi" işareti kopyalanır; fatura kategorisi (proje) boş — Ayarlar › Paraşüt › Satış kanalına göre'den seçilir.
-- Ödeme tipi boş = ödeme yönteminden (kart → KREDIKARTI/BANKAKARTI, havale → EFT/HAVALE + "Banka").
INSERT INTO public.parasut_channel_settings (channel, account_id, account_name, mark_paid, payment_type, payment_platform, internet_url)
SELECT 'attipas', s.account_id, s.account_name, coalesce(s.mark_paid, true), NULL, NULL, 'https://attipas.com.tr'
  FROM (SELECT 1) one
  LEFT JOIN public.parasut_channel_settings s ON s.channel = 'site'
ON CONFLICT (channel) DO NOTHING;
