-- CRM: Müşteri İletişim Modülü
-- Email şablonları, push token yönetimi, SMTP/GA ayarları, bildirim logu

-- Settings tablosuna SMTP ve Google Analytics alanları ekle
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS smtp_host text,
  ADD COLUMN IF NOT EXISTS smtp_port integer DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_secure boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS smtp_user text,
  ADD COLUMN IF NOT EXISTS smtp_password text,
  ADD COLUMN IF NOT EXISTS smtp_from_name text,
  ADD COLUMN IF NOT EXISTS smtp_from_email text,
  ADD COLUMN IF NOT EXISTS ga_measurement_id text;

-- Email şablonları tablosu
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL UNIQUE CHECK (trigger IN (
    'order_placed',
    'order_paid',
    'order_shipped',
    'order_delivered',
    'order_cancelled'
  )),
  subject text NOT NULL,
  body_html text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tablo daha önce UNIQUE constraint olmadan oluşturulduysa ekle
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_templates_trigger_key'
      AND conrelid = 'email_templates'::regclass
  ) THEN
    ALTER TABLE email_templates
      ADD CONSTRAINT email_templates_trigger_key UNIQUE (trigger);
  END IF;
END $$;

-- Push token tablosu (Expo push bildirimleri için)
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Bildirim logu tablosu
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  order_id uuid,
  trigger text,
  channel text CHECK (channel IN ('email', 'push')),
  status text CHECK (status IN ('sent', 'failed', 'skipped')),
  recipient text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage email_templates"
  ON email_templates FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Public read active email_templates"
  ON email_templates FOR SELECT USING (true);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own push_tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read notification_log"
  ON notification_log FOR SELECT USING (is_admin());
CREATE POLICY "Insert notification_log"
  ON notification_log FOR INSERT WITH CHECK (true);

-- updated_at trigger
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Varsayılan email şablonları
INSERT INTO email_templates (trigger, subject, body_html) VALUES

('order_placed', 'Siparişiniz Alındı! 🎉 - #{{order_id}}',
$template$
<h2 style="color:#1e293b;font-size:22px;margin:0 0 16px 0;">Siparişiniz başarıyla oluşturuldu!</h2>
<p style="color:#475569;margin:0 0 12px 0;">Merhaba <strong>{{customer_name}}</strong>,</p>
<p style="color:#475569;margin:0 0 24px 0;">Siparişinizi aldık ve en kısa sürede hazırlanmaya başlanacaktır.</p>

<div style="background:#f1f5f9;border-radius:8px;padding:20px;margin:0 0 24px 0;">
  <p style="margin:0 0 6px 0;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Sipariş Özeti</p>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:4px 0;color:#334155;font-size:14px;"><strong>Sipariş No:</strong></td><td style="padding:4px 0;color:#334155;font-size:14px;">#{{order_id}}</td></tr>
    <tr><td style="padding:4px 0;color:#334155;font-size:14px;"><strong>Tarih:</strong></td><td style="padding:4px 0;color:#334155;font-size:14px;">{{order_date}}</td></tr>
    <tr><td style="padding:4px 0;color:#334155;font-size:14px;"><strong>Tutar:</strong></td><td style="padding:4px 0;color:#1d4ed8;font-size:16px;font-weight:700;">{{order_total}}</td></tr>
  </table>
</div>

{{order_items_html}}

<div style="text-align:center;margin-top:32px;">
  <a href="{{store_url}}/account?utm_source=email&utm_medium=transactional&utm_campaign=order_placed" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">Siparişimi Görüntüle</a>
</div>
$template$),

('order_paid', 'Ödemeniz Onaylandı ✅ - Sipariş #{{order_id}}',
$template$
<h2 style="color:#1e293b;font-size:22px;margin:0 0 16px 0;">Ödemeniz başarıyla alındı!</h2>
<p style="color:#475569;margin:0 0 12px 0;">Merhaba <strong>{{customer_name}}</strong>,</p>
<p style="color:#475569;margin:0 0 24px 0;"><strong>₺{{order_total}}</strong> tutarındaki ödemeniz onaylandı. Siparişiniz hazırlanmaya başlandı.</p>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:0 0 24px 0;">
  <p style="margin:0;color:#166534;font-weight:600;font-size:14px;">✓ Sipariş #{{order_id}} hazırlanıyor</p>
</div>

<div style="text-align:center;margin-top:32px;">
  <a href="{{store_url}}/account?utm_source=email&utm_medium=transactional&utm_campaign=order_paid" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">Siparişimi Takip Et</a>
</div>
$template$),

