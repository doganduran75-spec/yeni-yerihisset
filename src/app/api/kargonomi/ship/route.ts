import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import {
  createShipment,
  findStateId,
  findCityId,
} from "@/lib/kargonomi";

interface ShippingAddress {
  name?: string;
  phone?: string;
  address?: string;
  district?: string; // ilçe
  city?: string;     // il
}

export async function POST(req: NextRequest) {
  // Admin auth check
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Admin role check
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (adminProfile?.role !== "admin") {
    return NextResponse.json({ error: "Admin yetkisi gerekli." }, { status: 403 });
  }

  // Parse request body
  let orderId: string;
  let desi: number;

  try {
    const body = await req.json();
    orderId = body.order_id;
    desi = Number(body.desi);
    if (!orderId) throw new Error("order_id eksik");
    if (!desi || desi <= 0) throw new Error("Geçerli bir desi değeri girin");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Geçersiz istek." },
      { status: 400 }
    );
  }

  // Fetch order with profile info
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, shipping_address, profiles(first_name, last_name, phone)")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
  }

  // Already shipped? — query as any to bypass stale generated types
  const existingRaw = await (supabase
    .from("orders")
    .select("kargonomi_tracking_code")
    .eq("id", orderId)
    .single() as any) as { data: { kargonomi_tracking_code?: string | null } | null };

  const existingOrder = existingRaw.data;

  if (existingOrder?.kargonomi_tracking_code) {
    return NextResponse.json(
      {
        error: "Bu sipariş zaten kargoya verilmiş.",
        tracking_code: existingOrder.kargonomi_tracking_code,
      },
      { status: 409 }
    );
  }

  // Parse shipping address (stored as JSON string or object)
  let addr: ShippingAddress = {};
  try {
    const raw = (order as any).shipping_address;
    addr = typeof raw === "string" ? JSON.parse(raw) : raw ?? {};
  } catch {
    return NextResponse.json(
      { error: "Sipariş adres bilgisi okunamadı." },
      { status: 422 }
    );
  }

  const cityName = addr.city ?? "";
  const districtName = addr.district ?? "";

  if (!cityName) {
    return NextResponse.json(
      { error: "Sipariş adresinde şehir bilgisi eksik." },
      { status: 422 }
    );
  }

  // Kargonomi credentials — settings tablosundan oku, env'e fallback yap
  const { data: settingsRow } = await (supabase
    .from("settings")
    .select("kargonomi_api_token, kargonomi_warehouse_id")
    .limit(1)
    .single() as any) as {
      data: { kargonomi_api_token?: string; kargonomi_warehouse_id?: string } | null
    };

  const kargonomiToken = settingsRow?.kargonomi_api_token || process.env.KARGONOMI_API_TOKEN || "";
  const kargonomiWarehouseId = settingsRow?.kargonomi_warehouse_id || process.env.KARGONOMI_WAREHOUSE_ID || "";

  if (!kargonomiToken) {
    return NextResponse.json(
      { error: "Kargonomi API Token ayarlanmamış. Admin > Ayarlar > Kargonomi bölümünden girin." },
      { status: 500 }
    );
  }
  if (!kargonomiWarehouseId) {
    return NextResponse.json(
      { error: "Kargonomi Depo ID ayarlanmamış. Admin > Ayarlar > Kargonomi bölümünden girin." },
      { status: 500 }
    );
  }

  // Resolve Kargonomi IDs
  let stateId: number;
  let cityId: number;

  try {
    stateId = await findStateId(cityName, kargonomiToken);
    cityId = await findCityId(stateId, districtName, kargonomiToken);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Adres eşleştirme hatası." },
      { status: 422 }
    );
  }

  // Build buyer info from order profile join
  const orderProfile = (order as any).profiles as {
    first_name?: string;
    last_name?: string;
    phone?: string;
  } | null;

  const joinedName = [orderProfile?.first_name, orderProfile?.last_name].filter(Boolean).join(" ");
  const buyerName = addr.name ?? (joinedName || "Müşteri");

  const buyerPhone = addr.phone ?? orderProfile?.phone ?? "";

  // Create shipment on Kargonomi — token ve warehouseId settings'ten geliyor
  let shipment;
  try {
    shipment = await createShipment(
      {
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        buyer_address: addr.address ?? "",
        buyer_state_id: stateId,
        buyer_city_id: cityId,
        warehouse_id: kargonomiWarehouseId,
        desi,
        reference_no: orderId.slice(0, 16).toUpperCase(),
      },
      kargonomiToken
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kargonomi API hatası." },
      { status: 502 }
    );
  }

  const trackingCode = String(shipment.tracking_code ?? shipment.id ?? "");
  const shipmentId = String(shipment.id ?? "");

  // Persist to DB + update status to shipped — cast to any for new columns
  const { error: updateErr } = await (supabase
    .from("orders")
    .update({
      status: "shipped",
      kargonomi_shipment_id: shipmentId,
      kargonomi_tracking_code: trackingCode,
    } as any) as any)
    .eq("id", orderId);

  if (updateErr) {
    console.error("Kargo kaydı DB'ye yazılamadı:", updateErr);
    // Still return success — shipment was created on Kargonomi side
  }

  // Fire shipped notification (non-blocking)
  fetch(`${req.nextUrl.origin}/api/notifications/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trigger: "order_shipped",
      orderId,
    }),
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    tracking_code: trackingCode,
    shipment_id: shipmentId,
    label_url: shipment.label_url ?? null,
  });
}
