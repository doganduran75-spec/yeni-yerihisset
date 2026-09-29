import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { resolveGuest } from "@/lib/guest-checkout";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Admin "Yeni Sipariş" penceresinden hızlı müşteri ekleme (telefon/Instagram
// satışları). Misafir checkout ile aynı kural: ŞİFRESİZ üye + teslimat adresi.
// Müşteri sonra e-postadaki bağlantıyla şifresini belirler (bağlantı, sipariş
// oluşturulunca /api/admin/orders/create tarafından gönderilir).
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const r = await resolveGuest(supabase, {
    email: body.email, firstName: body.firstName, lastName: body.lastName, phone: body.phone,
    city: body.city, district: body.district, addressDetail: body.addressDetail,
  });
  if (!r.ok) {
    const error = r.code === 409 ? "Bu e-posta ile kayıtlı bir müşteri var — aramadan e-postasıyla bulup seçin." : r.error;
    return NextResponse.json({ error }, { status: r.code });
  }

  const { data: address, error: aErr } = await (supabase as any)
    .from("user_addresses")
    .insert({
      user_id: r.userId, address_name: "Ev", ...r.address,
      is_corporate: false, is_default_shipping: true, is_default_billing: true,
    })
    .select("*")
    .single();
  if (aErr) console.error("[admin/customers/create] adres:", aErr.message);

  return NextResponse.json({
    ok: true,
    customer: {
      id: r.userId, email: r.email,
      first_name: r.address.first_name, last_name: r.address.last_name, phone: r.address.phone,
    },
    address: address ?? null,
  });
}
