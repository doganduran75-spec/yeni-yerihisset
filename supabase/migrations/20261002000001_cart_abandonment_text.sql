-- Sepet hatırlatma e-postası: "Numaran tükenmeden" → "Stoklar tükenmeden"
-- (sipariş kurtarma e-postası 20260925000002'de değişmişti). Idempotent.
UPDATE public.email_templates
SET body_html = replace(body_html, 'Numaran tükenmeden', 'Stoklar tükenmeden')
WHERE trigger = 'cart_abandonment' AND body_html LIKE '%Numaran tükenmeden%';

SELECT trigger, (body_html LIKE '%Stoklar tükenmeden%') AS yeni_metin
FROM public.email_templates WHERE trigger IN ('cart_abandonment', 'order_recovery');
