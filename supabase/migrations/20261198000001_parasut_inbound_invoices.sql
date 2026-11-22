-- PARAŞÜT GELEN E-FATURALAR (kullanıcı 2026-11-22): gelen e-fatura panelde listelenir, "Kabul et ve kaydet" ile
-- Paraşüt'te kabul edilir + gider olarak kaydedilir + kurala göre kasa / kategori / etiket uygulanır.
--   • Fatura bize Paraşüt'ün "gelen e-fatura" bildirimiyle (webhook) gelir: /api/parasut/webhook (X-Client-Key).
--   • Kural: firma adı içerir / VKN → kasa (ödendi), gider kategorisi, etiket(ler). Kurala uymayan elle seçilir.
--   • Paraşüt'te elle işlenen fatura panelden düşer ("Paraşüt'te işlendi").
-- Tablolar yalnız sunucudan yazılır; yönetici yalnız okur (pano sayısı). Tekrar çalıştırmak güvenli.

CREATE TABLE IF NOT EXISTS public.parasut_inbound_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  match_name text,                         -- fatura gönderen firmanın adında geçen kelime (büyük/küçük harf, nokta, tire fark etmez)
  match_vkn text,                          -- ya da VKN (tam eşleşme, öncelikli)
  account_id text, account_name text,      -- kasa / banka (ödendi sayılırsa)
  category_id text, category_name text,    -- gider kategorisi (Paraşüt: Expenditure)
  tag_ids text[] NOT NULL DEFAULT '{}', tag_names text[] NOT NULL DEFAULT '{}',
  mark_paid boolean NOT NULL DEFAULT true,
  details boolean NOT NULL DEFAULT true,   -- faturadaki kalemler (isimleriyle) aktarılsın
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parasut_inbound_rules_match_chk CHECK (coalesce(btrim(match_name), '') <> '' OR coalesce(btrim(match_vkn), '') <> '')
);

CREATE TABLE IF NOT EXISTS public.parasut_inbound_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  e_invoice_id text NOT NULL UNIQUE,       -- Paraşüt e_invoices id
  uuid text, from_vkn text, contact_name text,
  issue_date date, net_total numeric, currency text,
  scenario text, item_type text, is_answerable boolean, response_type text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'manual', 'ignored', 'error')),
  rule_id uuid REFERENCES public.parasut_inbound_rules(id) ON DELETE SET NULL,
  -- işlenirken seçilen (kural ya da elle)
  account_id text, category_id text, tag_ids text[] NOT NULL DEFAULT '{}', mark_paid boolean, details boolean,
  -- kaldığı yerden devam: kabul → gider kaydı → kategori → etiket → ödeme
  accepted_at timestamptz, purchase_bill_id text, category_done boolean NOT NULL DEFAULT false,
  tags_done boolean NOT NULL DEFAULT false, paid boolean NOT NULL DEFAULT false,
  error text, note text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz, processed_by uuid,
  checked_at timestamptz,                  -- Paraşüt'ten son okunma (elle işlendi mi?)
  raw jsonb
);
CREATE INDEX IF NOT EXISTS parasut_inbound_invoices_status_idx ON public.parasut_inbound_invoices (status, received_at DESC);

ALTER TABLE public.parasut_inbound_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parasut_inbound_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parasut_inbound_rules FROM anon, authenticated;
REVOKE ALL ON public.parasut_inbound_invoices FROM anon, authenticated;
GRANT SELECT ON public.parasut_inbound_invoices TO authenticated;
DROP POLICY IF EXISTS "Admins read inbound invoices" ON public.parasut_inbound_invoices;
CREATE POLICY "Admins read inbound invoices" ON public.parasut_inbound_invoices
  FOR SELECT TO authenticated USING (public.is_admin());

-- Bildirim (webhook) anahtarı — parasut_auth tarayıcıya kapalı
ALTER TABLE public.parasut_auth
  ADD COLUMN IF NOT EXISTS webhook_key text,
  ADD COLUMN IF NOT EXISTS webhook_id text,
  ADD COLUMN IF NOT EXISTS webhook_uri text,
  ADD COLUMN IF NOT EXISTS webhook_at timestamptz;

-- Kullanıcının verdiği ilk kurallar (kasa / kategori / etiket adlarıyla; Paraşüt'teki kimlikleri ilk işlemde bulunur)
INSERT INTO public.parasut_inbound_rules (name, match_name, account_name, category_name, tag_names, sort_order)
SELECT 'DSM Grup (Trendyol)', 'DSM Grup', 'Trendyol', 'Ürün', ARRAY['Trendyol'], 10
WHERE NOT EXISTS (SELECT 1 FROM public.parasut_inbound_rules WHERE match_name = 'DSM Grup');
INSERT INTO public.parasut_inbound_rules (name, match_name, account_name, category_name, tag_names, sort_order)
SELECT 'D Market (Hepsiburada)', 'D Market', 'Hepsiburada', 'Ürün', ARRAY['Hepsiburada'], 20
WHERE NOT EXISTS (SELECT 1 FROM public.parasut_inbound_rules WHERE match_name = 'D Market');
