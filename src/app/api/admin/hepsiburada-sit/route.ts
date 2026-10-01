import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { getHepsiburadaConfig, hbHasCredentials, hbSitRequest } from "@/lib/marketplace/hepsiburada";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Hepsiburada TEST MERKEZİ — canlı ortam bilgisi almak için Hepsiburada'nın
// test (SIT) ortamında istediği adımlar. YALNIZ "-sit" adreslerine gider.
//  1) Katalog: hızlı ürün yükleme → trackingId → ürün durumu sorgulama
//  2) Listeleme: test envanterini listeleme, stok ve fiyat güncelleme + sonuç sorgulama
//  3) Sipariş: test siparişi oluşturma → ödemesi tamamlanmış siparişleri listeleme →
//     kalem paketleme → paketleri listeleme
// Ham istek/yanıt döner; ekranda gösterilip Hepsiburada'ya iletilir.

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const cfg = await getHepsiburadaConfig(supabase);
  if (!hbHasCredentials(cfg)) {
    return NextResponse.json({ error: "Önce Merchant ID, Servis Anahtarı ve kullanıcı adını girip kaydet." }, { status: 400 });
  }
  const m = encodeURIComponent(cfg.merchantId);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  let request: { service: Parameters<typeof hbSitRequest>[1]; method: "GET" | "POST"; path: string; body?: unknown };

  switch (b.action) {
    // ── 1) Katalog ──
    case "catalog_fastlisting": {
      const barcode = str(b.barcode, 60), merchantSku = str(b.merchantSku, 60), productName = str(b.productName, 200);
      if (!barcode || !merchantSku || !productName) return NextResponse.json({ error: "Barkod, Satıcı Stok Kodu ve ürün adı zorunlu." }, { status: 400 });
      request = {
        service: "mpop", method: "POST", path: "/product/api/products/fastlisting",
        body: [{
          merchant: cfg.merchantId, merchantSku, productName, barcode,
          ...(str(b.stock) ? { stock: str(b.stock, 10) } : {}),
          ...(str(b.price) ? { price: str(b.price, 20) } : {}),
        }],
      };
      break;
    }
    case "catalog_status": {
      const id = str(b.trackingId, 100);
      if (!id) return NextResponse.json({ error: "trackingId gerekli." }, { status: 400 });
      request = { service: "mpop", method: "GET", path: `/product/api/products/status/${encodeURIComponent(id)}?version=1&page=0&size=1000` };
      break;
    }

    // ── 2) Listeleme ──
    case "listings": {
      const offset = Math.max(0, Math.floor(num(b.offset) || 0));
      request = { service: "listing", method: "GET", path: `/listings/merchantid/${m}?offset=${offset}&limit=20` };
      break;
    }
    case "stock_upload": {
      const qty = Math.floor(num(b.qty));
      if (!(qty >= 0)) return NextResponse.json({ error: "Geçerli bir stok adedi gir." }, { status: 400 });
      const item: any = { availableStock: qty };
      if (str(b.hbSku)) item.hepsiburadaSku = str(b.hbSku, 60);
      if (str(b.merchantSku)) item.merchantSku = str(b.merchantSku, 60);
      if (!item.hepsiburadaSku && !item.merchantSku) return NextResponse.json({ error: "Önce listeden bir ürün seç." }, { status: 400 });
      request = { service: "listing", method: "POST", path: `/listings/merchantid/${m}/stock-uploads`, body: [item] };
      break;
    }
    case "stock_status": {
      const id = str(b.id, 100);
      if (!id) return NextResponse.json({ error: "Yükleme id'si gerekli." }, { status: 400 });
      request = { service: "listing", method: "GET", path: `/listings/merchantid/${m}/stock-uploads/id/${encodeURIComponent(id)}` };
      break;
    }
    case "price_upload": {
      const price = num(b.price);
      if (!(price > 0)) return NextResponse.json({ error: "Geçerli bir fiyat gir." }, { status: 400 });
      const item: any = { price: Math.round(price * 100) / 100 };
      if (str(b.hbSku)) item.hepsiburadaSku = str(b.hbSku, 60);
      if (str(b.merchantSku)) item.merchantSku = str(b.merchantSku, 60);
      if (!item.hepsiburadaSku && !item.merchantSku) return NextResponse.json({ error: "Önce listeden bir ürün seç." }, { status: 400 });
      request = { service: "listing", method: "POST", path: `/listings/merchantid/${m}/price-uploads`, body: [item] };
      break;
    }
    case "price_status": {
      const id = str(b.id, 100);
      if (!id) return NextResponse.json({ error: "Yükleme id'si gerekli." }, { status: 400 });
      request = { service: "listing", method: "GET", path: `/listings/merchantid/${m}/price-uploads/id/${encodeURIComponent(id)}` };
      break;
    }

    // ── 3) Sipariş ──
    case "order_create": {
      const price = num(b.price), quantity = Math.max(1, Math.floor(num(b.quantity) || 1));
      if (!(price > 0) || !str(b.merchantSku)) return NextResponse.json({ error: "Önce listeden fiyatı olan bir ürün seç." }, { status: 400 });
      const total = Math.round(price * quantity * 100) / 100;
      request = {
        service: "omsStub", method: "POST", path: `/orders/merchantId/${m}`,
        body: {
          Customer: { CustomerId: randomUUID(), Name: "YeriHisset Test Müşteri" },
          DeliveryAddress: {
            AddressDetail: "Test Mah. Entegrasyon Sok. No:1", AddressId: randomUUID(),
            AlternatePhoneNumber: "05320000000", City: "İstanbul", CountryCode: "TR", District: "Kadıköy",
            Email: "test@yerihisset.com", Name: "YeriHisset Test Müşteri", PhoneNumber: "905320000000",
          },
          LineItems: [{
            CargoCompanyId: 1, DeliveryOptionId: 1,
            ...(str(b.listingId) ? { ListingId: str(b.listingId, 80) } : {}),
            MerchantId: cfg.merchantId, MerchantSku: str(b.merchantSku, 60), Sku: str(b.hbSku, 60),
            Price: { Amount: price, Currency: "TRY" }, Quantity: quantity,
            TotalPrice: { Amount: total, Currency: "TRY" }, Vat: 0, TagList: [], isBnplMP: false,
          }],
          OrderDate: new Date().toISOString(),
          OrderNumber: String(Date.now()).slice(-10),
          PaymentStatus: "Paid",
        },
      };
      break;
    }
    case "orders_list":
      request = { service: "oms", method: "GET", path: `/orders/merchantid/${m}?offset=0&limit=50` };
      break;
    case "package": {
      const id = str(b.lineItemId, 100), quantity = Math.max(1, Math.floor(num(b.quantity) || 1));
      if (!id) return NextResponse.json({ error: "Paketlenecek kalemin id'si gerekli." }, { status: 400 });
      request = { service: "oms", method: "POST", path: `/packages/merchantid/${m}`, body: { parcelQuantity: 1, deci: 1, lineItemRequests: [{ id, quantity }] } };
      break;
    }
    case "packages_list":
      request = { service: "oms", method: "GET", path: `/packages/merchantid/${m}?limit=10&timespan=720` };
      break;

    default:
      return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  }

  const res = await hbSitRequest(cfg, request.service, request.method, request.path, request.body);
  return NextResponse.json({
    ok: true,
    request: { method: request.method, url: res.url, body: request.body ?? null },
    response: { status: res.status, ok: res.ok, json: res.json, text: res.json ? null : res.text },
  });
}
