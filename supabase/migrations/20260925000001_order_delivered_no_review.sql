-- "Teslim Edildi" e-postasından "Deneyiminizi değerlendirin / Yorum Yaz" kutusu
-- kaldırılır — teslim anında yorum istemek erken. (Ayrı bir "yorum talebi"
-- e-postası, teslimden birkaç gün sonra gönderilecek şekilde kurulacak.)
-- Yalnız o kutuyu siler; admin'in düzenlediği diğer metinler korunur. Idempotent.
UPDATE public.email_templates
SET body_html = regexp_replace(body_html, '\s*<div[^>]*#fff7ed[^>]*>.*Yorum Yaz</a>\s*</div>', '', 'g')
WHERE trigger = 'order_delivered' AND body_html LIKE '%Yorum Yaz%';
