import crypto from "crypto";
import { createAdminClient } from "./supabase-admin";
import { sendEmailVerification } from "./notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Bir üyeye e-posta doğrulama token'ı üretir, profiles'a yazar ve app SMTP ile
 * onay e-postasını gönderir. register / resend / e-posta-düzelt paylaşır.
 * Bayrağı false'a çeker (yeni adres henüz doğrulanmadı).
 */
export async function issueEmailVerification(
  userId: string,
  email: string,
  name?: string | null
): Promise<{ status: "sent" | "failed"; error?: string }> {
  const supabase = createAdminClient();
  const token = crypto.randomBytes(32).toString("hex");
  await (supabase as any).from("profiles").update({
    email_verify_token: token,
    email_verify_sent_at: new Date().toISOString(),
    email_verified: false,
    email_verified_at: null,
  }).eq("id", userId);

  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  const verifyUrl = `${storeUrl}/eposta-onay?token=${token}`;
  return sendEmailVerification({ to: email, name: name ?? null, verifyUrl });
}
