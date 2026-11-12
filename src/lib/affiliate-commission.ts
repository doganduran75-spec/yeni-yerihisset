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

// ── KENDİ SİPARİŞİ OLABİLİR (kullanıcı 2026-11-12) ─────────────────────────────────────────────────────────────
// Ortak kendi linkiyle / kuponuyla alışveriş yapıp BAŞKA bir e-posta yazarsa (misafir ya da ikinci hesap) sipariş
// "başka müşteri" görünür. Teslimat telefonu, adresi ya da alıcı adı ortağın profil / kayıtlı adresleriyle aynıysa
// sipariş şüpheli sayılır: hakedişte varsayılan olarak komisyon yazılmaz, yönetici isterse dahil eder.
export type AffIdentity = { name?: string | null; phones: string[]; addresses: { address?: string | null; district?: string | null; city?: string | null }[]; names: string[] };
export type ShipAddr = { name?: string | null; phone?: string | null; address?: string | null; district?: string | null; city?: string | null };

const trNorm = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr-TR")
  .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const phoneNorm = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);
const addrKey = (a: { address?: string | null; district?: string | null; city?: string | null }) => {
  const k = trNorm(`${a.address ?? ""} ${a.district ?? ""} ${a.city ?? ""}`).replace(/\s/g, "");
  return k.length >= 12 ? k : ""; // çok kısa adres eşleşmesi anlamsız
};

/** Sipariş ortağın kendisine ait olabilir mi? → nedeni (telefon / adres / ad) ya da null */
export function selfOrderSuspect(ship: ShipAddr | null | undefined, aff: AffIdentity | null | undefined): string | null {
  if (!ship || !aff) return null;
  const p = phoneNorm(ship.phone);
  if (p.length === 10 && aff.phones.map(phoneNorm).includes(p)) return "telefon ortağınkiyle aynı";
  const ak = addrKey(ship);
  if (ak && aff.addresses.map(addrKey).includes(ak)) return "teslimat adresi ortağınkiyle aynı";
  const n = trNorm(ship.name);
  if (n.includes(" ") && aff.names.map(trNorm).includes(n)) return "alıcı adı ortağınkiyle aynı";
  return null;
}

/** orders.shipping_address (JSON metin ya da nesne) → ShipAddr */
export function parseShip(v: unknown): ShipAddr | null {
  if (!v) return null;
  if (typeof v === "object") return v as ShipAddr;
  try { return JSON.parse(String(v)); } catch { return null; }
}
