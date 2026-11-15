-- E-POSTA ONAYI (kullanıcı 2026-11-15, canlıya geçiş): müşteriye giden bir e-posta türü (şablon) ilk kez
-- gönderileceğinde gönderilmez, onay kuyruğuna düşer (Pano › Bugünün işleri › "Onay bekleyen e-posta",
-- /admin/email-onay). Yönetici e-postayı görüp "Gönder" deyince gönderilir VE o tür onaylanmış sayılır →
-- sonraki aynı tür e-postalar doğrudan gider. Bir tam döngüde tüm şablonlar onaylanmış olur.
-- Kural kodu: src/lib/mail-guard.ts (tek gönderim noktası) + src/lib/email-approval.ts.
-- Yöneticiye / mağazanın kendi adreslerine giden e-postalar onaya düşmez. E-posta kilidi açıkken (staging)
-- müşteri e-postası zaten engellendiği için kuyruk yalnız kilit kapatılınca (canlı) dolar.

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS email_approval_enabled boolean NOT NULL DEFAULT true;

-- Onaylanmış türler (şablon anahtarı: sipariş tetikleyicisi, "password_recovery" vb.)
CREATE TABLE IF NOT EXISTS public.email_approved_kinds (
  kind        text PRIMARY KEY,
  label       text,
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Bekleyen (ve karar verilmiş) e-postalar. payload: from / to / cc / bcc / replyTo / text / ekler (base64)
CREATE TABLE IF NOT EXISTS public.email_approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL,
  label       text,
  recipient   text NOT NULL,
  subject     text,
  html        text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'discarded', 'failed')),
  decided_at  timestamptz,
  decided_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  error       text
);
CREATE INDEX IF NOT EXISTS idx_email_approvals_status ON public.email_approvals (status, created_at DESC);

-- Yalnız sunucu (service role) — panel kendi ucundan okur
ALTER TABLE public.email_approved_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_approved_kinds FROM anon, authenticated;
REVOKE ALL ON public.email_approvals FROM anon, authenticated;

-- Yeni onay bekleyen e-posta → Telegram "E-posta onayı" konusu (src/lib/telegram.ts › composeRefMessage)
DROP TRIGGER IF EXISTS trg_telegram_email_approval ON public.email_approvals;
CREATE TRIGGER trg_telegram_email_approval AFTER INSERT ON public.email_approvals
  FOR EACH ROW WHEN (NEW.status = 'pending') EXECUTE FUNCTION public.telegram_enqueue_ref('email_approval');

NOTIFY pgrst, 'reload schema';
