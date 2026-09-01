-- "Yeni Kupon Tanımlandı" e-posta şablonu (bir üyeye kupon atanınca gönderilir).
-- Değişkenler: {{customer_name}} {{coupon_code}} {{coupon_name}} {{coupon_value}}
--              {{coupon_description}} {{coupon_expires}} {{store_name}} {{store_url}}
INSERT INTO public.email_templates (trigger, subject, body_html, is_active)
SELECT
  'coupon_assigned',
  '🎉 Size özel bir indirim kuponu tanımlandı — {{coupon_code}}',
  '<h2 style="color:#1d4ed8;margin:0 0 20px;">Size Özel Bir Kupon!</h2>
<p>Merhaba <strong>{{customer_name}}</strong>,</p>
<p>Hesabınıza yeni bir indirim kuponu tanımlandı:</p>
<div style="background:#fffbeb;border:2px dashed #f59e0b;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
  <p style="margin:0 0 6px;color:#92400e;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">{{coupon_name}}</p>
  <p style="margin:0 0 8px;font-size:28px;font-weight:900;color:#b45309;letter-spacing:2px;font-family:monospace;">{{coupon_code}}</p>
  <p style="margin:0;color:#78350f;font-size:15px;font-weight:700;">{{coupon_value}}</p>
</div>
<p style="color:#64748b;font-size:14px;">{{coupon_description}}</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{{store_url}}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:bold;">Alışverişe Başla</a>
</div>
<p style="color:#94a3b8;font-size:12px;">Kuponunuz hesabınızda tanımlıdır; ödeme sırasında seçip kullanabilirsiniz.</p>',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates WHERE trigger = 'coupon_assigned'
);
