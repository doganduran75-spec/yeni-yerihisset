-- "Seni özledik" kupon kutusu (kullanıcı 2026-11-08): "15.11.2026 tarihine kadar" → "… tarihine kadar yapacağın alışverişlerde
-- geçerli". Yalnız varsayılan metin duruyorsa değişir. (CRM kampanyası kutusu kodda: src/lib/crm-campaign.ts couponBoxHtml)
UPDATE public.email_templates
   SET body_html = replace(body_html, '<b>{{coupon_expires}}</b> tarihine kadar</div>', '<b>{{coupon_expires}}</b> tarihine kadar yapacağın alışverişlerde geçerli</div>')
 WHERE trigger = 'winback' AND body_html LIKE '%<b>{{coupon_expires}}</b> tarihine kadar</div>%';