('order_shipped', 'Siparişiniz Kargoya Verildi! 🚚 - #{{order_id}}',
$template$
<h2 style="color:#1e293b;font-size:22px;margin:0 0 16px 0;">Siparişiniz yola çıktı!</h2>
<p style="color:#475569;margin:0 0 12px 0;">Merhaba <strong>{{customer_name}}</strong>,</p>
<p style="color:#475569;margin:0 0 24px 0;">Sipariş #{{order_id}} numaralı siparişiniz kargoya verildi ve yolda!</p>

{{tracking_html}}

<div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;margin:0 0 24px 0;">
  <p style="margin:0 0 4px 0;color:#6b21a8;font-size:13px;font-weight:700;">📦 Teslimat Adresi</p>
  <p style="margin:0;color:#7e22ce;font-size:13px;">{{shipping_address}}</p>
</div>

<div style="text-align:center;margin-top:32px;">
  <a href="{{store_url}}/account?utm_source=email&utm_medium=transactional&utm_campaign=order_shipped" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">Kargo Takibi</a>
</div>
$template$),

('order_delivered', 'Siparişiniz Teslim Edildi! 🎁 - #{{order_id}}',
$template$
<h2 style="color:#1e293b;font-size:22px;margin:0 0 16px 0;">Siparişiniz teslim edildi!</h2>
<p style="color:#475569;margin:0 0 12px 0;">Merhaba <strong>{{customer_name}}</strong>,</p>
<p style="color:#475569;margin:0 0 24px 0;">Sipariş #{{order_id}} teslim edildi. Umarız yeni alışverişinizden memnun kalmışsınızdır!</p>

<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:20px;margin:0 0 24px 0;text-align:center;">
  <p style="margin:0 0 8px 0;color:#9a3412;font-size:15px;font-weight:600;">Deneyiminizi değerlendirin ⭐</p>
  <p style="margin:0 0 16px 0;color:#c2410c;font-size:13px;">Görüşleriniz bizim için çok değerli.</p>
  <a href="{{store_url}}/account?utm_source=email&utm_medium=transactional&utm_campaign=order_delivered#review" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:700;font-size:14px;">Yorum Yaz</a>
</div>

<div style="text-align:center;">
  <a href="{{store_url}}?utm_source=email&utm_medium=transactional&utm_campaign=order_delivered" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">Alışverişe Devam Et</a>
</div>
$template$),

('order_cancelled', 'Siparişiniz İptal Edildi - #{{order_id}}',
$template$
<h2 style="color:#1e293b;font-size:22px;margin:0 0 16px 0;">Siparişiniz iptal edildi</h2>
<p style="color:#475569;margin:0 0 12px 0;">Merhaba <strong>{{customer_name}}</strong>,</p>
<p style="color:#475569;margin:0 0 24px 0;">Sipariş #{{order_id}} numaralı siparişiniz iptal edildi.</p>

<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:0 0 24px 0;">
  <p style="margin:0;color:#dc2626;font-size:14px;">Ödeme yapıldıysa 3-5 iş günü içinde iadeniz gerçekleştirilecektir.</p>
</div>

<p style="color:#64748b;font-size:13px;margin:0 0 24px 0;">Herhangi bir sorunuz varsa <a href="mailto:{{store_email}}" style="color:#1d4ed8;">{{store_email}}</a> adresine ulaşabilirsiniz.</p>

<div style="text-align:center;">
  <a href="{{store_url}}?utm_source=email&utm_medium=transactional&utm_campaign=order_cancelled" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">Alışverişe Devam Et</a>
</div>
$template$)

ON CONFLICT (trigger) DO NOTHING;
