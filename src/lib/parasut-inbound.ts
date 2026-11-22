/* eslint-disable @typescript-eslint/no-explicit-any */
// PARAŞÜT GELEN E-FATURALAR (kullanıcı 2026-11-22) — yalnız sunucuda. MIG 20261198.
//   1) Paraşüt'e gelen e-fatura → Paraşüt bize bildirir (webhook inbound_e_invoice/create, /api/parasut/webhook,
//      X-Client-Key) → parasut_inbound_invoices'a "bekliyor" düşer, kurala (firma adı / VKN) bakılır.
//      Paraşüt'te gelen e-faturaları listeleyen uç YOK: yalnız bildirim açıldıktan sonra gelenler görünür.
//   2) Panelde (Gelen e-faturalar) "Kabul et ve kaydet": ticari faturaysa kabul yanıtı → gider kaydı (create_purchase_bill,
//      kalemler faturadaki isimleriyle) → gider kategorisi → etiket(ler) → seçili kasadan ödendi. Kaldığı yerden devam eder.
//   3) Paraşüt'te elle kaydedilen / reddedilen fatura panelden düşer ("Paraşüt'te işlendi") — liste açılınca kontrol.
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase-admin";
import { parasutCall, parasutConfig, ParasutError, PARASUT_ORIGINS } from "@/lib/parasut";
type Sb = ReturnType<typeof createAdminClient>;

export const WEBHOOK_PATH = "/api/parasut/webhook";
const T = "parasut_inbound_invoices";

/** Firma adı karşılaştırması: büyük/küçük harf, nokta, tire, boşluk fark etmez ("D-MARKET" ~ "D Market") */
export const normName = (s: unknown) =>
  String(s ?? "").toLocaleLowerCase("tr-TR").replace(/[^0-9a-zçğıöşü]+/g, " ").replace(/\s+/g, " ").trim();

export type InboundRule = {
  id: string; name: string; match_name: string | null; match_vkn: string | null;
  account_id: string | null; account_name: string | null; category_id: string | null; category_name: string | null;
  tag_ids: string[]; tag_names: string[]; mark_paid: boolean; details: boolean; sort_order: number;
};

/** Faturaya uyan kural: önce VKN, sonra ad (sıra numarasına göre ilk uyan) */
export function matchRule(rules: InboundRule[], inv: { from_vkn?: string | null; contact_name?: string | null }): InboundRule | null {
  const sorted = [...rules].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const vkn = String(inv.from_vkn ?? "").trim();
  const byVkn = vkn ? sorted.find((r) => r.match_vkn && r.match_vkn.trim() === vkn) : null;
  if (byVkn) return byVkn;
  const name = ` ${normName(inv.contact_name)} `;
  return sorted.find((r) => r.match_name && normName(r.match_name) && name.includes(` ${normName(r.match_name)} `)) ?? null;
}

function fields(e: any) {
  const a = e?.attributes ?? {};
  return {
    uuid: a.uuid ?? null, from_vkn: a.from_vkn ?? null, contact_name: a.contact_name ?? null,
    issue_date: a.issue_date ?? null, net_total: a.net_total ?? null, currency: a.currency ?? null,
    scenario: a.scenario ?? null, item_type: a.item_type ?? null, is_answerable: a.is_answerable ?? null, response_type: a.response_type ?? null,
  };
}

