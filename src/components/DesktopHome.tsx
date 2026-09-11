"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Link from "next/link";
import {
  GraduationCap, ShoppingBag, ArrowRight, ChevronRight, Footprints, BadgeCheck,
  Truck, CreditCard, Sprout, Eye, ShoppingCart, Check, Loader2,
} from "lucide-react";
import { formatPriceDisplay, getMinPrice } from "@/lib/product-price";
import { track } from "@/lib/track";

// DESIGN.md ("YeriHisset Grounded Wellness") temelli MASAÜSTÜ ana sayfa.
// page.tsx'te hidden md:block ile yalnız masaüstünde gösterilir. Kendi footer'ını
// içerir; global Footer'a ve üst menüye (Navbar) dokunulmaz.
const C = {
  base: "#FCFAF6",
  card: "#FFFFFF",
  ink: "#1C1C19",
  muted: "#42493A",
  stone: "#76746C",
  green: "#4B7D1E",
  greenText: "#3F6D14",
  greenBtnHover: "#3F6D14",
  charcoal: "#232320",
  clay: "#D0440B",
  leafTint: "#EBF4E2",
  leafBorder: "#D8EAC7",
  border: "#E8E4DC",
  warm: "#F3EFEA",
};
const EPI = "var(--font-epilogue), 'Epilogue', system-ui, sans-serif";
const JAK = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";

const TRUST = [
  { icon: Footprints, label: "Doğal Ayak Sağlığı" },
  { icon: BadgeCheck, label: "%100 Doğal Deri" },
  { icon: Truck, label: "Hızlı & Güvenli Kargo" },
  { icon: CreditCard, label: "Vade Farksız 3 Taksit" },
];

const FOOT_COLS = [
  {
    title: "Koleksiyonlar",
    links: [
      { label: "Tüm Barefoot Modelleri", href: "/products" },
      { label: "Dodura Yetişkin Serisi", href: "/marka/dodura" },
      { label: "Attipas İlk Adım", href: "/marka/attipas" },
      { label: "Doğal Taban Çoraplar", href: "/products" },
    ],
  },
  {
    title: "Faydalı Bilgiler",
    links: [
      { label: "Barefoot Ayakkabı Nedir?", href: "/barefoot-nedir" },
      { label: "Ayak Ölçüm Rehberi", href: "/bilgi-bankasi" },
      { label: "Sıkça Sorulan Sorular", href: "/bilgi-bankasi" },
      { label: "İade ve Değişim", href: "/bilgi-bankasi" },
    ],
  },
];

