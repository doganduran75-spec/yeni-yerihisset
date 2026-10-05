/* eslint-disable @typescript-eslint/no-explicit-any */
// PAZARYERİ İLAN EŞİTLEME: her pazaryerinden İLANDAKİ ürün anahtarlarını çeker (Trendyol:
// barkod, Hepsiburada: satıcı stok kodu) ve apply_marketplace_listings ile kaydeder.
// Stok / fiyat yalnız ilandaki varyantlara gider → o kanalda ilanı olmayan ürün hata üretmez.
// Saatte bir (cron/marketplace-sync içinden) + elle "İlanları eşitle" (force).
// Pazaryeri hata verirse önceki liste korunur (marketplace_listing_state.message'a yazılır).

import { createAdminClient } from "@/lib/supabase-admin";
import { getTrendyolConfig, hasCredentials, listTrendyolBarcodes } from "./trendyol";
import { getHepsiburadaConfig, hbHasCredentials, hbListMerchantSkus } from "./hepsiburada";
import type { Channel } from "./sync";

type AdminClient = ReturnType<typeof createAdminClient>;
const EVERY_MIN = 60;

export type ListingSyncResult = {
  channel: Channel; ok: boolean; skipped?: string; count?: number; added?: number; removed?: number; message?: string;
};

async function fetchKeys(sb: AdminClient, channel: Channel): Promise<{ enabled: boolean; ready: boolean; keys?: () => Promise<string[]> }> {
  if (channel === "trendyol") {
    const c = await getTrendyolConfig(sb);
    return { enabled: c.enabled, ready: hasCredentials(c), keys: () => listTrendyolBarcodes(c) };
  }
  const c = await getHepsiburadaConfig(sb);
  return { enabled: c.enabled, ready: hbHasCredentials(c), keys: () => hbListMerchantSkus(c) };
}

export async function syncMarketplaceListings(
  sb: AdminClient = createAdminClient(),
  opts: { channel?: Channel; force?: boolean } = {},
): Promise<ListingSyncResult[]> {
  const out: ListingSyncResult[] = [];
  const channels: Channel[] = opts.channel ? [opts.channel] : ["trendyol", "hepsiburada"];
  for (const channel of channels) {
    const src = await fetchKeys(sb, channel);
    if (!src.ready) { out.push({ channel, ok: false, skipped: "API bilgileri eksik" }); continue; }
    if (!opts.force && !src.enabled) { out.push({ channel, ok: false, skipped: "senkron kapalı" }); continue; }
    if (!opts.force) {
      const { data: st } = await (sb as any).from("marketplace_listing_state").select("last_run_at").eq("channel", channel).maybeSingle();
      if (st?.last_run_at && Date.now() - new Date(st.last_run_at).getTime() < EVERY_MIN * 60_000) {
        out.push({ channel, ok: true, skipped: "yakın zamanda eşitlendi" });
        continue;
      }
    }
    try {
      const keys = await src.keys!();
      const { data, error } = await (sb as any).rpc("apply_marketplace_listings", { p_channel: channel, p_keys: keys });
      if (error) throw new Error(error.message);
      out.push({ channel, ok: !!data?.ok, count: data?.count, added: data?.added, removed: data?.removed, message: data?.message });
    } catch (e: any) {
      const message = e?.message || String(e);
      await (sb as any).from("marketplace_listing_state")
        .upsert({ channel, last_run_at: new Date().toISOString(), message: `İlan listesi alınamadı: ${message}`.slice(0, 500) }, { onConflict: "channel" });
      out.push({ channel, ok: false, message });
    }
  }
  return out;
}
