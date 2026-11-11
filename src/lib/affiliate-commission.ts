// SATIŞ ORTAKLIĞI — bir sipariş kimin komisyonu? (saf; hakediş hesabı + pano hatırlatması aynı kuralı kullanır)
//   * Atıf: siparişteki ortak linki (orders.affiliate_id) ya da ortağa bağlı kupon (coupons.affiliate_id)
//   * Yalnız AKTİF ortak; tamamen iade edilmiş sipariş ve ortağın KENDİ siparişi komisyon getirmez
//   * Hakediş dönemi = siparişin tamamlandığı ay (ödendi + teslim + faturalandı → completed_at; site siparişinde
//     fatura müşteri "oldu" deyince kesilir). Hakediş ödendikten sonraki iade komisyonu geri almaz (kullanıcı 2026-11-11).

export type CommissionOrder = {
  user_id?: string | null;
  affiliate_id?: string | null;
  coupon_id?: string | null;
  refund_status?: string | null;
};
export type CommissionAffiliate = { user_id: string | null; status: string; commission_rate: number };

/** Komisyonun sahibi ortak (affiliate_profiles.id) ya da null */
export function commissionOwner(
  o: CommissionOrder,
  couponAff: Record<string, string | null | undefined>,
  affs: Record<string, CommissionAffiliate | undefined>,
): string | null {
  if (o.refund_status === "full") return null;
  const id = o.affiliate_id || (o.coupon_id ? couponAff[o.coupon_id] ?? null : null);
  if (!id) return null;
  const a = affs[id];
  if (!a || a.status !== "active") return null;
  if (o.user_id && a.user_id === o.user_id) return null; // ortağın kendi siparişi (kendi kuponuyla da)
  return id;
}

/** Hakediş dönemi (YYYY-MM) — hesap ayı UTC sınırlarıyla (src/app/api/admin/affiliate/payout) */
export function commissionPeriod(completedAt: string | null | undefined): string | null {
  if (!completedAt) return null;
  const d = new Date(completedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-10" → "Ekim 2026" */
export function periodLabel(period: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || ""));
  if (!m) return String(period || "");
  const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  return `${AY[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Bu ayın başı (UTC) — bundan önce tamamlanıp hakedişi işlenmemiş siparişler "hakediş işlenecek" */
export function currentPeriodStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
