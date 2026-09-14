-- Yeni e-posta şablonları menüde görünsün + düzenlenebilir olsun:
-- sepet-terk hatırlatma (cart_abandonment) ve sipariş kurtarma (order_recovery).
-- trigger CHECK constraint'i yeni değerleri engelliyordu → kaldırılır.

ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_trigger_check;

-- Sepet-terk hatırlatma. Değişkenler: {{customer_name}} {{items_html}} {{store_url}} {{store_name}}
INSERT INTO public.email_templates (trigger, subject, body_html, is_active)
SELECT
  'cart_abandonment',
  '{{store_name}} — Sepetini tamamlamak ister misin? 👟',
  '<h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">Sepetinde seni bekleyen ürünler var 👟</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba {{customer_name}}, göz attığın ürünleri senin için ayırdık. Numaran tükenmeden tamamlamak ister misin?</p>
<ul style="margin:0 0 20px;padding:0 0 0 18px">{{items_html}}</ul>
<div style="text-align:center;margin:8px 0 4px">
  <a href="{{store_url}}/sepet" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:14px">Sepete Dön</a>
</div>',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE trigger = 'cart_abandonment');

-- Sipariş kurtarma (ödeme yarıda kaldı). Değişkenler: {{customer_name}} {{order_id}} {{store_url}} {{store_name}}
INSERT INTO public.email_templates (trigger, subject, body_html, is_active)
SELECT
  'order_recovery',
  '{{store_name}} — Siparişini tamamlamak ister misin? ({{order_id}})',
  '<h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">İşlemin yarıda mı kaldı? 🛒</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba {{customer_name}}, <b>{{order_id}}</b> numaralı siparişinin ödemesi tamamlanmadı ve sipariş iptal edildi — ama seçtiğin ürünleri hesabından <b>tek tıkla tekrar oluşturabilirsin</b>. Numaran tükenmeden tamamlamak ister misin?</p>
<div style="text-align:center;margin:10px 0 4px">
  <a href="{{store_url}}/account?tab=orders" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:14px">Siparişimi Tamamla</a>
</div>',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE trigger = 'order_recovery');
