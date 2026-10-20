/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import {
  ParasutError, connectionStatus, connectWithCode, disconnect, listAccounts, syncProducts, matchProducts, pushCodesToParasut,
} from "@/lib/parasut";
import { invoiceOrder, checkInvoice, invoicePdfUrl } from "@/lib/parasut-invoice";

// Paraşüt (yalnız yönetici) — src/lib/parasut.ts
//   status · connect {code} · disconnect · accounts · sync_products · match · link {variant_id, parasut_id} · push_codes {variant_ids}
//   invoice {order_id, accept_diff?} · check_invoice {order_id} · invoice_pdf {order_id} (src/lib/parasut-invoice.ts)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient();
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;
  const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  try {
    switch (body.op) {
      case "status": return NextResponse.json({ ok: true, ...(await connectionStatus(sb)) });
      case "connect":
        if (!String(body.code || "").trim()) return NextResponse.json({ error: "Kodu yapıştır" }, { status: 400 });
        await connectWithCode(sb, String(body.code));
        return NextResponse.json({ ok: true, ...(await connectionStatus(sb)) });
      case "disconnect": await disconnect(sb); return NextResponse.json({ ok: true });
      case "accounts": return NextResponse.json({ ok: true, accounts: await listAccounts(sb) });
      case "sync_products": return NextResponse.json({ ok: true, ...(await syncProducts(sb)) });
      case "match": return NextResponse.json({ ok: true, ...(await matchProducts(sb)) });
      case "link": {
        if (!uuid(body.variant_id)) return NextResponse.json({ error: "variant_id" }, { status: 400 });
        const pid = body.parasut_id ? String(body.parasut_id) : null;
        if (pid) {
          const { data: p } = await (sb as any).from("parasut_products").select("parasut_id").eq("parasut_id", pid).maybeSingle();
          if (!p) return NextResponse.json({ error: "Paraşüt ürünü bulunamadı — listeyi yenile" }, { status: 400 });
        }
        await (sb as any).from("product_variants").update({ parasut_product_id: pid }).eq("id", body.variant_id);
        return NextResponse.json({ ok: true });
      }
      case "push_codes": {
        const ids = ((body.variant_ids as unknown[]) || []).filter(uuid) as string[];
        if (!ids.length) return NextResponse.json({ error: "Seçili satır yok" }, { status: 400 });
        return NextResponse.json({ ok: true, ...(await pushCodesToParasut(sb, ids)) });
      }
      case "invoice":
      case "check_invoice":
      case "invoice_pdf": {
        if (!uuid(body.order_id)) return NextResponse.json({ error: "order_id" }, { status: 400 });
        if (body.op === "invoice_pdf") return NextResponse.json({ ok: true, url: await invoicePdfUrl(sb, body.order_id) });
        const r = body.op === "invoice" ? await invoiceOrder(sb, body.order_id, { acceptDiff: body.accept_diff === true, carrier: typeof body.carrier === "string" ? body.carrier.trim().slice(0, 80) : undefined }) : await checkInvoice(sb, body.order_id);
        return NextResponse.json({ ok: true, ...r });
      }
      default: return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
    }
  } catch (e: any) {
    const st = e instanceof ParasutError ? (e.status >= 400 && e.status < 500 ? e.status : 502) : 500;
    return NextResponse.json({ error: e?.message || "Paraşüt hatası" }, { status: st });
  }
}
