import { NextRequest, NextResponse } from "next/server";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import { createAdminClient } from "@/lib/supabase-admin";
import { renderEmailTemplate } from "@/lib/notifications";
import { restoreOrderCredit } from "@/lib/store-credit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// F9: Ödenmemiş siparişleri otomatik iptal + stok iade.
// Ek: iptal edilenlere "ödeme yarıda kaldı → siparişin hesabında" kurtarma e-postası SONRAKİ SABAH 10:00'da
// (arada yeni sipariş verdiyse gönderilmez; ürün tükendiyse "alternatiflere bak" e-postası).
// Dış zamanlayıcı (sistem cron) çağırır. CRON_SECRET ile korunur.

function recoveryHtml(storeName: string, storeUrl: string, name: string, orderNo: string) {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px">
    <h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">İşlemin yarıda mı kaldı? 🛒</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba ${name}, <b>${orderNo}</b> numaralı siparişinin ödemesi tamamlanmadı ve sipariş iptal edildi — ama seçtiğin ürünleri hesabından <b>tek tıkla tekrar oluşturabilirsin</b>. Stoklar tükenmeden tamamlamak ister misin?</p>
    <div style="text-align:center;margin:10px 0 4px">
      <a href="${storeUrl}/account?tab=orders" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:14px">Siparişimi Tamamla</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0">${storeName} · Hesabım → Siparişlerim</p>
  </div>`;
}

function recoveryAltHtml(storeName: string, storeUrl: string, name: string, items: { title: string; href: string }[]) {
  const rows = items.slice(0, 4).map((it) =>
    `<li style="margin:0 0 6px;font-size:14px;color:#334155"><a href="${it.href}" style="color:#3f6212;font-weight:700">${it.title}</a></li>`).join("");
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px">
    <h1 style="font-size:22px;font-weight:800;color:#3f6212;margin:0 0 12px">Baktığın ürün tükendi 😔</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px">Merhaba ${name}, ödemesi tamamlanmayan siparişindeki ürün o arada tükendi. Diğer renk ve numaralara ya da benzer modellere göz atmak ister misin?</p>
    <ul style="margin:0 0 20px;padding:0 0 0 18px">${rows}</ul>
    <div style="text-align:center;margin:8px 0 4px">
      <a href="${storeUrl}/magaza" style="display:inline-block;background:#4d7c0f;color:#fff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:800;font-size:14px">Alternatiflere Bak</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0">${storeName}</p>
  </div>`;
}

// Zamanlama veritabanında: expire_unpaid_orders iptal ederken recovery_due_at = sonraki sabah 10:00 (20261139)

// Zamanı gelen hatırlatmalar: arada yeni sipariş verdiyse gönderme; ürün tükendiyse "alternatif" e-postası
async function processDueRecoveries(supabase: any) {
  const { data: due } = await supabase.from("orders")
    .select("id, order_number, user_id, created_at, order_items(product_id, variant_id, quantity, products(title, slug), product_variants(stock, is_active))")
    .lte("recovery_due_at", new Date().toISOString()).is("recovery_sent_at", null).limit(50);
  const list = (due as any[]) || [];
  if (!list.length) return;
  const { data: settings } = await supabase.from("settings").select("*").limit(1).maybeSingle();
  const storeName = settings?.store_name || "YeriHisset";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  const fromEmail = settings?.smtp_from_email || settings?.smtp_user || "";
  const fromName = settings?.smtp_from_name || storeName;
  const mark = (id: string, result: string) =>
    supabase.from("orders").update({ recovery_sent_at: new Date().toISOString(), recovery_result: result }).eq("id", id);

  for (const o of list) {
    // Arada başka sipariş verdi mi (iptal edilmemiş)
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("user_id", o.user_id).neq("id", o.id).neq("status", "cancelled").gt("created_at", o.created_at);
    if (count) { await mark(o.id, "skipped_new_order"); continue; }
    const { data: prof } = await supabase.from("profiles").select("email, first_name").eq("id", o.user_id).maybeSingle();
    if (!prof?.email) { await mark(o.id, "skipped_no_email"); continue; }
    const orderNo = o.order_number ? `YH${o.order_number}` : o.id.slice(0, 8).toUpperCase();
    const custName = prof.first_name || "Değerli Müşterimiz";
    const items = (o.order_items as any[]) || [];
    // Tükenen ürün: varyantın stoğu siparişteki adetten az ya da numara pasif
    const gone = items.filter((it) => it.variant_id && (it.product_variants?.is_active === false || Number(it.product_variants?.stock ?? 0) < Number(it.quantity || 1)));
    let row: any;
    if (gone.length) {
      row = {
        kind: "order_recovery_alt",
        subject: `${storeName} — Baktığın ürün tükendi, alternatiflere göz atmak ister misin?`,
        html_body: recoveryAltHtml(storeName, storeUrl, custName, gone.map((it) => ({
          title: it.products?.title || "Ürün", href: it.products?.slug ? `${storeUrl}/products/${it.products.slug}` : `${storeUrl}/magaza`,
        }))),
      };
    } else {
      // Düzenlenebilir şablon (email_templates) varsa onu kullan; yoksa hardcoded
      const tpl = await renderEmailTemplate("order_recovery", { customer_name: custName, order_id: orderNo, store_url: storeUrl, store_name: storeName });
      row = {
        kind: "order_recovery",
        subject: tpl?.subject ?? `${storeName} — Siparişini tamamlamak ister misin? (${orderNo})`,
        html_body: tpl?.html ?? recoveryHtml(storeName, storeUrl, custName, orderNo),
      };
    }
    await supabase.from("email_queue").insert({
      ...row, recipient_email: prof.email, to_name: prof.first_name || null, from_name: fromName, from_email: fromEmail, status: "pending",
    });
    await mark(o.id, gone.length ? "sent_alt" : "sent");
  }
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") // yalnız başlık: adres satırındaki anahtar erişim loglarına düşer;
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any).rpc("expire_unpaid_orders");
  if (error) {
    console.error("[cron/expire-orders]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  kickMarketplaceSync(); // stok değişti → pazaryerlerine (Trendyol) gönder

  const ids: string[] = Array.isArray(data?.ids) ? data.ids : [];

  // Otomatik iptal edilen siparişlerde kullanılan YeriHisset Kredisi'ni geri yükle
  try {
    for (const id of ids) await restoreOrderCredit(supabase, id);
  } catch (e: any) {
    console.error("[cron/expire-orders] kredi iade hata:", e?.message || e);
  }

  // "Yarıda mı kaldı?" hatırlatması: iptal anında değil, sonraki sabah 10:00 (kullanıcı kararı 2026-10-24).
  // Zamanı gelenler her çalışmada gönderilir (mevcut process-email-queue cron'u e-postayı yollar).
  try {
    await processDueRecoveries(supabase);
  } catch (e: any) {
    console.error("[cron/expire-orders] recovery mail hata:", e?.message || e);
  }

  // Ödenmeyen kart siparişlerinde bekleyen Meta bilgisini (IP/tarayıcı) 2 gün sonra sil (KVKK)
  try {
    await (supabase as any).rpc("strip_order_ad_meta");
  } catch (e: any) {
    console.error("[cron/expire-orders] reklam bilgisi temizliği:", e?.message || e);
  }

  return NextResponse.json(data);
}

export const POST = run;
export const GET = run; // cron kolaylığı
