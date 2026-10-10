-- VİDEO / MEDYA KOVASI (2026-10-10): Ayarlar › Genel › Mobil karşılama videosu › "Video yükle".
-- Herkes izler (public URL), yalnız yönetici yükler/siler. Yalnız video, en çok 25 MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media', 'media', true, 26214400, ARRAY['video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 26214400, allowed_mime_types = ARRAY['video/mp4', 'video/webm'];

DROP POLICY IF EXISTS yh_storage_media_admin ON storage.objects;
CREATE POLICY yh_storage_media_admin ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'media' AND public.is_admin())
  WITH CHECK (bucket_id = 'media' AND public.is_admin());

SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'media';
