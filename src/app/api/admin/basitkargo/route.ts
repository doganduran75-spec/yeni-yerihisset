/* eslint-disable @typescript-eslint/no-explicit-any */
// Ayarlar › Entegrasyonlar › Basit Kargo + siparişte resmî etiket. Yalnız yönetici. API token HİÇBİR yanıtta dönmez.
//   POST { op: "status" }                         → açık mı, token kayıtlı mı, hesap durumu, bakiye, adresler, webhook adresi
//   POST { op: "save", token?, addressId?, enabled? } → kaydet (token /firm/status ile doğrulanır)
//   POST { op: "webhook_key" }                    → webhook anahtarı üret / yenile (eski adres çalışmaz)
//   POST { op: "remove_token" }                   → token'ı sil + kapat
//   POST { op: "label", orderId }                 → resmî etiket (SVG)
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { firmStatus, firmBalance, firmAddresses, getLabelSvg } from "@/lib/basitkargo";

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as any;
  const { data: st } = await sb.from("settings").select("basitkargo_enabled, basitkargo_api_token, basitkargo_address_id, basitkargo_webhook_key").order("id").limit(1).maybeSingle();
  const token = String(st?.basitkargo_api_token || "").trim();
  const save = async (patch: Record<string, unknown>) => {
    const { error } = await sb.from("settings").update({ ...patch, updated_at: new Date().toISOString() }).not("id", "is", null);
    if (error) throw new Error(error.message);
  };

  try {
    if (body.op === "status") {
      let firm: any = null, balance: number | null = null, addresses: any[] = [], tokenError: string | null = null;
      if (token) {
        try {
          [firm, balance, addresses] = await Promise.all([firmStatus(token), firmBalance(token).catch(() => null), firmAddresses(token).catch(() => [])]);
        } catch (e: any) { tokenError = e?.message || "Token doğrulanamadı"; }
      }
      return NextResponse.json({
        ok: true, enabled: st?.basitkargo_enabled === true, tokenSet: !!token, tokenError,
        firm: firm ? { status: firm.status, label: firm.statusLabel, approved: firm.approved, summary: firm.summary } : null,
        balance, addresses, addressId: st?.basitkargo_address_id || "",
        webhookUrl: st?.basitkargo_webhook_key ? `${SITE()}/api/basitkargo/webhook?key=${st.basitkargo_webhook_key}` : null,
      });
    }

    if (body.op === "save") {
      const patch: Record<string, unknown> = {};
      if (typeof body.token === "string" && body.token.trim()) {
        const t = body.token.trim();
        if (t.length < 10 || t.length > 500 || /\s/.test(t)) return NextResponse.json({ error: "Token biçimi geçersiz" }, { status: 400 });
        await firmStatus(t); // geçersizse hata
        patch.basitkargo_api_token = t;
      }
      if (typeof body.addressId === "string") {
        const a = body.addressId.trim();
        if (a && !/^[\w-]{1,64}$/.test(a)) return NextResponse.json({ error: "Adres seçimi geçersiz" }, { status: 400 });
        patch.basitkargo_address_id = a || null;
      }
      if (typeof body.enabled === "boolean") {
        if (body.enabled && !((patch.basitkargo_api_token as string) || token)) return NextResponse.json({ error: "Önce API token'ı kaydet" }, { status: 400 });
        patch.basitkargo_enabled = body.enabled;
      }
      if (Object.keys(patch).length) await save(patch);
      return NextResponse.json({ ok: true });
    }

    if (body.op === "webhook_key") {
      const key = randomBytes(24).toString("hex");
      await save({ basitkargo_webhook_key: key });
      return NextResponse.json({ ok: true, webhookUrl: `${SITE()}/api/basitkargo/webhook?key=${key}` });
    }

    if (body.op === "remove_token") {
      await save({ basitkargo_api_token: null, basitkargo_enabled: false });
      return NextResponse.json({ ok: true });
    }

    if (body.op === "label") {
      const orderId = String(body.orderId || "");
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ error: "Geçersiz sipariş" }, { status: 400 });
      const { data: o } = await sb.from("orders").select("kargo_api, kargonomi_shipment_id, kargonomi_tracking_code").eq("id", orderId).maybeSingle();
      if (!o || o.kargo_api !== "basitkargo" || !o.kargonomi_shipment_id || !o.kargonomi_tracking_code)
        return NextResponse.json({ error: "Bu siparişin Basit Kargo etiketi yok (önce firma seç, kod gelsin)" }, { status: 409 });
      if (!token) return NextResponse.json({ error: "Basit Kargo API token girilmemiş" }, { status: 400 });
      const svg = await getLabelSvg(token, o.kargonomi_shipment_id);
      if (!/<svg[\s>]/i.test(svg)) return NextResponse.json({ error: "Basit Kargo etiketi alınamadı" }, { status: 502 });
      return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
