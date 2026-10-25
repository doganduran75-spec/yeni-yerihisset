/* eslint-disable @typescript-eslint/no-explicit-any */
// CRM › KAMPANYALAR (yalnız yönetici). src/lib/crm-campaign.ts
//   POST { op: "audience", filters }  → kitle (üye + son alışveriş + izin + son kampanya e-postası + aktif kuponları)
//   POST { op: "create", … }          → kişiye özel kupon (süre atandığı andan) + atama + e-posta kuyruğu (yalnız izinli)
//   POST { op: "report" }             → geçmiş kampanyalar: atanan, gönderilen, kullanan, ciro
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { campaignEmailHtml, scopeText, type CampaignCoupon } from "@/lib/crm-campaign";
import { generateCouponCode } from "@/lib/coupon-code";

const uuids = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((s) => /^[0-9a-f-]{36}$/i.test(s)) : []);
const int = (v: unknown) => (v === null || v === undefined || v === "" ? null : Math.max(0, Math.floor(Number(v))) || null);

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as any;

  if (body.op === "audience") {
    const f = body.filters || {};
    const brands = uuids(f.brands), cats = uuids(f.categories);
    const { data, error } = await sb.rpc("crm_campaign_audience", {
      p_brands: brands.length ? brands : null, p_categories: cats.length ? cats : null,
      p_purchase: ["any", "buyers", "non_buyers"].includes(f.purchase) ? f.purchase : "any",
      p_min_days: int(f.minDays), p_max_days: int(f.maxDays),
      p_tag: uuids([f.tag])[0] || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rows: data || [] });
  }

  if (body.op === "create") {
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Kampanya adı gerekli" }, { status: 400 });
    const userIds = [...new Set(uuids(body.userIds))].slice(0, 5000);
    if (!userIds.length) return NextResponse.json({ error: "Kimse seçilmedi" }, { status: 400 });
    const cp: CampaignCoupon | null = body.coupon || null;
    const email = body.email && String(body.email.subject || "").trim() ? { subject: String(body.email.subject).trim().slice(0, 150), html: String(body.email.html || "") } : null;
    if (!cp && !email) return NextResponse.json({ error: "Kupon ya da e-posta seç" }, { status: 400 });
    if (cp) {
      if (!["percentage", "fixed", "free_shipping"].includes(cp.type)) return NextResponse.json({ error: "Kupon türü geçersiz" }, { status: 400 });
      if (cp.type !== "free_shipping" && !(Number(cp.amount) > 0)) return NextResponse.json({ error: "İndirim tutarı gerekli" }, { status: 400 });
      if (cp.type === "percentage" && Number(cp.amount) > 90) return NextResponse.json({ error: "Yüzde en çok 90" }, { status: 400 });
      if (!(Number(cp.valid_days) >= 1 && Number(cp.valid_days) <= 365)) return NextResponse.json({ error: "Geçerlilik 1–365 gün" }, { status: 400 });
    }
    const slug = name.toLocaleLowerCase("tr").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "kampanya";

    // Seçilenler: kampanya izni (e-posta yalnız izinliye) + ad
    const people: any[] = [];
    for (let i = 0; i < userIds.length; i += 200) {
      const { data } = await sb.from("profiles").select("id, email, first_name, marketing_consent").in("id", userIds.slice(i, i + 200));
      people.push(...((data as any[]) || []));
    }
    const assignTo = body.assignUnconsented ? people : people.filter((p) => p.marketing_consent);
    const mailTo = people.filter((p) => p.marketing_consent && p.email);

    // 1) Kişiye özel kupon (kod müşteriye gösterilmez — sepette listelenir)
    let couponId: string | null = null;
    const expires = cp ? new Date(Date.now() + Number(cp.valid_days) * 86400_000) : null;
    if (cp) {
      const code = generateCouponCode();
      const { data: c, error } = await sb.from("coupons").insert({
        code, name: String(cp.name || name).slice(0, 80), type: cp.type, amount: cp.type === "free_shipping" ? 0 : Number(cp.amount),
        min_order_amount: Number(cp.min_order_amount || 0), max_discount_amount: cp.max_discount_amount ? Number(cp.max_discount_amount) : null,
        brand_ids: uuids(cp.brand_ids).length ? uuids(cp.brand_ids) : null, category_ids: uuids(cp.category_ids).length ? uuids(cp.category_ids) : null,
        is_personal: true, per_user_limit: 1, is_active: true, auto_assign_on_signup: false, campaign_slug: slug,
        description: `CRM kampanyası: ${name}`,
      }).select("id").single();
      if (error) return NextResponse.json({ error: `Kupon oluşturulamadı: ${error.message}` }, { status: 500 });
      couponId = c.id;
    }

    // 2) Kampanya kaydı
    const { data: st } = await sb.from("settings").select("store_name, smtp_from_name, smtp_from_email, smtp_user").limit(1).maybeSingle();
    const storeName = st?.store_name || "YeriHisset";
    const { data: camp, error: ce } = await sb.from("email_campaigns").insert({
      campaign_slug: slug, subject: email?.subject || name, html_body: email?.html || null, recipient_type: "crm",
      recipient_count: email ? mailTo.length : 0, status: email && mailTo.length ? "queued" : "sent", sent_at: new Date().toISOString(),
      coupon_id: couponId, assigned_count: cp ? assignTo.length : 0, audience: body.filters || null,
    }).select("id").single();
    if (ce) return NextResponse.json({ error: `Kampanya kaydedilemedi: ${ce.message}` }, { status: 500 });

    // 3) Atama — süre ATANDIĞI ANDAN (kişiye özel)
    if (couponId && assignTo.length) {
      const rows = assignTo.map((p) => ({ user_id: p.id, coupon_id: couponId, expires_at: expires!.toISOString(), campaign_id: camp.id }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from("user_coupons").upsert(rows.slice(i, i + 500), { onConflict: "user_id,coupon_id" });
        if (error) return NextResponse.json({ error: `Kupon atanamadı: ${error.message}` }, { status: 500 });
      }
    }

    // 4) E-posta kuyruğu (yalnız izinli; cron gönderirken izni yeniden denetler + çıkış bağlantısı ekler)
    let queued = 0;
    if (email && mailTo.length) {
      const scope = cp ? await scopeText(sb, cp.brand_ids, cp.category_ids) : "";
      const couponForMail = cp ? { type: cp.type, amount: Number(cp.amount), min_order_amount: Number(cp.min_order_amount || 0) } : null;
      const assigned = new Set(assignTo.map((p) => p.id));
      const rows = mailTo.map((p) => ({
        kind: "campaign", campaign_id: camp.id, recipient_email: p.email, subject: email.subject,
        html_body: campaignEmailHtml({ bodyHtml: email.html, firstName: p.first_name, coupon: assigned.has(p.id) ? couponForMail : null, expires, scope, slug, storeName }),
        from_name: st?.smtp_from_name || storeName, from_email: st?.smtp_from_email || st?.smtp_user || null, status: "pending",
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from("email_queue").insert(rows.slice(i, i + 200));
        if (!error) queued += Math.min(200, rows.length - i);
      }
    }
    return NextResponse.json({ ok: true, campaignId: camp.id, couponId, assigned: couponId ? assignTo.length : 0, queued, unconsented: people.length - mailTo.length });
  }

  if (body.op === "report") {
    const { data: camps } = await sb.from("email_campaigns")
      .select("id, campaign_slug, subject, sent_at, status, recipient_count, assigned_count, coupon_id, coupons(name, type, amount)")
      .eq("recipient_type", "crm").order("sent_at", { ascending: false }).limit(50);
    const out: any[] = [];
    for (const c of (camps as any[]) || []) {
      const [{ count: sent }, { count: pending }] = await Promise.all([
        sb.from("email_queue").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "sent"),
        sb.from("email_queue").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("status", ["pending", "processing"]),
      ]);
      let used = 0, revenue = 0;
      if (c.coupon_id) {
        const { data: oc } = await sb.from("order_coupons").select("order_id, counted, orders(total_amount, refunded_amount, status, payment_status)").eq("coupon_id", c.coupon_id);
        for (const r of (oc as any[]) || []) {
          const o = r.orders;
          if (!o || o.status === "cancelled" || !["paid", "partial_refund", "refunded"].includes(o.payment_status)) continue;
          used++;
          revenue += Number(o.total_amount || 0) - Number(o.refunded_amount || 0);
        }
      }
      out.push({ ...c, sent: sent ?? 0, pending: pending ?? 0, used, revenue: Math.round(revenue * 100) / 100 });
    }
    return NextResponse.json({ ok: true, campaigns: out });
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
