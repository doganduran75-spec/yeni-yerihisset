import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { CHANNELS, channelLabel, type Channel } from "@/lib/marketplace/sync";
import { getTrendyolConfig, hasCredentials } from "@/lib/marketplace/trendyol";
import { getHepsiburadaConfig, hbHasCredentials } from "@/lib/marketplace/hepsiburada";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Dashboard "Pazaryeri Stok Senkronu" kartı: sitedeki son stok değişikliği +
// kanal başına sağlık (açık mı, bekleyen, hatalı, son başarılı güncelleme) +
// son birkaç senkron kaydı. Yalnız admin.

const LATE_MS = 5 * 60_000; // 5 dk'dan uzun bekleyen gönderim = gecikme

export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const supabase = createAdminClient();
  const sb = supabase as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  // Sitede son stok değişikliği: stock_changed_at damgası (tetikleyici; her yoldan değişimi yakalar)
  const [ty, hb, { data: lastVar }, { data: lastProd }] = await Promise.all([
    getTrendyolConfig(supabase),
    getHepsiburadaConfig(supabase),
    sb.from("product_variants").select("stock_changed_at, stock, products(title), variant_options(value)")
      .not("stock_changed_at", "is", null).order("stock_changed_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("products").select("stock_changed_at, stock, title")
      .not("stock_changed_at", "is", null).order("stock_changed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const lv = lastVar ? { at: lastVar.stock_changed_at, title: lastVar.products?.title ?? "—", label: lastVar.variant_options?.value ?? "", stock: lastVar.stock } : null;
  const lp = lastProd ? { at: lastProd.stock_changed_at, title: lastProd.title ?? "—", label: "", stock: lastProd.stock } : null;
  const lastStockChange = !lv ? lp : !lp ? lv : (new Date(lv.at) >= new Date(lp.at) ? lv : lp);
  const conf: Record<Channel, { enabled: boolean; ready: boolean }> = {
    trendyol: { enabled: ty.enabled, ready: hasCredentials(ty) },
    hepsiburada: { enabled: hb.enabled, ready: hbHasCredentials(hb) },
  };

  const channels = await Promise.all(CHANNELS.map(async (c) => {
    const [{ count: waiting }, { count: failed }, { data: oldest }, { data: lastOk }] = await Promise.all([
      sb.from("marketplace_stock_sync").select("id", { count: "exact", head: true }).eq("channel", c).in("status", ["pending", "sending", "sent"]),
      sb.from("marketplace_stock_sync").select("id", { count: "exact", head: true }).eq("channel", c).eq("status", "failed"),
      sb.from("marketplace_stock_sync").select("updated_at").eq("channel", c).in("status", ["pending", "sending", "sent"])
        .order("updated_at", { ascending: true }).limit(1).maybeSingle(),
      sb.from("marketplace_stock_log").select("created_at").eq("channel", c).eq("ok", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const oldestAt = oldest?.updated_at ? new Date(oldest.updated_at).getTime() : null;
    const { enabled, ready } = conf[c];
    const health =
      !enabled ? "off" :
      !ready ? "setup" :
      (failed ?? 0) > 0 ? "error" :
      (waiting ?? 0) > 0 && oldestAt && Date.now() - oldestAt > LATE_MS ? "late" :
      (waiting ?? 0) > 0 ? "waiting" : "ok";
    return {
      channel: c, label: channelLabel(c), enabled, ready, health,
      waiting: waiting ?? 0, failed: failed ?? 0,
      lastOkAt: lastOk?.created_at ?? null,
    };
  }));

  const { data: recent } = await sb.from("marketplace_stock_log")
    .select("id, channel, listing_key, qty, ok, message, created_at, variant_id")
    .order("created_at", { ascending: false }).limit(6);

  return NextResponse.json({
    ok: true,
    lastStockChange,
    channels,
    recent: recent ?? [],
  });
}
