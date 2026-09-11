import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// F9: Ödenmemiş siparişleri otomatik iptal + stok iade.
// Ek: iptal edilenlere "ödeme yarıda kaldı → siparişin hesabında" kurtarma
// e-postası kuyruğa atılır (müşteri tek tıkla tekrar oluşturabilsin).
// Dış zamanlayıcı (sistem cron) çağırır. CRON_SECRET ile korunur.

function recoveryHtml(storeName: string, storeUrl: string, name: string, orderNo: string) {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px">
    <h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">İşlemin yarıda mı kaldı? 🛒</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba ${name}, <b>${orderNo}</b> numaralı siparişinin ödemesi tamamlanmadı ve sipariş iptal edildi — ama seçtiğin ürünleri hesabından <b>tek tıkla tekrar oluşturabilirsin</b>. Numaran tükenmeden tamamlamak ister misin?</p>
    <div style="text-align:center;margin:10px 0 4px">
      <a href="${storeUrl}/account?tab=orders" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:14px">Siparişimi Tamamla</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0">${storeName} · Hesabım → Siparişlerim</p>
  </div>`;
}

async function queueRecoveryEmails(supabase: any, ids: string[]) {
  if (!ids?.length) return;
  const { data: settings } = await supabase.from("settings").select("*").limit(1).maybeSingle();
  const storeName = settings?.store_name || "YeriHisset";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  const fromEmail = settings?.smtp_from_email || settings?.smtp_user || "";
  const fromName = settings?.smtp_from_name || storeName;

  const { data: orders } = await supabase
    .from("orders").select("id, order_number, user_id").in("id", ids);
  const list = (orders as any[]) || [];
  const userIds = [...new Set(list.map((o) => o.user_id).filter(Boolean))];
  if (!userIds.length) return;

  const { data: profiles } = await supabase.from("profiles").select("id, email, first_name").in("id", userIds);
  const profById: Record<string, any> = {};
  for (const p of (profiles as any[]) || []) profById[p.id] = p;

  const rows = list
    .map((o) => {
      const prof = profById[o.user_id];
      if (!prof?.email) return null;
      const orderNo = o.order_number ? `YH${o.order_number}` : o.id.slice(0, 8).toUpperCase();
      return {
        kind: "order_recovery",
        recipient_email: prof.email,
        to_name: prof.first_name || null,
        subject: `${storeName} — Siparişini tamamlamak ister misin? (${orderNo})`,
        html_body: recoveryHtml(storeName, storeUrl, prof.first_name || "Değerli Müşterimiz", orderNo),
        from_name: fromName,
        from_email: fromEmail,
        status: "pending",
      };
    })
    .filter(Boolean);

  if (rows.length) await supabase.from("email_queue").insert(rows);
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any).rpc("expire_unpaid_orders");
  if (error) {
    console.error("[cron/expire-orders]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Kurtarma e-postaları (mevcut process-email-queue cron'u gönderir)
  try {
    const ids: string[] = Array.isArray(data?.ids) ? data.ids : [];
    await queueRecoveryEmails(supabase, ids);
  } catch (e: any) {
    console.error("[cron/expire-orders] recovery mail hata:", e?.message || e);
  }

  return NextResponse.json(data);
}

export const POST = run;
export const GET = run; // cron kolaylığı
