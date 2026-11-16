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

/** Bakiye, bu sipariş sırasında başka bir siparişte harcandı (aynı anda iki sipariş) — müşteriye gösterilen mesaj. */
export const CREDIT_CHANGED_ERROR = "YeriHisset Kredisi bakiyen az önce değişti. Sayfayı yenileyip tekrar dene.";

/**
 * Krediyi düşer: cüzdan bakiyesini azalt, ledger'a 'spend' yaz, siparişe işaretle — TEK ADIMDA veritabanında
 * (spend_order_credit, migration 20261188000001). Bakiye yetmezse (aynı anda başka sipariş harcadı) ok=false döner
 * ve hiçbir şey değişmez; çağıran siparişi geri almalı. `wallet` yalnız tutarın sınırı için kullanıldı (resolveCreditApply).
 */
export async function deductCreditForOrder(
  supabase: AdminClient,
  params: { userId: string; orderId: string; applied: number; wallet: { affiliateId: string; balance: number } }
): Promise<{ ok: boolean }> {
  const { userId, orderId, applied } = params;
  if (applied <= 0) return { ok: true };
  const { data, error } = await (supabase as any).rpc("spend_order_credit", {
    p_order: orderId, p_user: userId, p_amount: round2(applied),
  });
  if (error || !data?.ok) {
    console.error("[store-credit] kredi düşülemedi", orderId, error?.message ?? data?.error);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * İptal/iade durumunda kullanılan krediyi cüzdana geri yükler — bir kez (restore_order_credit, credit_restored bayrağı
 * veritabanında koşullu çevrilir; aynı anda iki yol çağırsa da tek iade). Sipariş id'sinden çalışır.
 */
export async function restoreOrderCredit(supabase: AdminClient, orderId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("restore_order_credit", { p_order: orderId });
  if (error) console.error("[store-credit] kredi geri yüklenemedi", orderId, error.message);
}

/**
 * İptal edilip krediyi geri almış sipariş sonradan ÖDENDİYSE (kart formu süre dolduktan sonra ödendi) krediyi yeniden
 * düşer. Bakiye yetmezse eldeki kadarını alır; eksik tutarı döner (çağıran yöneticiye not düşer).
 */
export async function reclaimOrderCredit(supabase: AdminClient, orderId: string): Promise<{ shortfall: number }> {
  const { data, error } = await (supabase as any).rpc("reclaim_order_credit", { p_order: orderId });
  if (error) {
    console.error("[store-credit] kredi yeniden düşülemedi", orderId, error.message);
    return { shortfall: 0 };
  }
  return { shortfall: Number(data?.shortfall || 0) };
}
