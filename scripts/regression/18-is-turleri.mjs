// SİPARİŞ İŞ TÜRLERİ + PARAŞÜT KESİNTİSİNDE YENİDEN DENEME (kullanıcı 2026-11-25): panodaki "Bekleyen sipariş işi" türüne
// bölündü (Ödeme beklenen / Sevk edilecek / Fatura kesilecek / İade-talep-diğer), listede her siparişin satırında yapılacak iş
// yazar. Paraşüt bakımdayken (HTML bakım sayfası / 502-504 / bağlantı yok) fatura "retry" olur: yöneticiden iş yok, 10 dakikada
// bir kendiliğinden yeniden denenir, 12 saat geçerse "error" olup işe düşer. Kural + kod denetimi; veri değiştirmez.
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Sipariş iş türleri + Paraşüt kesintisi",
  async run(t) {
    await t.part("İş türü kuralı (ödeme / sevk / fatura / diğer)", async () => {
      let g = null;
      try { g = await import(new URL("../../src/lib/order-next-step.ts", import.meta.url)); } catch { /* eski Node */ }
      if (!g) { t.add("warn", "İş türü kuralı denenemedi", "Node TS yükleyemedi"); return; }
      const now = new Date().toISOString();
      const site = { channel: "site", import_source: null, status: "processing", payment_status: "paid", shipment_status: "waiting", invoice_status: "pending",
        total_amount: 100, refunded_amount: 0, created_at: now };
      const cases = [
        ["Havale bekleyen sipariş → Ödeme beklenen", { ...site, payment_status: "pending", payment_method: "bank_transfer" }, "payment"],
        ["Ödendi, hazırlanacak → Sevk edilecek", site, "ship"],
        ["Paket hazır, Paraşüt hatası → Fatura kesilecek", { ...site, packed_at: now, parasut_status: "error", parasut_error: "x" }, "invoice"],
        ["Pazaryeri paket hazır, fatura kesilmedi → Fatura kesilecek", { ...site, channel: "trendyol", packed_at: now }, "invoice"],
        ["Teslim edildi, oldu, fatura kesilmedi → Fatura kesilecek", { ...site, shipment_status: "delivered", fit_status: "ok", delivered_at: now }, "invoice"],
        ["Trendyol iadesi depoya ulaştı → İade / talep / diğer", { ...site, channel: "trendyol", shipment_status: "delivered", invoice_status: "invoiced", mp_claim_state: "arrived" }, "other"],
      ];
      const bad = [];
      for (const [label, o, want] of cases) {
        const st = g.orderNextStep(o);
        const got = st.needsAction ? g.todoKind(st) : "işi yok";
        if (got !== want) bad.push(`${label}: ${got} (${st.stage})`);
      }
      t.add(!bad.length ? "ok" : "fail", "Her iş doğru satıra düşüyor (ödeme / sevk / fatura / iade-talep-diğer)", bad.join(" · "));
      const labels = (g.TODO_KINDS || []).map((x) => `${x.label}=${x.param}`).join(",");
      t.add(labels === "Ödeme beklenen=odeme,Sevk edilecek=sevk,Fatura kesilecek=fatura,İade / talep / diğer=diger" ? "ok" : "fail", "Pano satırları ve liste adresleri", labels);
      // Paraşüt kesintisi: "retry" → yöneticiden iş yok, düğme "Şimdi yeniden dene"
      const r = g.orderNextStep({ ...site, packed_at: now, parasut_status: "retry", parasut_error: "Paraşüt şu an bakımda" });
      const okR = !r.needsAction && /ulaşılamıyor/.test(r.stage) && r.actions.some((a) => a.key === "invoice_parasut" && a.label === "Şimdi yeniden dene");
      t.add(okR ? "ok" : "fail", "Paraşüt bakımdayken fatura işi yöneticiye düşmüyor (kendiliğinden yeniden denenecek)", okR ? "" : `${r.stage} / ${r.needsAction}`);
    });
    await t.part("Pano, liste ve Paraşüt kodu", async () => {
      const dash = rd("src/app/admin/page.tsx");
      const list = rd("src/app/admin/orders/page.tsx");
      const okD = /\.\.\.todoRows,/.test(dash) && /t\.kind === "invoice" \? uninvoiced\.n : 0/.test(dash) && !/label: "Faturası kesilmemiş"/.test(dash) && !/label: "Bekleyen sipariş işi"/.test(dash);
      t.add(okD ? "ok" : "fail", "Panoda iş türü satırları; fatura satırı kargolanmış faturası kesilmemişleri de sayıyor", okD ? "" : "pano satırları eksik");
      const okL = /data-todo-stage/.test(list) && /fTodo && TODO_KINDS\.map/.test(list) && /retry: \["Paraşüt bakımda/.test(list) && /\["error", "done", "retry"\]/.test(list);
      t.add(okL ? "ok" : "fail", "Listede satırda yapılacak iş, iş türü düğmeleri, Paraşüt bakım rozeti", okL ? "" : "liste eksik");
      const p = rd("src/lib/parasut.ts");
      const inv = rd("src/lib/parasut-invoice.ts");
      const okP = /export function isParasutUnavailable/.test(p) && /<!DOCTYPE\|<html/.test(p) && /timeout\|timed out\|abort/.test(p)
        && /e\.status === 404 && !isParasutUnavailable\(e\)/.test(inv) && /PARASUT_RETRY_HOURS = 12/.test(inv)
        && /const retried = await retryUnavailable\(sb\)/.test(inv) && /if \(e instanceof ParasutRetry\) break;/.test(inv)
        && /if \(e instanceof ParasutRetry\) return \{ status: "retry"/.test(inv);
      t.add(okP ? "ok" : "fail", "Paraşüt bakım sayfası tanınıyor, fatura 10 dk'da bir yeniden deneniyor (bakım 404'ü 'fatura silinmiş' sayılmıyor, zaman aşımında tekrar yok)", okP ? "" : "Paraşüt yeniden deneme kodu eksik");
    });
  },
};
