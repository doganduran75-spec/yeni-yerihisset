/**
 * First-party analitik — client toplayıcı (Yol B).
 * Event'leri kuyruğa alır, aralıklı + sayfa kapanışında /api/track'e gönderir.
 * Oturum kimliği localStorage'da; 30 dk hareketsizlikten sonra yeni oturum.
 * GA'yı DEVRE DIŞI BIRAKMAZ — ona paralel çalışır (bkz. src/lib/analytics.ts).
 *
 * ÇEREZ ONAYI (src/lib/consent.ts + Ayarlar › Çerez onayı):
 *  - istatistik izni VAR → tam kayıt (oturum kimliği, IP sunucuda, yolculuk)
 *  - istatistik izni YOK (Reddet) → yalnız kimliksiz sayım (gün · sayfa · kaynak · cihaz); tarayıcıya hiçbir şey yazılmaz
 *  - seçim YAPILMADI → deneme modunda tam kayıt, KVKK modunda kimliksiz sayım (mod /api/track'ten öğrenilir)
 */
import { consentFor, type ConsentChoice } from "./consent";

type QueuedEvent = { type: string; path: string; meta?: unknown; ts: number };

const SID_KEY = "yh:aid";
const SID_TS_KEY = "yh:aid_ts";
const UTM_KEY = "yh:utm";
const LANDING_KEY = "yh:landing";
const REF_KEY = "yh:ref";
const SESSION_MAX_IDLE = 30 * 60 * 1000; // 30 dk

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let bootstrapped = false;

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionId(): string {
  const store = ls();
  const now = Date.now();
  let sid = store?.getItem(SID_KEY) || "";
  const last = Number(store?.getItem(SID_TS_KEY) || 0);
  if (!sid || now - last > SESSION_MAX_IDLE) {
    sid = uuid();
    try {
      store?.setItem(SID_KEY, sid);
      // Yeni oturum: kaynak/landing'i sıfırla (bir sonraki bootstrap yeniden yakalar)
      sessionStorage.removeItem(UTM_KEY);
      sessionStorage.removeItem(LANDING_KEY);
      sessionStorage.removeItem(REF_KEY);
    } catch {
      /* yut */
    }
    bootstrapped = false;
  }
  try {
    store?.setItem(SID_TS_KEY, String(now));
  } catch {
    /* yut */
  }
  return sid;
}

// Oturumun ilk temasında kaynak (UTM + referrer + landing) yakalanır ve
// sessionStorage'a dondurulur; ilk-temas atfı bozulmasın.
function bootstrapSession() {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    const p = new URLSearchParams(location.search);
    const utm = {
      source: p.get("utm_source") || "",
      medium: p.get("utm_medium") || "",
      campaign: p.get("utm_campaign") || "",
      content: p.get("utm_content") || "",
      term: p.get("utm_term") || "",
    };
    const hasUtm = Object.values(utm).some(Boolean);
    if (!sessionStorage.getItem(LANDING_KEY)) {
      sessionStorage.setItem(LANDING_KEY, location.pathname + location.search);
      sessionStorage.setItem(REF_KEY, document.referrer || "");
    }
    if (hasUtm) applyCampaign(utm);
  } catch {
    /* yut */
  }
}

function readJSON<T>(key: string): T | null {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function flush(useBeacon = false) {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (typeof window === "undefined" || queue.length === 0) return;
  // Mod henüz bilinmiyor: sayfa kapanıyorsa kimliksiz say (güvenli taraf), değilse kısa süre bekle
  if (!mode && consentFor("stats") === null) {
    if (useBeacon) { flushAnon(queue.splice(0, queue.length), true); return; }
    loadMode();
    if (!flushTimer) flushTimer = setTimeout(() => flush(false), 1500);
    return;
  }
  if (!fullTracking()) { flushAnon(queue.splice(0, queue.length), useBeacon); return; }

  const payload = {
    cs: consentFor("stats") === true ? "1" : "", // sunucu KVKK modunda izinsiz tam kaydı kimliksize çevirir
    session_id: getSessionId(),
    user_id: currentUserId,
    referrer: (() => {
      try {
        return sessionStorage.getItem(REF_KEY) || "";
      } catch {
        return "";
      }
    })(),
    landing_path: (() => {
      try {
        return sessionStorage.getItem(LANDING_KEY) || "";
      } catch {
        return "";
      }
    })(),
    utm: readJSON<Record<string, string>>(UTM_KEY) || undefined,
    events: queue.splice(0, queue.length),
  };

  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", blob);
    } else {
      fetch("/api/track", { method: "POST", body: blob, keepalive: true }).catch(() => {});
    }
  } catch {
    /* takip kritik değil */
  }
}

// Ayarlar › Çerez onayı: "open" (deneme modu) / "strict" (KVKK modu). Öğrenilene kadar event'ler bellekte bekler.
let mode: "open" | "strict" | null = null;
let modeLoading = false;
function loadMode() {
  if (mode || modeLoading) return;
  modeLoading = true;
  fetch("/api/track")
    .then((r) => r.json())
    .then((d) => { mode = d?.strict ? "strict" : "open"; })
    .catch(() => { mode = "strict"; }) // öğrenilemezse güvenli taraf: kimliksiz sayım
    .finally(() => { modeLoading = false; if (queue.length) flush(false); });
}

