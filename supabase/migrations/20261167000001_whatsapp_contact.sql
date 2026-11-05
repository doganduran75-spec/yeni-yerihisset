-- İletişim — WhatsApp (kullanıcı 2026-11-05): Bulutfon numarası WhatsApp Business'ta; telefonla arama alınmıyor.
-- Künyede "Telefon / WhatsApp (yalnız WhatsApp mesajı)" + İletişim sayfasında WhatsApp düğmesi (wa.me bağlantısı, script yok).
-- Ayarlar › Sayfalar › Şirket künyesi. Sayfalar sunucuda okur → anon / authenticated'a GRANT yok.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS contact_whatsapp text,                          -- boşsa telefon numarası kullanılır
  ADD COLUMN IF NOT EXISTS contact_whatsapp_only boolean NOT NULL DEFAULT false, -- telefon yalnız WhatsApp mesajı
  ADD COLUMN IF NOT EXISTS contact_whatsapp_hours text,                    -- ör. "Hafta içi 09:00 – 18:00 yanıtlanır"
  ADD COLUMN IF NOT EXISTS whatsapp_button boolean NOT NULL DEFAULT true;  -- İletişim sayfasında WhatsApp düğmesi
