-- E-posta şablonlarındaki mavi (eski tema) renkleri sitenin zeytin paletine çevir.
-- Yalnız bilinen mavi tonları değiştirir; admin'in düzenlediği metin/yapı korunur.
-- Tekrar çalıştırmak güvenli (idempotent).
UPDATE public.email_templates
SET body_html =
  replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(replace(replace(replace(replace(body_html,
    '#1d4ed8', '#536430'), '#1D4ED8', '#536430'),
    '#2563eb', '#536430'), '#2563EB', '#536430'),
    '#1e40af', '#3d4a22'), '#1E40AF', '#3d4a22'),
    '#3b82f6', '#879b60'), '#3B82F6', '#879b60'),
    '#93c5fd', '#c6c8b8'), '#93C5FD', '#c6c8b8'),
    '#bfdbfe', '#c6c8b8'), '#BFDBFE', '#c6c8b8'),
    '#eff6ff', '#f4f4ef'), '#EFF6FF', '#f4f4ef')
WHERE body_html ~* '#(1d4ed8|2563eb|1e40af|3b82f6|93c5fd|bfdbfe|eff6ff)';