/** Tam kayıt mı (oturum + IP), kimliksiz sayım mı? */
function fullTracking(): boolean {
  const s = consentFor("stats");
  if (s !== null) return s;
  return mode === "open";
}

// Kimliksiz sayım: sayfa yüklenişinin ilk görüntülemesi dış kaynağıyla, sonrakiler "(site içi)"
let anonFirst = true;
function landingSource(): string {
  try {
    const p = new URLSearchParams(location.search);
    const utm = p.get("utm_source");
    if (utm) return utm.slice(0, 60);
    if (p.get("fbclid")) return "facebook / instagram";
    if (p.get("gclid")) return "google reklam";
    const ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
    if (ref && ref !== location.hostname.replace(/^www\./, "")) return ref;
  } catch { /* yut */ }
  return "(doğrudan)";
}

function flushAnon(events: QueuedEvent[], useBeacon: boolean) {
  const views = events.filter((e) => e.type === "page_view").map((e) => {
    const src = anonFirst ? landingSource() : "(site içi)";
    anonFirst = false;
    return { path: e.path, source: src };
  });
  if (!views.length) return;
  const body = new Blob([JSON.stringify({ anon: true, views })], { type: "application/json" });
  try {
    if (useBeacon && navigator.sendBeacon) navigator.sendBeacon("/api/track", body);
    else fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch { /* takip kritik değil */ }
}

/**
 * Çerez penceresindeki seçimi kaydet (onay defteri + bu ziyaretin satırında "Kabul / Red").
 * İstatistik reddedildiyse bu ziyaretin o ana kadarki kaydı sunucuda anonimleşir, tarayıcıdaki kimlik silinir.
 */
export function sendConsent(choice: ConsentChoice) {
  if (typeof window === "undefined") return;
  let sid: string | null = null;
  try { sid = localStorage.getItem(SID_KEY); } catch { /* yut */ }
  try {
    fetch("/api/track", {
      method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: choice, session_id: sid || undefined }),
    }).catch(() => {});
  } catch { /* yut */ }
  if (!choice.stats) {
    try {
      localStorage.removeItem(SID_KEY); localStorage.removeItem(SID_TS_KEY);
      sessionStorage.removeItem(UTM_KEY); sessionStorage.removeItem(LANDING_KEY); sessionStorage.removeItem(REF_KEY);
    } catch { /* yut */ }
    bootstrapped = false;
  }
}

/** Bir analitik event'i kuyruğa al. Her yerden güvenle çağrılabilir. */
export function track(type: string, meta?: unknown) {
  if (typeof window === "undefined") return;
  try {
    loadMode();
    if (fullTracking()) {
      bootstrapSession();
      getSessionId(); // ts tazele
    }
    queue.push({ type, path: location.pathname, meta, ts: Date.now() });
    if (!flushTimer) flushTimer = setTimeout(() => flush(false), 2500);
    if (queue.length >= 20) flush(false);
  } catch {
    /* yut */
  }
}

/** Login/logout sonrası kimliği tracker'a bildir (yolculukta üye adımı için). */
export function setTrackUser(userId: string | null) {
  currentUserId = userId;
}

/**
 * Kampanya landing (/kampanya/[slug]) çağırır: oturuma ilk-temas kaynağını
 * atar (utm yoksa). Böylece slug'lı kısa link, analitikte kampanya olarak ayrışır.
 */
export function setCampaign(source: string, campaign: string, content?: string) {
  if (typeof window === "undefined") return;
  try {
    bootstrapSession();
    applyCampaign({ source, medium: "referral", campaign, content: content || "", term: "" });
  } catch {
    /* yut */
  }
}

// Kampanya/ref bilgisini oturuma işle. Kural (tek kişi = tek kayıt):
//  - Oturumun henüz kaynağı yoksa (doğrudan gezinirken ref linkiyle geldi) AYNI
//    oturum bu kaynağı alır; sunucu da kaynaksız oturumu günceller. Sonradan
//    giriş yaparsa aynı kayıt üye bilgisini de alır → "üye + ref" tek satır.
//  - Bu sekmede zaten BAŞKA bir kampanya varsa (ör. Instagram → sonra ref) yeni
//    oturum başlar; iki kampanya birbirinin ziyaretini çalmasın.
function applyCampaign(utm: Record<string, string>) {
  const cur = readJSON<Record<string, string>>(UTM_KEY);
  if (cur && cur.source === utm.source && cur.campaign === utm.campaign) return; // aynı kampanya
  if (cur && cur.source) startNewSession();
  sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
}

// Yeni oturum kimliği + bu sayfayı landing olarak kaydet. Kuyruktaki event'ler
// (bu sayfanın page_view'ı) yeni oturumla gider — kampanya ziyareti sayılsın.
function startNewSession() {
  const store = ls();
  try {
    store?.setItem(SID_KEY, uuid());
    store?.setItem(SID_TS_KEY, String(Date.now()));
    sessionStorage.setItem(LANDING_KEY, location.pathname + location.search);
    sessionStorage.setItem(REF_KEY, document.referrer || "");
    sessionStorage.removeItem(UTM_KEY);
  } catch {
    /* yut */
  }
}

let listenersReady = false;
/** Bir kez: sayfa kapanışında kalan kuyruğu beacon ile boşalt. */
export function initTrackFlush() {
  if (listenersReady || typeof window === "undefined") return;
  listenersReady = true;
  const onHide = () => flush(true);
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
}