/** Bildirimle gelen (ya da okunan) e-faturayı kaydet; yeni ise kurala bağla. Giden (bizim kestiğimiz) fatura alınmaz. */
export async function ingestEInvoice(sb: Sb, e: any, raw?: unknown) {
  const id = String(e?.id ?? "").trim();
  if (!id || id.length > 64) return { skipped: "kimlik yok" };
  if (e?.attributes?.direction && e.attributes.direction !== "inbound") return { skipped: "giden fatura" };
  const f = fields(e);
  const { data: ex } = await (sb as any).from(T).select("id").eq("e_invoice_id", id).maybeSingle();
  if (ex) {
    await (sb as any).from(T).update(f).eq("id", ex.id);
    return { id: ex.id, updated: true };
  }
  const { data: rules } = await (sb as any).from("parasut_inbound_rules").select("*");
  const rule = matchRule((rules as InboundRule[]) || [], f);
  const { data: ins, error } = await (sb as any).from(T)
    .insert({ e_invoice_id: id, ...f, rule_id: rule?.id ?? null, raw: raw ?? null }).select("id").single();
  if (error) {
    if (/duplicate/i.test(error.message)) return { skipped: "zaten var" }; // aynı bildirim iki kez (eşzamanlı)
    throw new Error(error.message);
  }
  return { id: ins.id, created: true, rule: rule?.name ?? null };
}

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Webhook isteği: anahtar doğrulanır, yalnız gelen e-fatura alınır. Dönen değer HTTP durum + gövde. */
export async function handleWebhook(sb: Sb, clientKey: string, body: any): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: a } = await (sb as any).from("parasut_auth").select("webhook_key").eq("id", 1).maybeSingle();
  const expected = String(a?.webhook_key || "");
  if (!expected || !clientKey || !same(clientKey, expected)) return { status: 401, body: { error: "Yetkisiz" } };
  const c = await parasutConfig(sb);
  if (c.companyId && body?.company_id != null && String(body.company_id) !== c.companyId) return { status: 200, body: { ok: true, skipped: "başka firma" } };
  if (body?.resource !== "inbound_e_invoice" || body?.action !== "create") return { status: 200, body: { ok: true, skipped: "ilgisiz bildirim" } };
  const e = body?.data?.data;
  if (!e?.id) return { status: 200, body: { ok: true, skipped: "veri yok" } };
  const r = await ingestEInvoice(sb, e, body);
  return { status: 200, body: { ok: true, ...r } };
}

// ── Bildirim (webhook) aç ──────────────────────────────────────────────────

export async function webhookStatus(sb: Sb) {
  const { data: a } = await (sb as any).from("parasut_auth").select("webhook_id, webhook_uri, webhook_at").eq("id", 1).maybeSingle();
  return { enabled: !!(a?.webhook_id && a?.webhook_uri), uri: a?.webhook_uri ?? null, at: a?.webhook_at ?? null };
}

/** Paraşüt'te "gelen e-fatura" bildirimini bu siteye kur (varsa adres + anahtar yenilenir). origin: panelin adresi. */
export async function enableWebhook(sb: Sb, origin: string) {
  if (!PARASUT_ORIGINS.includes(origin)) throw new ParasutError(400, `Bildirim yalnız ${PARASUT_ORIGINS.join(" / ")} adresinden açılır.`);
  const uri = origin + WEBHOOK_PATH;
  const key = randomBytes(32).toString("hex"); // 64 karakter [0-9a-f]
  const list = await parasutCall(sb, "GET", "/webhooks");
  const ex = ((list?.data as any[]) || []).find((w) => w?.attributes?.model === "inbound_e_invoice" && w?.attributes?.action === "create");
  let id: string;
  if (ex) {
    await parasutCall(sb, "PATCH", `/webhooks/${ex.id}`, { data: { id: String(ex.id), type: "webhook", attributes: { uri, client_key: key } } });
    id = String(ex.id);
  } else {
    const j = await parasutCall(sb, "POST", "/webhooks", { data: { type: "webhook", attributes: { model: "inbound_e_invoice", action: "create", uri, client_key: key } } });
    id = String(j?.data?.id ?? "");
  }
  await (sb as any).from("parasut_auth").update({ webhook_key: key, webhook_id: id, webhook_uri: uri, webhook_at: new Date().toISOString() }).eq("id", 1);
  return webhookStatus(sb);
}

// ── Paraşüt'te elle işlendi mi? ────────────────────────────────────────────

/** Bekleyen faturaları Paraşüt'ten oku: orada gider olarak kaydedilmiş ya da reddedilmişse "Paraşüt'te işlendi". */
export async function refreshPending(sb: Sb, max = 10) {
  const old = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: rows } = await (sb as any).from(T).select("id, e_invoice_id, purchase_bill_id")
    .in("status", ["pending", "error"]).or(`checked_at.is.null,checked_at.lt.${old}`).order("received_at").limit(max);
  let changed = 0;
  for (const r of (rows as any[]) || []) {
    try {
      const j = await parasutCall(sb, "GET", `/e_invoices/${encodeURIComponent(r.e_invoice_id)}?include=invoice`);
      const f = fields(j?.data);
      const linked = j?.data?.relationships?.invoice?.data;
      const patch: Record<string, unknown> = { ...f, checked_at: new Date().toISOString() };
      if (!r.purchase_bill_id && linked?.type === "purchase_bills" && linked?.id) {
        Object.assign(patch, { status: "manual", purchase_bill_id: String(linked.id), note: "Paraşüt'te kaydedildi" });
        changed++;
      } else if (f.response_type === "rejected") {
        Object.assign(patch, { status: "manual", note: "Paraşüt'te reddedildi" });
        changed++;
      }
      await (sb as any).from(T).update(patch).eq("id", r.id);
    } catch (e: any) {
      if (e instanceof ParasutError && e.status === 404) {
        await (sb as any).from(T).update({ status: "manual", note: "Paraşüt'te bulunamadı (silinmiş / arşivlenmiş)", checked_at: new Date().toISOString() }).eq("id", r.id);
        changed++;
      } else break; // bağlantı sorunu: sonra yine denenir
    }
  }
  return { changed };
}

