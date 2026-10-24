import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { staticPageMetadata } from "@/components/StaticPageView";
import { getStaticPage } from "@/lib/static-pages";
import { getHomeContent } from "@/lib/home-content";
import { TRIAL_DAYS } from "@/lib/order-next-step";

// "BİZ" SAYFASI (kullanıcı isteği: Origo'nun sürdürülebilirlik sayfası gibi görsel, bölümlü).
// Başlık, giriş ve hikâye metni: Ayarlar › Sayfalar › Hakkımızda (static_pages) — burada uydurma bilgi YOK.
// İlkeler: Ana sayfa içeriğindeki barefoot prensipleri (Ayarlar › Ana Sayfa). Sözler: sitenin gerçekten işleyen
// kuralları (14 gün deneme, değişimde iki numara, iade kargosu). Markalar: veritabanından.
export const revalidate = 60;
export const generateMetadata = () => staticPageMetadata("hakkimizda");

async function brandList() {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await sb.from("brands").select("name, slug, logo_url").order("name");
    return (data as { name: string; slug: string; logo_url: string | null }[]) || [];
  } catch { return []; }
}

const PROMISES = [
  { title: `${TRIAL_DAYS} gün evde dene`, text: "Acele yok: evde, günün farklı saatlerinde giy. Teslimden sonra “oldu mu?” diye sorarız; içine sinmezse değişim ya da iade bir tık uzağında." },
  { title: "Değişimde iki numara birden", text: "Numara olmadıysa yenisini hemen gönderiyoruz; ikisini birlikte deneyip olanı tutuyorsun, diğerini geri yolluyorsun." },
  { title: "İade kargosu bizden", text: "İade ya da değişimde geri gönderim kodunu biz veriyoruz; kargo ücreti sana yansımaz." },
];

export default async function HakkimizdaPage() {
  const [p, home, brands] = await Promise.all([getStaticPage("hakkimizda"), getHomeContent(), brandList()]);
  const principles = (home.principles?.items || []).filter((x) => x.show !== false);
  return (
    <>
      <Navbar />
      <main className="bg-cream">
        {/* Giriş */}
        <section className="bg-gradient-to-br from-olive-600 to-olive-800 text-white">
          <div className="container mx-auto px-4 py-16 md:py-24 max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/70 mb-4">Biz</p>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight italic leading-[1.05]">{p.title}</h1>
            {p.intro && <p className="mt-6 text-lg md:text-xl text-white/85 leading-relaxed max-w-2xl">{p.intro}</p>}
          </div>
        </section>

        {/* Hikâye (panelden) */}
        <section className="container mx-auto px-4 py-14 md:py-20 max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-olive-600 mb-3">Hikâyemiz</p>
          {p.draft && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 mb-6 text-sm text-amber-800"><b>Taslak:</b> Bu metin son kontrol aşamasındadır.</div>
          )}
          <div className="space-y-5 text-slate-700 leading-relaxed text-[16px] [&_h2]:text-2xl [&_h2]:font-black [&_h2]:text-slate-900 [&_h2]:mt-10 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-olive-700 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: p.body }} />
        </section>

        {/* İlkeler */}
        {principles.length > 0 && (
          <section className="bg-white">
            <div className="container mx-auto px-4 py-14 md:py-20 max-w-6xl">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-olive-600 mb-3">Neyi seçiyoruz</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight italic text-slate-900 mb-10">Her ayakkabıda aradığımız {principles.length} şey</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {principles.map((x, i) => (
                  <div key={x.title} className="rounded-3xl bg-cream p-5 flex flex-col">
                    {x.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.image} alt="" className="w-full aspect-[4/3] object-contain mb-4" loading="lazy" />
                    )}
                    <span className="text-xs font-black text-olive-600">0{i + 1}</span>
                    <h3 className="text-lg font-black text-slate-900 mt-1">{x.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed mt-1">{x.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Sözlerimiz */}
        <section className="container mx-auto px-4 py-14 md:py-20 max-w-6xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-olive-600 mb-3">Sana sözümüz</p>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight italic text-slate-900 mb-10">Doğru numara, acele etmeden</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PROMISES.map((x) => (
              <div key={x.title} className="rounded-3xl border-2 border-olive-100 bg-white p-6">
                <h3 className="text-xl font-black text-slate-900">{x.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed mt-2">{x.text}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">Ayrıntılar: <Link href="/iade-degisim" className="underline">İade ve değişim</Link></p>
        </section>

        {/* Markalar */}
        {brands.length > 0 && (
          <section className="bg-white">
            <div className="container mx-auto px-4 py-14 md:py-20 max-w-6xl">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-olive-600 mb-3">Birlikte çalıştığımız markalar</p>
              <div className="flex flex-wrap gap-3 mt-6">
                {brands.map((b) => (
                  <Link key={b.slug} href={`/marka/${b.slug}`} className="h-16 min-w-32 px-5 rounded-2xl bg-cream flex items-center justify-center hover:bg-olive-50 transition-colors">
                    {b.logo_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={b.logo_url} alt={b.name} className="max-h-9 max-w-36 object-contain" loading="lazy" />
                      : <span className="font-black text-slate-800">{b.name}</span>}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Mağazalar */}
        <section className="container mx-auto px-4 py-14 md:py-20 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link href="/magaza/yetiskin" className="group rounded-3xl bg-olive-800 text-white p-8 md:p-10 hover:bg-olive-700 transition-colors">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/70">Mağaza</p>
              <h3 className="text-3xl font-black italic mt-2">Yetişkin</h3>
              <p className="text-white/80 mt-2">Günlük, yürüyüş, iş — her güne barefoot.</p>
              <span className="inline-block mt-6 font-black underline group-hover:no-underline">Modelleri gör →</span>
            </Link>
            <Link href="/magaza/ilkadim" className="group rounded-3xl bg-orange-500 text-white p-8 md:p-10 hover:bg-orange-600 transition-colors">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/80">Mağaza</p>
              <h3 className="text-3xl font-black italic mt-2">İlkadım · 0–4 yaş</h3>
              <p className="text-white/85 mt-2">İlk adımlar için hafif, esnek, geniş burunlu.</p>
              <span className="inline-block mt-6 font-black underline group-hover:no-underline">Modelleri gör →</span>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
