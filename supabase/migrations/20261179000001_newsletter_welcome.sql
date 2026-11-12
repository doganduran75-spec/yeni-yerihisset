-- BÜLTEN HOŞ GELDİN E-POSTASI (kullanıcı 2026-11-12): bültene katılana "katıldın" e-postası; her bülten e-postasının
-- altında "abonelikten çık" bağlantısı olduğu bilgisi + bu e-postada da tek tıkla çıkış (kaydı kendisi yapmadıysa).
-- Gönderim: src/lib/newsletter.ts (yeni / geri dönen abone; zaten listedeyse gitmez). Panelden düzenlenir / kapatılır.
-- değişkenler: {{unsubscribe_url}} {{email}} {{store_url}} {{store_name}}
INSERT INTO public.email_templates (trigger, subject, body_html, is_active)
SELECT 'newsletter_welcome',
  '{{store_name}} bültenine hoş geldin 🌱',
  '<h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">Bültenimize katıldın 🌱</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px">Merhaba, <b>{{email}}</b> adresini {{store_name}} bülten listesine ekledik. Yeni koleksiyonlardan, özel indirimlerden ve barefoot ipuçlarından ilk sen haberdar olacaksın.</p>
<div style="background:#f7f9f0;border:1px solid #e6ecd3;border-radius:12px;padding:14px 16px;margin:0 0 18px">
  <p style="font-size:14px;color:#4d5e2a;line-height:1.6;margin:0">İstediğin zaman ayrılabilirsin: her bülten e-postasının en altında <b>“abonelikten çık”</b> bağlantısı var, tek tıkla listeden çıkarsın.</p>
</div>
<div style="text-align:center;margin:0 0 18px">
  <a href="{{store_url}}/magaza" style="display:inline-block;background:#4d7c0f;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:12px;font-weight:800;font-size:15px">Mağazaya göz at</a>
</div>
<p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0;text-align:center">Bu kaydı sen yapmadıysan ya da vazgeçtiysen: <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline">bültenden çık</a>.</p>',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE trigger = 'newsletter_welcome');
