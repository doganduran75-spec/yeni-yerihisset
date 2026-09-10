import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Footprints, Wind, Activity, HeartPulse, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Barefoot (Çıplak Ayak) Nedir?",
  description: "Barefoot ayakkabı nedir, ayağına ne yapar? Geniş burun, sıfır topuk farkı ve esnek taban ile doğal yürüyüş.",
};

// NOT: Placeholder içerik — gerçek metin/görselleri buraya yerleştir.
const BENEFITS = [
  { icon: Wind, title: "Geniş Burun", desc: "Ayak parmakları sıkışmadan doğal şekilde yayılır." },
  { icon: Activity, title: "Sıfır Topuk Farkı", desc: "Ayağı düz zeminde tutar; duruş ve denge güçlenir." },
  { icon: Footprints, title: "Esnek İnce Taban", desc: "Zemini hisset; ayak kasların doğal çalışır." },
  { icon: HeartPulse, title: "Doğal Hareket", desc: "Âdeta yalınayak yürüyormuş gibi rahat bir his." },
];

export default function BarefootNedirPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-cream">
        {/* Hero */}
        <section className="bg-gradient-to-br from-olive-700 to-olive-900 text-white">
          <div className="container mx-auto px-4 py-20 md:py-28 max-w-3xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-6">
              <Footprints size={32} />
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight italic mb-4">Barefoot Nedir?</h1>
            <p className="text-lg text-white/85 leading-relaxed">
              Barefoot (çıplak ayak) ayakkabılar; geniş burun, sıfır topuk farkı ve esnek ince taban ile
              ayağının <b>doğal hareketini</b> destekler. Ayak âdeta yalınayakmış gibi çalışır.
            </p>
          </div>
        </section>

        {/* Faydalar */}
        <section className="container mx-auto px-4 py-16 md:py-20 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight italic text-center mb-10">Neden Barefoot?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {BENEFITS.map((b) => {
              const Icon = b.icon;
              return (
                <div key={b.title} className="bg-white rounded-3xl border border-olive-100 p-6 shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-olive-50 text-olive-600 flex items-center justify-center mb-4">
                    <Icon size={22} />
                  </div>
                  <h3 className="font-black text-slate-900 mb-1">{b.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* İçerik placeholder — kullanıcı dolduracak */}
        <section className="container mx-auto px-4 pb-16 max-w-3xl">
          <div className="bg-white rounded-3xl border border-olive-100 p-8 md:p-10 shadow-sm space-y-4 text-slate-600 leading-relaxed">
            <h2 className="text-xl font-black text-slate-900">Kimler için uygun?</h2>
            <p>
              (Buraya metin gelecek — barefoot kimler için uygun, nasıl alışılır, numara/geçiş önerileri vb.
              Görsel/video de eklenebilir.)
            </p>
          </div>
        </section>

        {/* CTA → Mağaza */}
        <section className="bg-cream border-t border-olive-100 py-16">
          <div className="container mx-auto px-4 max-w-2xl text-center">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight italic mb-3">Hazır mısın?</h2>
            <p className="text-slate-500 mb-7">Numaranı seç, stoktaki modellere göz at — tek tıkla sipariş ver.</p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 h-14 px-8 rounded-2xl bg-olive-600 hover:bg-olive-700 text-white font-black text-sm uppercase tracking-widest transition-all active:scale-95"
            >
              Mağazaya Git <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
