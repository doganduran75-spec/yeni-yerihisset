-- "İADE GELECEK" (kullanıcı isteği 2026-10-20): müşteri iadeyi telefonla / mesajla bildirince yönetici siparişte
-- doğrudan iade talebi açar (müşteriye e-posta gitmez). Müşteri ürünü kendisi gönderiyorsa (kod gerekmiyor)
-- talep doğrudan "iade yolda" olur → iade yöntemi 'self'. 4 gün içinde gelmezse bekleyen işlere düşer (order-next-step).
ALTER TABLE public.order_cases DROP CONSTRAINT IF EXISTS order_cases_return_method_check;
ALTER TABLE public.order_cases ADD CONSTRAINT order_cases_return_method_check
  CHECK (return_method IN ('ups', 'surat', 'aras', 'self'));
