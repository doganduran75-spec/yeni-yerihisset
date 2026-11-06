-- E-posta metin düzeltmeleri (kullanıcı 2026-11-06, E-posta denemesi sonrası). Yalnız varsayılan metin duruyorsa
-- değişir (panelden düzenlenmiş şablona dokunulmaz).

-- 1) Tutarda çift ₺ ("₺₺3499.00"): {{order_total}} zaten ₺ ile gelir
UPDATE public.email_templates
   SET body_html = replace(body_html, '₺{{order_total}}', '{{order_total}}'),
       subject   = replace(subject, '₺{{order_total}}', '{{order_total}}')
 WHERE body_html LIKE '%₺{{order_total}}%' OR subject LIKE '%₺{{order_total}}%';

-- 2) "Seni özledik": "Kod yazmana gerek yok — giriş yaptığında sepetinde hazır." satırı kalkar
UPDATE public.email_templates
   SET body_html = replace(body_html,
     E'\n  <div style="font-size:12px;color:#4d7c0f;margin-top:8px">Kod yazmana gerek yok — giriş yaptığında sepetinde hazır.</div>', '')
 WHERE trigger = 'winback' AND body_html LIKE '%Kod yazmana gerek yok%';
UPDATE public.email_templates
   SET body_html = replace(body_html,
     '<div style="font-size:12px;color:#4d7c0f;margin-top:8px">Kod yazmana gerek yok — giriş yaptığında sepetinde hazır.</div>', '')
 WHERE trigger = 'winback' AND body_html LIKE '%Kod yazmana gerek yok%';

-- 3) Teslim edildi: "memnun kalmışsınızdır + Yorum yaz" yerine "teslim bilgisini aldık, evde deneyin" — altına kod
--    "Acele yok… ayakkabın oldu mu? Oldu / Numara değişimi / İade" kutusunu ekler (src/lib/after-sale.ts fitBoxHtml).
--    Yorum isteği ayrı e-postayla, "oldu" dedikten sonra gider.
UPDATE public.email_templates SET
  subject = 'Siparişiniz teslim edildi - #{{order_id}}',
  body_html =
'<h2 style="color:#1e293b;font-size:22px;margin:0 0 16px 0;">Siparişiniz teslim edildi</h2>
<p style="color:#475569;margin:0 0 12px 0;">Merhaba <strong>{{customer_name}}</strong>,</p>
<p style="color:#475569;margin:0 0 12px 0;"><strong>#{{order_id}}</strong> numaralı siparişinizin teslim edildiği bilgisini aldık.</p>
<p style="color:#475569;margin:0 0 8px 0;">Ayakkabılarınızı ev ortamında, acele etmeden denemenizi bekliyoruz.</p>'
 WHERE trigger = 'order_delivered' AND body_html LIKE '%memnun kalmışsınızdır%';
