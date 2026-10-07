-- ============================================================
-- İPTAL E-POSTASI: sabit "Ödeme yapıldıysa 3-5 iş günü içinde iadeniz…" kutusu yerine
-- siparişin gerçek durumuna göre açıklama ({{cancel_info_html}}, src/lib/notifications.ts):
--   kartla ödenmiş → "kart ödemen iade edildi, 1–14 iş günü içinde kartına yansır"
--   havaleyle ödenmiş → "banka hesabına iade edildi, 1–3 iş günü"
--   kredi kullanılmış → "YeriHisset Kredisi hesabına geri yüklendi"
--   ödeme alınmamış → "ödeme alınmadı, iade gerekmiyor; tekrar sipariş verebilirsin"
-- Şablon elle düzenlenip bu kutu silinmişse dokunulmaz (kod açıklamayı sona ekler).
-- Tekrar çalıştırmak güvenli.

UPDATE public.email_templates
   SET body_html = regexp_replace(
         body_html,
         '<div[^>]*>\s*<p[^>]*>Ödeme yapıldıysa[^<]*</p>\s*</div>',
         '{{cancel_info_html}}'),
       updated_at = now()
 WHERE trigger = 'order_cancelled'
   AND body_html LIKE '%Ödeme yapıldıysa%';

SELECT trigger, position('{{cancel_info_html}}' in body_html) > 0 AS yeni_aciklama_var
  FROM public.email_templates WHERE trigger = 'order_cancelled';