export default function DesktopHome({
  products, loading, onQuickAdd, addedId,
}: {
  products: any[];
  loading?: boolean;
  onQuickAdd?: (p: any) => void;
  addedId?: string | null;
}) {
  const popular = (products || []).slice(0, 4);

  return (
    <div style={{ fontFamily: JAK, background: C.base, color: C.ink }}>
      {/* ── Karşılama / segmentasyon ── */}
      <section className="container mx-auto px-8 pt-16 pb-4 max-w-6xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-7"
          style={{ background: C.leafTint, border: `1px solid ${C.leafBorder}`, color: C.greenText, fontSize: 13, fontWeight: 600 }}>
          <Sprout size={15} /> Yerin Hissini Keşfedin — Doğal Adımlara Hoş Geldiniz
        </span>
        <h1 style={{ fontFamily: EPI, fontWeight: 600, fontSize: 46, lineHeight: 1.1, letterSpacing: "-0.02em", color: C.ink, textWrap: "balance" }}>
          Bugün YeriHisset&apos;e hangi adımla geldin?
        </h1>
        <p className="mx-auto" style={{ color: C.stone, fontSize: 18, lineHeight: 1.55, marginTop: 16, maxWidth: 640 }}>
          Sana en doğru deneyimi sunabilmemiz için ihtiyacını seç, yolculuğunu birlikte başlatalım.
        </p>

        {/* İki büyük kart */}
        <div className="grid grid-cols-2 gap-6 mt-12 text-left max-w-5xl mx-auto">
          <ChoiceCard
            href="/barefoot-nedir" onClick={() => track("hero_click", { side: "kesif", to: "/barefoot-nedir" })}
            icon={GraduationCap} pill="İlk Kez Başlayanlar İçin"
            title="Barefoot Rehberini Keşfet"
            body="Yalınayak felsefesi, anatomik ayak yapısı ve sağlıklı adımların biyomekaniğini keşfedin."
            cta="Rehberi İncele" ctaBg={C.green} ctaHover={C.greenBtnHover}
          />
          <ChoiceCard
            href="/products" onClick={() => track("hero_click", { side: "magaza", to: "/products" })}
            icon={ShoppingBag} pill="Doğrudan Alışveriş"
            title="Doğrudan Mağazaya Geç"
            body="Dodura deri ayakkabılar, Attipas ilk adım modelleri ve denge barlarını hemen inceleyin."
            cta="Koleksiyonları Gör" ctaBg={C.charcoal} ctaHover="#000"
          />
        </div>

        <div className="mt-8">
          <a href="#populer-desktop" className="inline-flex items-center gap-2" style={{ color: C.muted, fontSize: 15, fontWeight: 600 }}>
            Veya doğrudan ana sayfaya devam et <ArrowRight size={17} />
          </a>
        </div>

        {/* Güven barı */}
        <div className="mt-12 rounded-2xl flex items-center justify-between px-8 py-5 max-w-5xl mx-auto"
          style={{ background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 4px 20px -2px rgba(39,39,36,0.05)" }}>
          {TRUST.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.label} className="flex items-center gap-2.5">
                <Icon size={20} style={{ color: C.green }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{t.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Popüler Modeller ── */}
      <section id="populer-desktop" className="container mx-auto px-8 pt-16 pb-16 max-w-6xl">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p style={{ color: C.greenText, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}>POPÜLER MODELLER</p>
            <h2 style={{ fontFamily: EPI, fontWeight: 600, fontSize: 34, letterSpacing: "-0.015em", color: C.ink, marginTop: 4 }}>Öne Çıkan Barefoot Seçenekleri</h2>
          </div>
          <Link href="/products" className="inline-flex items-center gap-1.5 shrink-0" style={{ color: C.greenText, fontSize: 15, fontWeight: 700 }}>
            Tümünü Gör <ChevronRight size={17} />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                <div style={{ aspectRatio: "4 / 3", background: C.warm }} />
                <div className="p-4 space-y-3">
                  <div className="h-4 rounded" style={{ background: C.warm, width: "80%" }} />
                  <div className="h-4 rounded" style={{ background: C.warm, width: "40%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-6">
            {popular.map((p) => (
              <ProductCard key={p.id} p={p} onQuickAdd={onQuickAdd} added={addedId === p.id} />
            ))}
          </div>
        )}
      </section>

      {/* ── Vade Farksız 3 Taksit ── */}
      <section style={{ background: C.clay }}>
        <div className="container mx-auto px-8 py-8 max-w-6xl flex items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.16)" }}>
              <CreditCard size={26} color="#fff" />
            </div>
            <div>
              <p style={{ fontFamily: EPI, fontStyle: "italic", fontWeight: 700, fontSize: 26, color: "#fff", letterSpacing: "0.01em" }}>VADE FARKSIZ 3 TAKSİT</p>
              <p style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, marginTop: 2 }}>Tüm Dodura &amp; Attipas ayakkabılarda peşin fiyatına taksit avantajı</p>
            </div>
          </div>
          <Link href="/products" className="shrink-0 rounded-full px-7 h-12 inline-flex items-center font-bold active:scale-95 transition-transform"
            style={{ background: "#fff", color: C.clay, fontSize: 14 }}>
            Alışverişe Başla
          </Link>
        </div>
      </section>

      {/* ── Footer (ana sayfaya özel) ── */}
      <DesktopFooter />
    </div>
  );
}

