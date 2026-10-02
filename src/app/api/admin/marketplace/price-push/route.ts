import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { pushPrices } from "@/lib/marketplace/price-sync";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Fiyatlar sayfası → seçili varyantların pazaryeri fiyatlarını (Trendyol satış+PSF,
// Hepsiburada satış) kuyruğa al ve gönder. Yalnız admin. Açık olmayan kanalın satırları bekler.
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { variantIds } = (await req.json().catch(() => ({}))) as { variantIds?: string[] };
  const ids = [...new Set((variantIds || []).filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 20000);
  if (!ids.length) return NextResponse.json({ error: "Gönderilecek varyant yok" }, { status: 400 });

  try {
    const r = await pushPrices(ids, supabase);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gönderilemedi" }, { status: 500 });
  }
}
