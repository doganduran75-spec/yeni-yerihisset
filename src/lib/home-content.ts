/* eslint-disable @typescript-eslint/no-explicit-any */
// Ana sayfa metinleri (sunucu): varsayılan + panelde kaydedilen değişiklikler (settings.home_content, migration 20261112).
// Yalnız varsayılanda olan alanlar ve aynı türde değerler alınır → yanlış / eski kayıt sayfayı bozamaz.
import { createAdminClient } from "@/lib/supabase-admin";
import { homeContent, type HomeContent } from "@/config/homeContent";
import { mergeHomeContent } from "@/lib/home-content-merge";

export async function getHomeContent(): Promise<HomeContent> {
  try {
    const { data } = await (createAdminClient() as any).from("settings").select("home_content").limit(1).maybeSingle();
    return data?.home_content ? mergeHomeContent(homeContent, data.home_content) : homeContent;
  } catch {
    return homeContent;
  }
}