function ChoiceCard({ href, onClick, icon: Icon, pill, title, body, cta, ctaBg, ctaHover }: any) {
  const [hover, setHover] = useState(false);
  return (
    <div className="rounded-2xl p-8 flex flex-col" style={{ background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 4px 20px -2px rgba(39,39,36,0.05)" }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" style={{ background: C.leafTint }}>
        <Icon size={26} style={{ color: C.green }} />
      </div>
      <span className="self-start rounded-full px-3 py-1 mb-3" style={{ background: C.leafTint, color: C.greenText, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{pill}</span>
      <h3 style={{ fontFamily: EPI, fontWeight: 600, fontSize: 24, letterSpacing: "-0.01em", color: C.ink }}>{title}</h3>
      <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, marginTop: 10, marginBottom: 24 }}>{body}</p>
      <Link href={href} onClick={onClick}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className="mt-auto rounded-xl h-12 flex items-center justify-between px-6 font-bold transition-colors"
        style={{ background: hover ? ctaHover : ctaBg, color: "#fff", fontSize: 14.5 }}>
        {cta} <ArrowRight size={18} />
      </Link>
    </div>
  );
}

function ProductCard({ p, onQuickAdd, added }: { p: any; onQuickAdd?: (p: any) => void; added?: boolean }) {
  const img = (p.images && p.images.length > 0) ? p.images[0] : (p.image_url || "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=400");
  const badge = p.categories?.name || p.brands?.name;
  const code = p.sku || null;
  return (
    <div className="rounded-2xl overflow-hidden group" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <Link href={`/products/${p.slug}`} className="block relative" style={{ aspectRatio: "4 / 3", background: C.warm }}>
        <img src={img} alt={p.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        {badge && (
          <span className="absolute top-3 left-3 rounded-full px-3 py-1" style={{ background: "rgba(255,255,255,0.94)", color: C.ink, fontSize: 11.5, fontWeight: 700 }}>{badge}</span>
        )}
      </Link>
      <div className="p-4">
        <Link href={`/products/${p.slug}`}>
          <h3 style={{ fontFamily: EPI, fontWeight: 600, fontSize: 16, color: C.ink, lineHeight: 1.3 }}>{p.title}</h3>
        </Link>
        {code && <p style={{ color: C.stone, fontSize: 12.5, marginTop: 3 }}>{code}</p>}
        <div className="flex items-center justify-between mt-3">
          <span style={{ color: C.greenText, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>{formatPriceDisplay(p)}</span>
          {p.has_variants ? (
            <Link href={`/products/${p.slug}`} aria-label="İncele"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
              style={{ background: C.leafTint, color: C.greenText }}>
              <Eye size={18} />
            </Link>
          ) : (
            <button onClick={() => onQuickAdd?.(p)} aria-label="Sepete ekle"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors active:scale-90"
              style={{ background: added ? C.green : C.leafTint, color: added ? "#fff" : C.greenText }}>
              {added ? <Check size={18} /> : <ShoppingCart size={18} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DesktopFooter() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setState("ok"); setMsg("Teşekkürler! Kaydınız alındı."); setEmail(""); }
      else { setState("err"); setMsg(d.error || "Bir sorun oluştu."); }
    } catch {
      setState("err"); setMsg("Bağlantı hatası, tekrar deneyin.");
    }
  }

  return (
    <footer style={{ background: C.base, borderTop: `1px solid ${C.border}` }}>
      <div className="container mx-auto px-8 py-16 max-w-6xl grid grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Sprout size={22} style={{ color: C.green }} />
            <span style={{ fontFamily: EPI, fontWeight: 700, fontSize: 20, color: C.ink }}>YeriHisset</span>
          </div>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
            Doğal ayak anatomisini koruyan, sıfır düşüş ve geniş burun tasarımlı barefoot ayakkabılarla yeri hissedin.
          </p>
        </div>

        {FOOT_COLS.map((col) => (
          <div key={col.title}>
            <h4 style={{ fontFamily: EPI, fontWeight: 600, fontSize: 15, color: C.ink, marginBottom: 16 }}>{col.title}</h4>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} style={{ color: C.muted, fontSize: 14 }} className="hover:underline">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h4 style={{ fontFamily: EPI, fontWeight: 600, fontSize: 15, color: C.ink, marginBottom: 16 }}>Bülten</h4>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>
            Yeni modeller ve yalınayak sağlık rehberlerinden haberdar olun.
          </p>
          <form onSubmit={submit} className="flex gap-2">
            <input
              type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setState("idle"); }}
              placeholder="E-posta adresiniz"
              className="flex-1 min-w-0 rounded-lg px-3 h-11 outline-none"
              style={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 14, color: C.ink }}
            />
            <button type="submit" disabled={state === "loading"}
              className="rounded-lg px-5 h-11 font-bold shrink-0 inline-flex items-center gap-1.5 active:scale-95 transition-transform"
              style={{ background: C.green, color: "#fff", fontSize: 14 }}>
              {state === "loading" ? <Loader2 size={16} className="animate-spin" /> : "Katıl"}
            </button>
          </form>
          {msg && <p style={{ fontSize: 12.5, marginTop: 8, color: state === "ok" ? C.greenText : C.clay }}>{msg}</p>}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="container mx-auto px-8 py-5 max-w-6xl flex items-center justify-between">
          <p style={{ color: C.stone, fontSize: 13 }}>© 2024 YeriHisset. Tüm hakları saklıdır.</p>
          <p className="inline-flex items-center gap-1.5" style={{ color: C.stone, fontSize: 13 }}>
            <Sprout size={14} style={{ color: C.green }} /> Doğal adımlar, sağlıklı beden.
          </p>
        </div>
      </div>
    </footer>
  );
}
