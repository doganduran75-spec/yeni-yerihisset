-- Fatura numarası gelmiş (e-belge resmîleşmiş) ama PDF beklendiği için "Bekleniyor"da kalmış siparişler → "Faturalandı"
-- (kullanıcı 2026-10-31; kod artık numara geldiği an işaretliyor — src/lib/parasut-invoice.ts › checkInvoice)
UPDATE public.orders SET invoice_status = 'invoiced', parasut_invoiced_at = coalesce(parasut_invoiced_at, now())
 WHERE parasut_invoice_no IS NOT NULL AND coalesce(invoice_status, 'pending') = 'pending';
