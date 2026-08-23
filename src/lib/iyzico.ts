/**
 * iyzico istemci yapılandırması.
 * API anahtarları .env.local'dan okunur.
 *
 * IYZICO_API_KEY=sandbox-...
 * IYZICO_SECRET_KEY=sandbox-...
 * IYZICO_BASE_URL=https://sandbox-api.iyzipay.com   (test)
 *               =https://api.iyzipay.com             (canlı)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Iyzipay = require("iyzipay");

export function createIyzicoClient() {
  return new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY!,
    secretKey: process.env.IYZICO_SECRET_KEY!,
    uri: process.env.IYZICO_BASE_URL ?? "https://sandbox-api.iyzipay.com",
  });
}

/** İki ondalık basamaklı, noktalı string (iyzico zorunlu formatı) */
export function formatPrice(amount: number): string {
  return amount.toFixed(2);
}

/** Benzersiz conversationId üret */
export function newConversationId(): string {
  return `yh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
