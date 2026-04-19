// GA4 / gtag.js global tip tanımlamaları
declare function gtag(
  command: "config",
  targetId: string,
  config?: Record<string, unknown>
): void;
declare function gtag(
  command: "event",
  eventName: string,
  params?: Record<string, unknown>
): void;
declare function gtag(command: "js", date: Date): void;
declare function gtag(command: "set", params: Record<string, unknown>): void;

interface Window {
  gtag: typeof gtag;
  dataLayer: unknown[];
}
