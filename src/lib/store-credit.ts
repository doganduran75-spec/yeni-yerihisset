/* eslint-disable @typescript-eslint/no-explicit-any */
// YeriHisset Kredisi (mağaza kredisi) harcama/iade yardımcıları.
// Kredi affiliate_profiles.credit_balance'da tutulur; harcayan kişi = siparişin
// sahibi kullanıcı (aynı zamanda affiliate). Tüm doğrulama/düşme SUNUCUDA yapılır.

import type { createAdminClient } from "@/lib/supabase-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

function round2(n: number) { return Math.round(n * 100) / 100; }

/** Kullanıcının affiliate cüzdanı (varsa). */
export async function getUserWallet(supabase: AdminClient, userId: string): Promise<{ affiliateId: string; balance: number } | null> {
  const { data } = await (supabase as any)
    .from("affiliate_profiles")
    .select("id, credit_balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { affiliateId: data.id, balance: Number(data.credit_balance || 0) };
}

/**
 * İstenen krediyi güvenli sınıra çeker: 0..min(bakiye, preTotal).
 * preTotal = kredi ÖNCESİ ödenecek tutar (ürün + kargo − kupon).
 * Yazma YAPMAZ; sadece uygulanacak tutarı ve cüzdanı döner.
 */
export async function resolveCreditApply(
  supabase: AdminClient,
  userId: string,
  requested: number,
  preTotal: number
): Promise<{ applied: number; wallet: { affiliateId: string; balance: number } | null }> {
  const wallet = await getUserWallet(supabase, userId);
  const req = Number(requested || 0);
  if (!wallet || wallet.balance <= 0 || req <= 0 || preTotal <= 0) {
    return { applied: 0, wallet };
  }
  const applied = round2(Math.min(req, wallet.balance, preTotal));
  return { applied: applied > 0 ? applied : 0, wallet };
}

/**
 * Krediyi düşer: cüzdan bakiyesini azalt, ledger'a 'spend' yaz, siparişe işaretle.
 * resolveCreditApply ile hesaplanmış `applied` ve `wallet` verilmeli.
 */
export async function deductCreditForOrder(
  supabase: AdminClient,
  params: { userId: string; orderId: string; applied: number; wallet: { affiliateId: string; balance: number } }
): Promise<void> {
  const { userId, orderId, applied, wallet } = params;
  if (applied <= 0) return;
  const newBal = round2(wallet.balance - applied);
  await (supabase as any).from("affiliate_profiles").update({ credit_balance: newBal }).eq("id", wallet.affiliateId);
  await (supabase as any).from("orders").update({ credit_used: applied }).eq("id", orderId);
  await (supabase as any).from("store_credit_ledger").insert({
    affiliate_id: wallet.affiliateId,
    user_id: userId,
    type: "spend",
    amount: -applied,
    balance_after: newBal,
    order_id: orderId,
    note: "Sepette YeriHisset Kredisi kullanımı",
  });
}

/**
 * İptal/iade durumunda kullanılan krediyi cüzdana geri yükler (idempotent:
 * credit_restored bayrağı). Sipariş id'sinden çalışır.
 */
export async function restoreOrderCredit(supabase: AdminClient, orderId: string): Promise<void> {
  const { data: order } = await (supabase as any)
    .from("orders")
    .select("id, user_id, credit_used, credit_restored")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  const used = Number(order.credit_used || 0);
  if (used <= 0 || order.credit_restored) return;

  const wallet = await getUserWallet(supabase, order.user_id);
  if (!wallet) {
    // Cüzdan bulunamadıysa yine de bayrağı set et (çift denemeyi önle)
    await (supabase as any).from("orders").update({ credit_restored: true }).eq("id", orderId);
    return;
  }
  const newBal = round2(wallet.balance + used);
  await (supabase as any).from("affiliate_profiles").update({ credit_balance: newBal }).eq("id", wallet.affiliateId);
  await (supabase as any).from("orders").update({ credit_restored: true }).eq("id", orderId);
  await (supabase as any).from("store_credit_ledger").insert({
    affiliate_id: wallet.affiliateId,
    user_id: order.user_id,
    type: "refund",
    amount: used,
    balance_after: newBal,
    order_id: orderId,
    note: "İptal/iade — YeriHisset Kredisi iadesi",
  });
}
