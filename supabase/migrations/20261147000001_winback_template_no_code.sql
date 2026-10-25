-- "Seni özledik" e-postası (kullanıcı 2026-10-25): kupon artık SEPETTE seçiliyor ve müşteri KOD YAZMIYOR →
-- kod kutusu yerine "sana özel" kutusu (indirim + son tarih + "kod yazmana gerek yok — sepetinde hazır"),
-- düğme sepete gider. Yalnız varsayılan metin duruyorsa güncellenir (panelden değiştirildiyse dokunulmaz).
UPDATE public.email_templates SET body_html =
'<h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">Seni yeniden görmek güzel 🌿</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba {{customer_name}}, uzun bir aradan sonra uğradığını gördük. Sana özel bir indirim tanımladık; hesabında hazır, sepetinde seçmen yeterli.</p>
<div style="margin:18px 0;border:2px dashed #65a30d;border-radius:16px;padding:18px;text-align:center;background:#f7fee7">
  <div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#4d7c0f">SANA ÖZEL</div>
  <div style="font-size:26px;font-weight:900;color:#1a2e05;margin:6px 0">%{{coupon_percent}} indirim</div>
  <div style="font-size:13px;color:#3f6212;line-height:1.6"><b>{{coupon_expires}}</b> tarihine kadar</div>
  <div style="font-size:12px;color:#4d7c0f;margin-top:8px">Kod yazmana gerek yok — giriş yaptığında sepetinde hazır.</div>
</div>
<div style="text-align:center"><a href="{{store_url}}/sepet" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:14px">Sepetime git</a></div>'
WHERE trigger = 'winback' AND body_html LIKE '%ödeme sayfasında seçmen yeterli%';
