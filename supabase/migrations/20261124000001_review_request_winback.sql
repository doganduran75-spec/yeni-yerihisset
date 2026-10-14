-- ============================================================
-- YORUM İSTEME + "SENİ ÖZLEDİK" (geri dönen üye) — ayarlardan yönetilir (kullanıcı kararları 2026-10-14)
-- ============================================================
-- C) Ayakkabıyı kullanmaya başladıktan (oldu cevabı / deneme bitişi) N gün sonra TEK e-posta (zorlamadan):
--    kısa giriş + tıklanabilir yıldızlar → aynı görünümde sayfa (/yorum, giriş gerekmez) → Genel puan + ayardaki
--    sorular + yorum. Sorular settings.review_request'te (sonradan değiştirilebilir); cevaplar kendini anlatan
--    biçimde (soru metniyle) order_reviews.answers'a yazılır → soru değişse de eski cevaplar okunur.
-- B) N gün (90) gelmeyip geri dönen, kampanya izni olan üye birkaç saat içinde almadıysa: kişiye özel %10,
--    10 gün geçerli kupon hesabına tanımlanır + e-posta (kampanya kuyruğu → izin gönderim anında yeniden denetlenir).
-- İşleyici: src/lib/review-winback.ts (dakikalık cron içinde saatte bir).

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS review_request jsonb NOT NULL DEFAULT '{
    "enabled": true,
    "delay_days": 15,
    "questions": [
      {"key": "comfort", "label": "Rahatlık", "type": "stars"},
      {"key": "fit", "label": "Numara / kalıp", "type": "choice", "options": ["Küçük geldi", "Tam oldu", "Büyük geldi"]},
      {"key": "quality", "label": "Kalite / işçilik", "type": "stars"}
    ]
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS winback jsonb NOT NULL DEFAULT '{
    "enabled": true,
    "idle_days": 90,
    "wait_hours": 2,
    "percent": 10,
    "valid_days": 10,
    "cooldown_days": 180
  }'::jsonb;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS review_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_token text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_review_token ON public.orders(review_token) WHERE review_token IS NOT NULL;

-- Yeni biçim yorum: genel puan + cevaplar; eski 3 puan (kargo / kalite / iletişim) artık zorunlu değil
ALTER TABLE public.order_reviews
  ADD COLUMN IF NOT EXISTS rating_overall smallint CHECK (rating_overall BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{key, label, type, value}]
  ADD COLUMN IF NOT EXISTS source text;                                  -- email | account
ALTER TABLE public.order_reviews ALTER COLUMN rating_shipping DROP NOT NULL;
ALTER TABLE public.order_reviews ALTER COLUMN rating_quality DROP NOT NULL;
ALTER TABLE public.order_reviews ALTER COLUMN rating_communication DROP NOT NULL;

-- Geri dönen üye: son görülme (last_active_at) idle_days'ten eskiyken yeniden görülürse işaretle
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS winback_detected_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.detect_winback()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w jsonb;
BEGIN
  IF OLD.last_active_at IS NULL OR NEW.last_active_at IS NULL OR NEW.last_active_at <= OLD.last_active_at THEN RETURN NEW; END IF;
  SELECT s.winback INTO w FROM public.settings s ORDER BY s.id LIMIT 1;
  IF coalesce((w ->> 'enabled')::boolean, false)
     AND NEW.last_active_at - OLD.last_active_at >= make_interval(days => coalesce((w ->> 'idle_days')::int, 90)) THEN
    NEW.winback_detected_at := NEW.last_active_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.detect_winback() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_detect_winback ON public.profiles;
CREATE TRIGGER trg_detect_winback BEFORE UPDATE OF last_active_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.detect_winback();

-- Düzenlenebilir e-posta şablonları (CRM › E-posta Şablonları)
-- review_request değişkenleri: {{customer_name}} {{product_names}} {{stars_html}} {{store_url}} {{store_name}}
INSERT INTO public.email_templates (trigger, subject, body_html, is_active)
SELECT 'review_request',
  '{{store_name}} — Deneyimini paylaşır mısın?',
  '<h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">Ayakkabını iki haftadır kullanıyorsun 👣</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba {{customer_name}}, {{product_names}} ile ilk haftaların nasıl geçti? Deneyimin, barefoot''a geçmeyi düşünen diğer müşterilerimize çok yardımcı olacak.</p>
<p style="font-size:15px;color:#111827;font-weight:700;margin:0 0 8px;text-align:center">Genel olarak kaç puan verirsin?</p>
<div style="text-align:center;margin:0 0 6px">{{stars_html}}</div>
<p style="font-size:12px;color:#6b7280;text-align:center;margin:0">Bir yıldıza dokun, birkaç kısa soru açılacak.</p>',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE trigger = 'review_request');

-- winback değişkenleri: {{customer_name}} {{coupon_code}} {{coupon_percent}} {{coupon_expires}} {{store_url}} {{store_name}}
INSERT INTO public.email_templates (trigger, subject, body_html, is_active)
SELECT 'winback',
  '{{store_name}} — Seni özledik, sana özel %{{coupon_percent}} indirim',
  '<h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">Seni yeniden görmek güzel 🌿</h1>
<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba {{customer_name}}, uzun bir aradan sonra uğradığını gördük. Sana özel <b>%{{coupon_percent}} indirim</b> tanımladık; hesabında hazır, ödeme sayfasında seçmen yeterli.</p>
<div style="text-align:center;margin:0 0 14px"><span style="display:inline-block;border:2px dashed #4d7c0f;border-radius:10px;padding:10px 18px;font-size:18px;font-weight:800;letter-spacing:1px;color:#3f6212">{{coupon_code}}</span></div>
<p style="font-size:13px;color:#6b7280;text-align:center;margin:0 0 16px">Son kullanım: {{coupon_expires}}</p>
<div style="text-align:center"><a href="{{store_url}}/magaza" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:14px">Alışverişe dön</a></div>',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE trigger = 'winback');
