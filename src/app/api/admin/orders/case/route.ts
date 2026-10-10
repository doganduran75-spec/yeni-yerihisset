import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { afterSaleUrl } from "@/lib/after-sale";
import { sendAltDeliveredEmail, sendReturnLabelEmail, RETURN_METHOD_LABEL } from "@/lib/after-sale-mail";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";

/* eslint-disable @typescript-eslint/no-explicit-any */

// SATIŞ SONRASI — yönetici işlemleri (sipariş detayı › Sıradaki adım). POST { orderId, op, … }
//   fit_ok        : müşteri "oldu" dedi (telefon vb.) → fatura sırası
//   ship_alt      : değişim — alternatif numarayı siparişe ekle (stok düşer) + kargo kodu (opsiyonel)
//   alt_delivered : alternatif teslim edildi → müşteriye "hangisi oldu?" e-postası
//   send_label    : iade / değişim geri gönderim kargo kodu → müşteriye e-posta (yöntem değiştirilebilir)
//   close         : talebi kapat (vazgeçildi) → sipariş "deniyor"a döner
//   link          : müşteri sayfasının bağlantısı (müşteri adına doldurmak için)
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as any;
  const orderId = String(body.orderId || "");
  const { data: o } = await sb.from("orders").select("id, channel, import_source, fit_status").eq("id", orderId).maybeSingle();
  if (!o) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  const { data: c } = await sb.from("order_cases").select("*").eq("order_id", orderId).is("closed_at", null).maybeSingle();
  const now = new Date().toISOString();
  const note = (t: string) => sb.from("order_events").insert({ order_id: orderId, type: "note", note: t });

  switch (body.op) {
    case "link":
      return NextResponse.json({ ok: true, url: afterSaleUrl(orderId) });

    case "fit_ok":
      if (c) return NextResponse.json({ error: "Açık talep var; önce onu kapat" }, { status: 400 });
      await sb.from("orders").update({ fit_status: "ok", fit_answered_at: now }).eq("id", orderId);
      await note("Ayakkabı oldu (yönetici işaretledi)");
      return NextResponse.json({ ok: true });

    case "ship_alt": {
      if (!c || c.kind !== "exchange" || !["requested", "waiting_stock"].includes(c.status)) return NextResponse.json({ error: "Gönderilecek değişim talebi yok" }, { status: 400 });
      // İstenen numaralar (yönetici değiştirebilir: body.items [{order_item_id, variant_id}])
      const picks: { order_item_id: string; variant_id: string }[] = (Array.isArray(body.items) && body.items.length ? body.items : c.items)
        .map((x: any) => ({ order_item_id: x.order_item_id, variant_id: x.variant_id || x.want_variant_id }))
        .filter((x: any) => x.order_item_id && x.variant_id);
      if (!picks.length) return NextResponse.json({ error: "Gönderilecek numarayı seç" }, { status: 400 });
      const added: string[] = [];
      for (const p of picks) {
        const { data: id, error } = await sb.rpc("exchange_add_item", { p_order: orderId, p_from_item: p.order_item_id, p_variant: p.variant_id });
        if (error) return NextResponse.json({ error: `Eklenemedi: ${error.message}` }, { status: 400 });
        added.push(id);
      }
      kickMarketplaceSync(500);
      await sb.from("order_cases").update({ status: "alt_shipped", alt_tracking: String(body.tracking || "").trim() || null, updated_at: now }).eq("id", c.id);
      await note(`Değişim: alternatif numara gönderildi${body.tracking ? ` (takip: ${String(body.tracking).trim()})` : ""}`);
      return NextResponse.json({ ok: true, added });
    }

    case "alt_delivered": {
      if (!c || c.kind !== "exchange" || c.status !== "alt_shipped") return NextResponse.json({ error: "Kargodaki alternatif yok" }, { status: 400 });
      await sb.from("order_cases").update({ status: "alt_delivered", updated_at: now }).eq("id", c.id);
      const r = await sendAltDeliveredEmail(orderId).catch((e) => ({ status: "failed", error: e?.message }));
      await note(`Değişim: alternatif teslim edildi — "hangisi oldu?" e-postası ${r.status === "sent" ? "gönderildi" : "gönderilemedi"}`);
      return NextResponse.json({ ok: true, email: r.status });
    }

    case "send_label": {
      const code = String(body.code || "").trim().slice(0, 60);
      const method = body.method || c?.return_method;
      if (!c || !((c.kind === "return" && ["requested", "label_sent"].includes(c.status)) || (c.kind === "exchange" && ["keep_chosen", "label_sent"].includes(c.status)))) {
        return NextResponse.json({ error: "Kargo kodu gönderilecek talep yok" }, { status: 400 });
      }
      if (!code) return NextResponse.json({ error: "Kargo kodunu gir" }, { status: 400 });
      if (!RETURN_METHOD_LABEL[method]) return NextResponse.json({ error: "Kargo yöntemini seç" }, { status: 400 });
      await sb.from("order_cases").update({ status: "label_sent", return_code: code, return_method: method, label_sent_at: now, updated_at: now }).eq("id", c.id);
      const r = await sendReturnLabelEmail(orderId, method, code, c.kind === "exchange").catch((e) => ({ status: "failed", error: e?.message }));
      await note(`${c.kind === "exchange" ? "Değişim" : "İade"} kargo kodu: ${code} (${RETURN_METHOD_LABEL[method]}) — e-posta ${r.status === "sent" ? "gönderildi" : "gönderilemedi"}`);
      return NextResponse.json({ ok: true, email: r.status });
    }

    case "close":
      if (!c) return NextResponse.json({ error: "Açık talep yok" }, { status: 400 });
      await sb.from("order_cases").update({ closed_at: now, updated_at: now, status: c.status + ":kapatildi" }).eq("id", c.id);
      await sb.from("orders").update({ fit_status: "trial" }).eq("id", orderId);
      await note(`${c.kind === "exchange" ? "Değişim" : "İade"} talebi kapatıldı (yönetici)`);
      return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