// ── Kabul et ve kaydet ─────────────────────────────────────────────────────

export type InboundChoice = {
  account_id?: string | null; category_id?: string | null; tag_ids?: string[]; new_tags?: string[];
  mark_paid: boolean; details: boolean;
};

const idOk = (v: unknown) => typeof v === "string" && /^\d{1,20}$/.test(v);

export async function processInbound(sb: Sb, id: string, ch: InboundChoice, userId: string) {
  const { data: row } = await (sb as any).from(T).select("*").eq("id", id).maybeSingle();
  if (!row) throw new ParasutError(404, "Fatura bulunamadı");
  if (row.status === "done") return { status: "done" };
  const stale = row.status === "processing" && row.processed_at && Date.now() - new Date(row.processed_at).getTime() > 5 * 60_000;
  if (!["pending", "error"].includes(row.status) && !stale) throw new ParasutError(409, row.status === "processing" ? "Bu fatura şu an işleniyor" : "Bu fatura beklemede değil");
  const acc = ch.account_id ? String(ch.account_id) : null, cat = ch.category_id ? String(ch.category_id) : null;
  const tags = (ch.tag_ids || []).map(String).filter(idOk);
  const newTags = (ch.new_tags || []).map((s) => String(s).trim().slice(0, 60)).filter(Boolean);
  if ((acc && !idOk(acc)) || (cat && !idOk(cat))) throw new ParasutError(400, "Geçersiz kasa / kategori");
  if (ch.mark_paid && !acc) throw new ParasutError(400, "Ödendi sayılacaksa kasa seç");

  // Sahiplen (aynı anda iki tık / iki işlem olmasın)
  const { data: claim } = await (sb as any).from(T)
    .update({ status: "processing", account_id: acc, category_id: cat, tag_ids: tags, mark_paid: !!ch.mark_paid, details: !!ch.details, processed_by: userId, processed_at: new Date().toISOString(), error: null })
    .eq("id", id).eq("status", row.status).select("id");
  if (!claim?.length) throw new ParasutError(409, "Bu fatura şu an işleniyor");
  const upd = (p: Record<string, unknown>) => (sb as any).from(T).update(p).eq("id", id);
  const eid = encodeURIComponent(row.e_invoice_id);
  const warn: string[] = [];
  try {
    // 1) Güncel hâl — Paraşüt'te elle kaydedildiyse dokunma
    const ei = await parasutCall(sb, "GET", `/e_invoices/${eid}?include=invoice`);
    const a = ei?.data?.attributes ?? {};
    const linked = ei?.data?.relationships?.invoice?.data;
    let billId: string | null = row.purchase_bill_id;
    if (!billId && linked?.type === "purchase_bills" && linked?.id) {
      await upd({ ...fields(ei?.data), status: "manual", purchase_bill_id: String(linked.id), note: "Paraşüt'te zaten kaydedilmiş — dokunulmadı" });
      return { status: "manual" };
    }
    // 2) Ticari faturaya kabul yanıtı (temel faturada yanıt yok)
    if (!row.accepted_at && a.scenario === "commercial" && a.is_answerable && !a.response_type) {
      await parasutCall(sb, "POST", `/e_invoices/${eid}/respond`, { data: { attributes: { response_type: "accept" } } });
      await upd({ accepted_at: new Date().toISOString() });
    }
    // 3) Gider kaydı (kalemler faturadaki isimleriyle; tedarikçi VKN'den bulunur / açılır)
    if (!billId) {
      try {
        const j = await parasutCall(sb, "POST", `/e_invoices/${eid}/create_purchase_bill`, { details: !!ch.details, supplier: true });
        billId = j?.data?.id ? String(j.data.id) : null;
      } catch (e: any) {
        if (!(e instanceof ParasutError && e.status === 422 && /already has a purchase bill/i.test(e.message))) throw e;
      }
      if (!billId) {
        const again = await parasutCall(sb, "GET", `/e_invoices/${eid}?include=invoice`);
        const l = again?.data?.relationships?.invoice?.data;
        if (l?.type === "purchase_bills" && l?.id) billId = String(l.id);
      }
      if (!billId) throw new ParasutError(502, "Paraşüt gider kaydını oluşturmadı — birkaç saniye sonra yeniden dene");
      await upd({ purchase_bill_id: billId });
    }
    const bid = encodeURIComponent(billId);
    // 4) Gider kategorisi
    if (cat && !row.category_done) {
      await parasutCall(sb, "POST", `/item_categories/${encodeURIComponent(cat)}/items/${bid}`);
      await upd({ category_done: true });
    }
    // 5) Etiketler (Paraşüt'te olmayan etiket açılır). Etiket yalnız faturayı düzenleyerek yazılabiliyor: kalemler
    //    gönderilmez → sonra tutar okunur; değiştiyse durur (ödeme yapılmaz), Paraşüt'te bakılsın.
    if ((tags.length || newTags.length) && !row.tags_done) {
      for (const n of newTags) {
        const j = await parasutCall(sb, "POST", "/tags", { data: { type: "tags", attributes: { name: n } } });
        if (j?.data?.id) tags.push(String(j.data.id));
      }
      const b = await parasutCall(sb, "GET", `/purchase_bills/${bid}?include=category,supplier`);
      const ba = b?.data?.attributes ?? {}, rel = b?.data?.relationships ?? {};
      const before = Number(ba.net_total ?? 0);
      const relationships: Record<string, unknown> = { tags: { data: tags.map((t) => ({ id: t, type: "tags" })) } };
      if (rel.category?.data?.id) relationships.category = { data: { id: String(rel.category.data.id), type: "item_categories" } };
      if (rel.supplier?.data?.id) relationships.supplier = { data: { id: String(rel.supplier.data.id), type: "contacts" } };
      try {
        await parasutCall(sb, "PUT", `/purchase_bills/${bid}`, {
          data: { id: billId, type: "purchase_bills", attributes: {
            item_type: ba.item_type, issue_date: ba.issue_date, due_date: ba.due_date, currency: ba.currency,
            ...(ba.invoice_no ? { invoice_no: ba.invoice_no } : {}), ...(ba.description ? { description: ba.description } : {}),
          }, relationships },
        });
        const after = Number((await parasutCall(sb, "GET", `/purchase_bills/${bid}`))?.data?.attributes?.net_total ?? 0);
        if (Math.abs(after - before) > 0.01) throw new ParasutError(409, `Etiket yazılırken Paraşüt'teki tutar değişti (${before} → ${after}) — Paraşüt'te faturaya bak, ödeme yapılmadı`);
        await upd({ tags_done: true });
      } catch (e: any) {
        if (e instanceof ParasutError && e.status === 409) throw e;
        warn.push(`Etiket yazılamadı (Paraşüt'te elle ekle): ${String(e?.message || e).slice(0, 160)}`);
      }
    }
    // 6) Ödendi (seçili kasadan, fatura tarihiyle, kalan tutar)
    if (ch.mark_paid && acc && !row.paid) {
      const b = await parasutCall(sb, "GET", `/purchase_bills/${bid}`);
      const ba = b?.data?.attributes ?? {};
      const remaining = Number(ba.remaining ?? 0);
      if (remaining > 0.009) {
        await parasutCall(sb, "POST", `/purchase_bills/${bid}/payments`, {
          data: { type: "payments", attributes: { account_id: Number(acc), date: ba.issue_date || new Date().toISOString().slice(0, 10), amount: remaining, description: "Gelen e-fatura (YeriHisset paneli)" } },
        });
      }
      await upd({ paid: true });
    }
    await upd({ status: "done", error: null, note: warn.join(" · ") || null, processed_at: new Date().toISOString() });
    return { status: "done", purchase_bill_id: billId, warnings: warn };
  } catch (e: any) {
    await upd({ status: "error", error: String(e?.message || e).slice(0, 400) });
    throw e;
  }
}
