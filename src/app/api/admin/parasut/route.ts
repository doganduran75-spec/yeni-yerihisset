/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import {
  ParasutError, connectionStatus, connectWithCode, connectWithOidc, markOfflineDenied, startAuthorize, disconnect, listAccounts, listInvoiceCategories, syncProducts, matchProducts, pushCodesToParasut,
  listCategories, listTags,
} from "@/lib/parasut";
import { enableWebhook, matchRule, processInbound, refreshPending, webhookStatus, type InboundRule } from "@/lib/parasut-inbound";
import { invoiceOrder, checkInvoice, invoicePdfUrl, refundInvoiceOrder } from "@/lib/parasut-invoice";
import { pushInvoiceToMarketplace, MarketplaceInvoiceError } from "@/lib/marketplace-invoice";

// Paraşüt (yalnız yönetici) — src/lib/parasut.ts
//   status · connect {code} · disconnect · accounts · categories · sync_products · match · link {variant_id, parasut_id} · push_codes {variant_ids}
//   invoice {order_id, accept_diff?} · check_invoice {order_id} · invoice_pdf {order_id} (src/lib/parasut-invoice.ts)
//   Gelen e-faturalar (src/lib/parasut-inbound.ts): inbound_list · inbound_options · inbound_process {id, choice}
//   inbound_ignore {id, undo?} · inbound_webhook {origin} · rule_save {rule} · rule_delete {id}
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
      // Yeni altyapı (id.parasut.com, PKCE): giriş adresi → Paraşüt onayı → /admin/parasut/baglan → connect_oidc
      case "authorize": return NextResponse.json({ ok: true, url: await startAuthorize(sb, String(body.origin || "")) });
      case "connect_oidc":
        if (!String(body.code || "").trim() || !String(body.state || "").trim()) return NextResponse.json({ error: "Kod ya da state eksik" }, { status: 400 });
        await connectWithOidc(sb, String(body.code), String(body.state));
        return NextResponse.json({ ok: true, ...(await connectionStatus(sb)) });
      // Paraşüt girişi süresiz oturumu (offline_access) reddetti → sonraki bağlanma normal oturumla
      case "offline_denied": await markOfflineDenied(sb); return NextResponse.json({ ok: true });
      case "disconnect": await disconnect(sb); return NextResponse.json({ ok: true });
      case "accounts": return NextResponse.json({ ok: true, accounts: await listAccounts(sb) });
      case "categories": return NextResponse.json({ ok: true, categories: await listInvoiceCategories(sb) });
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
      case "push_marketplace_invoice": {
        if (!uuid(body.order_id)) return NextResponse.json({ error: "order_id" }, { status: 400 });
        // Hepsiburada paket numarası elle (panelden bakılır): siparişe yazılır, sonra yüklenir
        const pkg = typeof body.package_number === "string" ? body.package_number.replace(/\D/g, "").slice(0, 30) : "";
        if (pkg) await (sb as any).from("orders").update({ mp_package_number: pkg, mp_invoice_error: null }).eq("id", body.order_id).eq("channel", "hepsiburada");
        try { return NextResponse.json({ ok: true, ...(await pushInvoiceToMarketplace(sb, body.order_id)) }); }
        catch (e: any) { if (e instanceof MarketplaceInvoiceError) return NextResponse.json({ error: e.message }, { status: e.status }); throw e; }
      }
      case "invoice":
      case "check_invoice":
      case "invoice_pdf": {
        if (!uuid(body.order_id)) return NextResponse.json({ error: "order_id" }, { status: 400 });
        if (body.op === "invoice_pdf") return NextResponse.json({ ok: true, url: await invoicePdfUrl(sb, body.order_id) });
        const r = body.op === "invoice" ? await invoiceOrder(sb, body.order_id, { acceptDiff: body.accept_diff === true, carrier: typeof body.carrier === "string" ? body.carrier.trim().slice(0, 80) : undefined }) : await checkInvoice(sb, body.order_id);
        return NextResponse.json({ ok: true, ...r });
      }
      // ── Gelen e-faturalar ──
      case "inbound_list": {
        // Paraşüt'te elle işlenenler düşsün (bağlantı yoksa liste yine gelir)
        let refreshError: string | null = null;
        try { await refreshPending(sb); } catch (e: any) { refreshError = e?.message || String(e); }
        const cols = "id, e_invoice_id, from_vkn, contact_name, issue_date, net_total, currency, scenario, item_type, is_answerable, response_type, status, rule_id, account_id, category_id, tag_ids, mark_paid, details, purchase_bill_id, paid, error, note, received_at, processed_at";
        const [open, closed, rules] = await Promise.all([
          (sb as any).from("parasut_inbound_invoices").select(cols).in("status", ["pending", "processing", "error"]).order("received_at", { ascending: false }).limit(200),
          (sb as any).from("parasut_inbound_invoices").select(cols).in("status", ["done", "manual", "ignored"]).order("received_at", { ascending: false }).limit(50),
          (sb as any).from("parasut_inbound_rules").select("*").order("sort_order").order("created_at"),
        ]);
        return NextResponse.json({ ok: true, open: open.data || [], closed: closed.data || [], rules: rules.data || [], webhook: await webhookStatus(sb), refreshError });
      }
      case "inbound_options": {
        const [accounts, categories, tags] = await Promise.all([listAccounts(sb), listCategories(sb, "Expenditure"), listTags(sb)]);
        return NextResponse.json({ ok: true, accounts, categories, tags });
      }
      case "inbound_process": {
        if (!uuid(body.id)) return NextResponse.json({ error: "id" }, { status: 400 });
        const c = (body.choice || {}) as Record<string, any>;
        const r = await processInbound(sb, body.id, {
          account_id: c.account_id ? String(c.account_id) : null, category_id: c.category_id ? String(c.category_id) : null,
          tag_ids: Array.isArray(c.tag_ids) ? c.tag_ids.map(String).slice(0, 10) : [], new_tags: Array.isArray(c.new_tags) ? c.new_tags.map(String).slice(0, 5) : [],
          mark_paid: c.mark_paid === true, details: c.details !== false,
        }, user.id);
        return NextResponse.json({ ok: true, ...r });
      }
      case "inbound_ignore": {
        if (!uuid(body.id)) return NextResponse.json({ error: "id" }, { status: 400 });
        const undo = body.undo === true;
        const { data } = await (sb as any).from("parasut_inbound_invoices")
          .update(undo ? { status: "pending", note: null } : { status: "ignored", note: "Paraşüt'te elle girilecek" })
          .eq("id", body.id).in("status", undo ? ["ignored"] : ["pending", "error"]).select("id");
        if (!data?.length) return NextResponse.json({ error: "Fatura bu durumda değil" }, { status: 409 });
        return NextResponse.json({ ok: true });
      }
      case "inbound_webhook": return NextResponse.json({ ok: true, webhook: await enableWebhook(sb, String(body.origin || "")) });
      case "rule_save": {
        const r = (body.rule || {}) as Record<string, any>;
        const s = (v: unknown, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
        const num = (v: unknown) => (typeof v === "string" && /^\d{1,20}$/.test(v) ? v : null);
        const arr = (v: unknown, f: (x: unknown) => string | null) => (Array.isArray(v) ? v.map(f).filter(Boolean).slice(0, 10) as string[] : []);
        const row = {
          name: s(r.name) || s(r.match_name) || "Kural", match_name: s(r.match_name), match_vkn: s(r.match_vkn, 11)?.replace(/\D/g, "") || null,
          account_id: num(r.account_id), account_name: s(r.account_name), category_id: num(r.category_id), category_name: s(r.category_name),
          tag_ids: arr(r.tag_ids, num), tag_names: arr(r.tag_names, (x) => s(x, 60)),
          mark_paid: r.mark_paid !== false, details: r.details !== false, sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
          updated_at: new Date().toISOString(),
        };
        if (!row.match_name && !row.match_vkn) return NextResponse.json({ error: "Firma adı ya da VKN yaz" }, { status: 400 });
        const q = uuid(r.id)
          ? (sb as any).from("parasut_inbound_rules").update(row).eq("id", r.id).select("id").single()
          : (sb as any).from("parasut_inbound_rules").insert(row).select("id").single();
        const { data: saved, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        // Bekleyen faturalar yeni kurallara göre yeniden eşleşir
        const [{ data: rules }, { data: pend }] = await Promise.all([
          (sb as any).from("parasut_inbound_rules").select("*"),
          (sb as any).from("parasut_inbound_invoices").select("id, from_vkn, contact_name, rule_id").in("status", ["pending", "error"]),
        ]);
        for (const p of (pend as any[]) || []) {
          const m = matchRule((rules as InboundRule[]) || [], p)?.id ?? null;
          if (m !== p.rule_id) await (sb as any).from("parasut_inbound_invoices").update({ rule_id: m }).eq("id", p.id);
        }
        return NextResponse.json({ ok: true, id: saved.id });
      }
      case "rule_delete": {
        if (!uuid(body.id)) return NextResponse.json({ error: "id" }, { status: 400 });
        await (sb as any).from("parasut_inbound_rules").delete().eq("id", body.id);
        return NextResponse.json({ ok: true });
      }
      case "refund_invoice": {
        if (!uuid(body.order_id)) return NextResponse.json({ error: "order_id" }, { status: 400 });
        return NextResponse.json({ ok: true, ...(await refundInvoiceOrder(sb, body.order_id)) });
      }
      default: return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
    }
  } catch (e: any) {
    const st = e instanceof ParasutError ? (e.status >= 400 && e.status < 500 ? e.status : 502) : 500;
    return NextResponse.json({ error: e?.message || "Paraşüt hatası" }, { status: st });
  }
}
