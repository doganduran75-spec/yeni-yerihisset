/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { GmcError, gmcStatus, registerGcp, listDataSources, processGmcQueue } from "@/lib/gmc-sync";

// Google Merchant API (yalnız yönetici) — src/lib/gmc-sync.ts
//   status · register {email?} · data_sources · select_source {name, contentLanguage, feedLabel} · sync_all · process
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient();
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    switch (body.op) {
      case "status": return NextResponse.json({ ok: true, ...(await gmcStatus(sb)) });
      case "register": return NextResponse.json({ ok: true, result: await registerGcp(sb, body.email ? String(body.email) : undefined) });
      case "data_sources": return NextResponse.json({ ok: true, sources: await listDataSources(sb) });
      case "select_source": {
        const name = String(body.name || "");
        if (!/^accounts\/\d+\/dataSources\/\d+$/.test(name)) return NextResponse.json({ error: "Geçersiz veri kaynağı" }, { status: 400 });
        const lang = String(body.contentLanguage || "tr").slice(0, 5);
        const label = String(body.feedLabel || "TR").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20) || "TR";
        await (sb as any).from("settings").update({ gmc_data_source: name, gmc_content_language: lang, gmc_feed_label: label }).not("id", "is", null);
        return NextResponse.json({ ok: true });
      }
      case "sync_all": {
        const { data, error } = await (sb as any).rpc("gmc_enqueue_all");
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, queued: Number(data ?? 0) });
      }
      case "process": return NextResponse.json({ ok: true, ...(await processGmcQueue(sb)) });
      default: return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
    }
  } catch (e: any) {
    const st = e instanceof GmcError ? (e.status >= 400 && e.status < 500 ? e.status : 502) : 500;
    return NextResponse.json({ error: e?.message || "Google hatası" }, { status: st });
  }
}
