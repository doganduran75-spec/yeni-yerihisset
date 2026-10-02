import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { scoreMember } from "@/lib/member-suspicion";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ESKİ SİTE ÜYELERİ İNCELEME: WooCommerce'ten aktarılan, HİÇ SİPARİŞİ olmayan hesaplar +
// sahte/bot şüphe puanı (src/lib/member-suspicion.ts). Admin seçtiklerini siler; silinenler
// legacy_import_blocklist'e yazılır → geçiş günü aktarımı onları yeniden getirmez.
// Silme sunucuda YENİDEN doğrulanır: yalnız aktarılmış, yönetici olmayan, siparişi olmayan hesap.

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 403 }) };
  return { sb, userId: user.id as string };
}

async function pageAll(build: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { sb } = auth;
  try {
    const [profiles, orders, addresses, alerts] = await Promise.all([
      pageAll((f, t) => sb.from("profiles").select("id, email, first_name, last_name, phone, created_at, import_source, role")
        .not("import_source", "is", null).range(f, t)),
      pageAll((f, t) => sb.from("orders").select("user_id").not("user_id", "is", null).range(f, t)),
      pageAll((f, t) => sb.from("user_addresses").select("user_id").range(f, t)),
      pageAll((f, t) => sb.from("stock_notifications").select("user_id, email").range(f, t)),
    ]);
    const withOrders = new Set(orders.map((o) => o.user_id));
    const withAddr = new Set(addresses.map((a) => a.user_id));
    const alertIds = new Set(alerts.map((a) => a.user_id).filter(Boolean));
    const alertEmails = new Set(alerts.map((a) => String(a.email || "").toLowerCase()).filter(Boolean));

    const cands = profiles.filter((p) => p.role !== "admin" && !withOrders.has(p.id));
    // Aynı saat içinde toplu kayıt (bot dalgası)
    const perHour = new Map<string, number>();
    for (const p of cands) { const h = String(p.created_at).slice(0, 13); perHour.set(h, (perHour.get(h) || 0) + 1); }

    const rows = cands.map((p) => {
      const s = scoreMember({
        email: p.email, first_name: p.first_name, last_name: p.last_name,
        hasAddress: withAddr.has(p.id), hasStockAlert: alertIds.has(p.id) || alertEmails.has(String(p.email).toLowerCase()),
        burst: perHour.get(String(p.created_at).slice(0, 13)),
      });
      return {
        id: p.id, email: p.email, name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), phone: p.phone,
        created_at: p.created_at, source: p.import_source, hasAddress: withAddr.has(p.id), ...s,
      };
    }).sort((a, b) => b.score - a.score || String(a.email).localeCompare(String(b.email)));

    const { count: blocked } = await sb.from("legacy_import_blocklist").select("email", { count: "exact", head: true });
    return NextResponse.json({ ok: true, rows, imported: profiles.length, blocked: blocked ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { sb, userId } = auth;
  const body = await req.json().catch(() => ({}));
  const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
  const reasons: Record<string, string> = body.reasons && typeof body.reasons === "object" ? body.reasons : {};
  if (!ids.length) return NextResponse.json({ error: "Silinecek hesap seçilmedi." }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: "Tek seferde en fazla 500 hesap." }, { status: 400 });

  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const { data: p } = await sb.from("profiles").select("id, email, role, import_source").eq("id", id).maybeSingle();
    if (!p || p.role === "admin" || !p.import_source) { skipped.push(p?.email || id); continue; }
    const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("user_id", id);
    if ((count ?? 0) > 0) { skipped.push(p.email); continue; }
    const email = String(p.email || "").toLowerCase();
    if (email) {
      await sb.from("legacy_import_blocklist").upsert(
        { email, reason: String(reasons[id] || "admin: sahte üye").slice(0, 300), created_by: userId },
        { onConflict: "email" },
      );
    }
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) { skipped.push(p.email); continue; }
    deleted++;
  }
  return NextResponse.json({ ok: true, deleted, skipped });
}
