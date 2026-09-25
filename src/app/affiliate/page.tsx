import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
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
  title: "Satış Ortaklığı Programı",
  description:
    "YeriHisset satış ortaklığı programına katıl, paylaşımlarından YeriHisset Kredisi kazan.",
};

// Oran admin'den değişebilir → sayfa 5 dk'da bir tazelenir
export const revalidate = 300;

async function getDefaultRate(): Promise<number> {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await (sb as any).from("settings").select("affiliate_default_rate").limit(1).maybeSingle();
    return Number(data?.affiliate_default_rate ?? 10) || 10;
  } catch {
    return 10;
  }
}

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/^https?:\/\//, "");

const getSteps = (rate: number) => [
  {
    num: "01",
    title: "Başvur",
    desc: "Hesabım sayfasından birkaç soruyu yanıtlayarak affiliate programına katıl. Anında aktif ol.",
  },
  {
    num: "02",
    title: "Linki Paylaş",
    desc: `En kolayı ana sayfa linkin: ${SITE}/?ref=KODUN. İstersen mağaza, kategori ya da bir ürün linkinin sonuna da ?ref=KODUN ekleyebilirsin.`,
  },
  {
    num: "03",
    title: "Kazanç Elde Et",
    desc: `Linkinle gelen ziyaretçi 30 gün içinde alışveriş yaparsa, siparişin %${rate}'i YeriHisset Kredisi olarak hesabına eklenir.`,
  },
];

const getBenefits = (rate: number) => [
  { icon: Banknote, title: `%${rate} Kazanç`, desc: "Tamamlanan her satıştan YeriHisset Kredisi kazan; sitede alışverişte indirim olarak kullan." },
  { icon: Link2, title: "Hazır Link", desc: "Ayrı bir link oluşturmana gerek yok. Ana sayfa ya da istediğin sayfanın linkine ?ref=KODUN ekle." },
  { icon: TrendingUp, title: "Gerçek Zamanlı İstatistik", desc: "Tıklama ve satış verilerini hesabından anlık izle." },
  { icon: Users, title: "30 Gün Çerez", desc: "Ziyaretçi 30 gün içinde alışveriş yaparsa komisyon sana ait." },
];

export default async function AffiliateLandingPage() {
  const rate = await getDefaultRate();
  const steps = getSteps(rate);
  const benefits = getBenefits(rate);
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-tighter text-olive-600">
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
                "bg-olive-600 font-bold rounded-xl shadow-lg shadow-olive-100"
              )}
            >
              Hemen Başvur
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 md:py-32 bg-gradient-to-br from-olive-600 to-olive-800 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 text-center relative">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2 text-sm font-bold mb-6 backdrop-blur-sm">
            <Star size={14} fill="currentColor" /> Satış Ortaklığı
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-tight">
            Paylaş,<br />
            <span className="text-olive-200">Kazan.</span>
          </h1>
          <p className="text-xl text-olive-100 max-w-2xl mx-auto mb-10 font-medium leading-relaxed">
            YeriHisset&apos;i paylaş, her satıştan %{rate} YeriHisset Kredisi kazan.
            Bağlantı oluşturmana gerek yok — ana sayfa linkinin sonuna <code className="bg-white/20 px-2 py-0.5 rounded font-mono">?ref=KODUN</code> eklemen yeter.
          </p>
          <Link
            href="/account?tab=affiliate"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "h-16 px-10 text-lg font-black rounded-2xl shadow-2xl gap-2 text-olive-700"
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
              3 adımda satış ortaklığı kazancına başla.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step) => (
              <div key={step.num} className="bg-white p-8 rounded-3xl border shadow-sm text-center space-y-4">
                <div className="w-14 h-14 bg-olive-600 text-white rounded-2xl flex items-center justify-center text-2xl font-black mx-auto">
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
                <div className="w-12 h-12 bg-olive-100 rounded-2xl flex items-center justify-center text-olive-600">
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
                a: "Hayır, satış ortaklığı programına katılmak tamamen ücretsizdir.",
              },
              {
                q: "Kazancım ne zaman ve nasıl hesabıma geçer?",
                a: "Kazanç nakit ödenmez; YeriHisset Kredisi olarak hesabına eklenir. Her ay, bir önceki ay teslim edilip tamamlanan (iade edilmemiş) siparişler üzerinden hesaplanır. Krediyi sepette indirim olarak kullanırsın.",
              },
              {
                q: "Linki nasıl kullanırım?",
                a: `En basiti ana sayfa linkini paylaşmak: ${SITE}/?ref=KODUN. Belirli bir ürünü öneriyorsan o ürünün linkine de ekleyebilirsin: ${SITE}/products/urun-adi?ref=KODUN. Hangi sayfadan gelirse gelsin, 30 gün içindeki alışveriş sana yazılır.`,
              },
              {
                q: "Çerez süresi nedir?",
                a: "Ziyaretçi linkinize tıkladıktan sonra 30 gün içinde yaptığı alışverişler komisyon olarak sayılır.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="bg-white p-6 rounded-2xl border space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-olive-600 shrink-0 mt-0.5" />
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
      <section className="py-24 bg-olive-600 text-white text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-black mb-4">Hemen Başlamaya Hazır mısın?</h2>
          <p className="text-olive-100 mb-8 font-medium text-lg">
            Hesabın varsa şimdi başvur, yoksa ücretsiz kayıt ol.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/account?tab=affiliate"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "h-14 px-10 text-lg font-black rounded-2xl text-olive-700"
              )}
            >
              Satış Ortağı Ol
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-14 px-10 text-lg font-black rounded-2xl bg-transparent border-2 border-white/70 text-white hover:bg-white hover:text-olive-700"
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
