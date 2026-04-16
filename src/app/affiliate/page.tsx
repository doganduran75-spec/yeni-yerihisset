import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  Link2,
  Banknote,
  Users,
  ChevronRight,
  CheckCircle2,
  Star,
} from "lucide-react";

export const metadata = {
  title: "Affiliate Programı | YeriHisset",
  description:
    "YeriHisset affiliate programına katıl, paylaşımlarından kazanç elde et.",
};

const steps = [
  {
    num: "01",
    title: "Başvur",
    desc: "Hesabım sayfasından birkaç soruyu yanıtlayarak affiliate programına katıl. Anında aktif ol.",
  },
  {
    num: "02",
    title: "Linki Paylaş",
    desc: "İstediğin herhangi bir ürün URL'sinin sonuna ?ref=KODUN ekle. Örn: /products/vazo?ref=ahmet12",
  },
  {
    num: "03",
    title: "Kazanç Elde Et",
    desc: "Linkinle gelen ziyaretçi 30 gün içinde alışveriş yaparsa %10 komisyon hesabına yansır.",
  },
];

const benefits = [
  { icon: Banknote, title: "%10 Komisyon", desc: "Her başarılı satıştan net komisyon kazan." },
  { icon: Link2, title: "Hazır Link", desc: "Ayrı bir link oluşturmana gerek yok. İstediğin ürüne ref parametresi ekle." },
  { icon: TrendingUp, title: "Gerçek Zamanlı İstatistik", desc: "Tıklama ve satış verilerini hesabından anlık izle." },
  { icon: Users, title: "30 Gün Çerez", desc: "Ziyaretçi 30 gün içinde alışveriş yaparsa komisyon sana ait." },
];

export default function AffiliateLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-tighter text-blue-600">
            Yeri<span className="text-slate-900">Hisset</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "font-bold")}>
              Giriş Yap
            </Link>
            <Link
              href="/account?tab=affiliate"
              className={cn(
                buttonVariants({ variant: "default" }),
                "bg-blue-600 font-bold rounded-xl shadow-lg shadow-blue-100"
              )}
            >
              Hemen Başvur
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 md:py-32 bg-gradient-to-br from-blue-600 to-blue-800 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 text-center relative">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2 text-sm font-bold mb-6 backdrop-blur-sm">
            <Star size={14} fill="currentColor" /> Affiliate Programı
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-tight">
            Paylaş,<br />
            <span className="text-blue-200">Kazan.</span>
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10 font-medium leading-relaxed">
            YeriHisset ürünlerini paylaş, her satıştan %10 komisyon kazan.
            Bağlantı oluşturmana gerek yok — sadece URL'ye <code className="bg-white/20 px-2 py-0.5 rounded font-mono">?ref=KODUN</code> ekle.
          </p>
          <Link
            href="/account?tab=affiliate"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "h-16 px-10 text-lg font-black rounded-2xl shadow-2xl gap-2 text-blue-700"
            )}
          >
            Ücretsiz Katıl <ChevronRight size={20} />
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-slate-900 mb-4">Nasıl Çalışır?</h2>
            <p className="text-slate-500 font-medium max-w-xl mx-auto">
              3 adımda affiliate kazancına başla.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step) => (
              <div key={step.num} className="bg-white p-8 rounded-3xl border shadow-sm text-center space-y-4">
                <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-2xl font-black mx-auto">
                  {step.num}
                </div>
                <h3 className="text-xl font-black text-slate-900">{step.title}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-slate-900 mb-4">Program Avantajları</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {benefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-6 rounded-3xl border bg-slate-50 space-y-3">
                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                  <Icon size={24} />
                </div>
                <h3 className="font-black text-slate-900">{title}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-slate-50">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-4xl font-black text-slate-900 text-center mb-12">Sıkça Sorulan Sorular</h2>
          <div className="space-y-4">
            {[
              {
                q: "Başvuru ücreti var mı?",
                a: "Hayır, affiliate programına katılmak tamamen ücretsizdir.",
              },
              {
                q: "Komisyon ne zaman ödenir?",
                a: "Sipariş teslim edildikten ve iade süresi (14 gün) dolduktan sonra komisyon onaylanır ve ödeme yapılır.",
              },
              {
                q: "Linki nasıl kullanırım?",
                a: "Herhangi bir ürün sayfasının URL'sine ?ref=KODUN eklemen yeterli. Örneğin: yerihisset.com/products/dekoratif-vazo?ref=ahmet12",
              },
              {
                q: "Çerez süresi nedir?",
                a: "Ziyaretçi linkinize tıkladıktan sonra 30 gün içinde yaptığı alışverişler komisyon olarak sayılır.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="bg-white p-6 rounded-2xl border space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-slate-900">{q}</h4>
                    <p className="text-sm text-slate-500 mt-1 font-medium leading-relaxed">{a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-blue-600 text-white text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-black mb-4">Hemen Başlamaya Hazır mısın?</h2>
          <p className="text-blue-100 mb-8 font-medium text-lg">
            Hesabın varsa şimdi başvur, yoksa ücretsiz kayıt ol.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/account?tab=affiliate"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "h-14 px-10 text-lg font-black rounded-2xl text-blue-700"
              )}
            >
              Affiliate Ol
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-14 px-10 text-lg font-black rounded-2xl border-white/30 text-white hover:bg-white/10"
              )}
            >
              Üye Ol
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-8 border-t text-center">
        <p className="text-slate-500 text-sm">© {new Date().getFullYear()} YeriHisset. Tüm hakları saklıdır.</p>
      </footer>
    </div>
  );
}
