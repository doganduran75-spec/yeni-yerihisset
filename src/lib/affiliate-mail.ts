// Satış ortaklığı e-postaları — "hakedişin hesabına yüklendi" (dönem kapanışı: /api/admin/affiliate/payout;
// deneme: CRM › E-posta denemesi).
import { sendSiteMail, mailButton } from "@/lib/site-mail";
import { escapeHtml } from "@/lib/notifications";

// "Hakedişin hesabına yüklendi" — metin canlı öncesi kullanıcıyla gözden geçirilecek (go-live listesi)
export async function sendCreditLoadedEmail(p: { to: string; name: string | null; amount: number; balance: number; period: string; orderCount: number }) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");
  const tl = (n: number) => `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const name = escapeHtml((p.name || "").trim());
  const body = `
    <h1 style="font-size:21px;font-weight:800;color:#111827;margin:0 0 12px">Hakedişin hesabına yüklendi 🎉</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 12px">Merhaba${name ? ` ${name}` : ""}, <b>${escapeHtml(p.period)}</b> döneminde paylaşımlarınla gelen <b>${p.orderCount}</b> siparişten kazandığın YeriHisset Kredisi hesabına eklendi.</p>
    <div style="margin:0 0 14px;padding:16px;border-radius:14px;background:#f7fee7;border:1px solid #d9f99d;text-align:center">
      <div style="font-size:13px;color:#4d7c0f">Bu dönem kazancın</div>
      <div style="font-size:28px;font-weight:800;color:#1a2e05;margin:2px 0 6px">${tl(p.amount)}</div>
      <div style="font-size:13px;color:#4d7c0f">Güncel bakiyen: <b>${tl(p.balance)}</b></div>
    </div>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0">Bakiyeni bir sonraki alışverişinde ödeme adımında “YeriHisset Kredisi kullan” ile harcayabilirsin.</p>
    ${mailButton(`${site}/magaza`, "Alışverişe başla")}
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0">Kazanç geçmişini Hesabım › Satış Ortaklığı’nda görebilirsin.</p>`;
  return sendSiteMail(p.to, "hakedişin hesabına yüklendi", body);
}
