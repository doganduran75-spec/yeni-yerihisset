/* eslint-disable @typescript-eslint/no-explicit-any */
// HEPSİBURADA PAKETLEME ("Paket hazır" akışı, kullanıcı kararı 2026-10-26). Hepsiburada'da kargo barkodu (takip kodu)
// ve paket numarası sipariş PAKETLENİNCE oluşur; fatura bağlantısı da paket numarasına yüklenir. Sıra:
//   Paket hazır → paketle (bu dosya) → Paraşüt faturası → fatura bağlantısı Hepsiburada'ya → barkod gelince etiket.
// İstek: POST oms-external …/packages/merchantid/{m} { parcelQuantity, deci, lineItemRequests: [{ id, quantity }] }
// (Hepsiburada test merkezindeki "paketle" adımıyla aynı — src/app/api/admin/hepsiburada-sit). Barkod hemen
// dönmezse sipariş senkronu (paket listesi) birkaç dakika içinde getirir.
import type { createAdminClient } from "@/lib/supabase-admin";
import { getHepsiburadaConfig, hbHasCredentials } from "@/lib/marketplace/hepsiburada";

type Sb = ReturnType<typeof createAdminClient>;

const hostOf = (stage: boolean) => (stage ? "https://oms-external-sit.hepsiburada.com" : "https://oms-external.hepsiburada.com");
const pick = (o: any, ...k: string[]) => { for (const x of k) if (o?.[x] !== undefined && o?.[x] !== null) return o[x]; return undefined; };

export async function hbPackageOrder(sb: Sb, orderId: string): Promise<{ packageNumber: string | null; tracking: string | null; already?: boolean }> {
  const s = sb as any;
  const { data: o } = await s.from("orders").select("id, channel, external_package_id, mp_package_number, cargo_tracking_number").eq("id", orderId).maybeSingle();
  if (!o || o.channel !== "hepsiburada") throw new Error("Yalnız Hepsiburada siparişi.");
  if (o.mp_package_number) return { packageNumber: o.mp_package_number, tracking: o.cargo_tracking_number, already: true };
  const c = await getHepsiburadaConfig(sb);
  if (!hbHasCredentials(c)) throw new Error("Hepsiburada bağlantı bilgileri eksik (Ayarlar › Entegrasyonlar).");
  const { data: items } = await s.from("order_items").select("external_line_id, quantity, returned_qty").eq("order_id", orderId);
  const lines = ((items as any[]) || []).filter((i) => i.external_line_id && Number(i.quantity) - Number(i.returned_qty || 0) > 0)
    .map((i) => ({ id: String(i.external_line_id), quantity: Number(i.quantity) - Number(i.returned_qty || 0) }));
  if (!lines.length) throw new Error("Paketlenecek Hepsiburada kalemi yok.");
  const { data: st } = await s.from("settings").select("hepsiburada_desi").limit(1).maybeSingle();
  const deci = Math.max(1, Number(st?.hepsiburada_desi) || 2);

  const headers = {
    Authorization: "Basic " + Buffer.from(`${c.merchantId}:${c.serviceKey}`).toString("base64"),
    "User-Agent": c.username, "Content-Type": "application/json", Accept: "application/json",
  };
  const base = `${hostOf(c.stage)}/packages/merchantid/${encodeURIComponent(c.merchantId)}`;
  let res: Response;
  try {
    res = await fetch(base, { method: "POST", headers, body: JSON.stringify({ parcelQuantity: 1, deci, lineItemRequests: lines }), signal: AbortSignal.timeout(25000), cache: "no-store" });
  } catch (e: any) {
    throw new Error(`Hepsiburada'ya bağlanılamadı: ${e?.message || e}`);
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) {
    const msg = (Array.isArray(json?.errors) ? json.errors.map((e: any) => e?.message || e?.errorMessage || e).join("; ") : null)
      || json?.message || json?.title || text?.slice(0, 300) || res.statusText;
    throw new Error(`Hepsiburada paketleme ${res.status}: ${msg}`);
  }

  // Yanıtta paket no / barkod varsa al; yoksa son 24 saatin paket listesinde bu siparişi ara
  const first = Array.isArray(json) ? json[0] : json;
  let packageNumber: string | null = pick(first, "packageNumber", "PackageNumber") ? String(pick(first, "packageNumber", "PackageNumber")) : null;
  let tracking: string | null = pick(first, "barcode", "Barcode") ? String(pick(first, "barcode", "Barcode")) : null;
  let cargo: string | null = pick(first, "cargoCompany", "CargoCompany") ?? null;
  if (!packageNumber || !tracking) {
    try {
      const r = await fetch(`${base}?timespan=24&offset=0&limit=50`, { headers, signal: AbortSignal.timeout(25000), cache: "no-store" });
      const j: any = r.ok ? await r.json().catch(() => null) : null;
      const list: any[] = Array.isArray(j) ? j : (pick(j, "items", "Items", "data", "Data", "packages", "Packages") ?? []);
      const lineIds = new Set(lines.map((l) => l.id));
      const pkg = list.find((p) => ((pick(p, "items", "Items") as any[]) || []).some((it) => lineIds.has(String(pick(it, "lineItemId", "LineItemId", "id") ?? "")))
        || String(pick(p, "orderNumber", "OrderNumber") ?? "") === String(o.external_package_id));
      if (pkg) {
        packageNumber = packageNumber || (pick(pkg, "packageNumber", "PackageNumber") ? String(pick(pkg, "packageNumber", "PackageNumber")) : null);
        tracking = tracking || (pick(pkg, "barcode", "Barcode") ? String(pick(pkg, "barcode", "Barcode")) : null);
        cargo = cargo || pick(pkg, "cargoCompany", "CargoCompany") || null;
      }
    } catch { /* senkron getirir */ }
  }

  await s.from("orders").update({
    external_status: "Packaged", external_updated_at: new Date().toISOString(),
    ...(packageNumber ? { mp_package_number: packageNumber } : {}),
    ...(tracking ? { cargo_tracking_number: tracking } : {}),
    ...(cargo ? { cargo_provider: cargo } : {}),
  }).eq("id", orderId);
  await s.from("order_events").insert({ order_id: orderId, type: "note",
    note: `Hepsiburada'da paketlendi (${deci} desi)${packageNumber ? ` — paket no ${packageNumber}` : ""}${tracking ? `, kargo kodu ${tracking}` : " — kargo kodu birkaç dakika içinde gelir"}` });
  return { packageNumber, tracking };
}
