-- Fatura PDF deposu (20261120): boyut sınırı + yalnız PDF (veritabanı güvenliği denetimi: sınırsız kova olmasın)
UPDATE storage.buckets
   SET file_size_limit = 10485760,  -- 10 MB
       allowed_mime_types = ARRAY['application/pdf']
 WHERE id = 'invoices';
