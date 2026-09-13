import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/**
 * Yasal/kurumsal sayfalar için ortak düzen (Gizlilik, KVKK, Mesafeli Satış,
 * İade, Çerez, İletişim). İçerik `children` olarak gelir.
 *
 * NOT: Bu sayfaların metinleri şu an YER TUTUCU'dur — bağlayıcı hukuki metinler
 * danışman onayıyla doldurulmalıdır (kullanıcı kararı: iskelet + yer tutucu).
 */
export default function LegalPageLayout({
  title,
  intro,
  draft = true,
  children,
}: {
  title: string;
  intro?: string;
  draft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="min-h-[60vh] bg-cream">
        <div className="container mx-auto px-4 py-16 md:py-20 max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight italic text-slate-900 mb-3">{title}</h1>
          {intro && <p className="text-slate-500 leading-relaxed mb-8">{intro}</p>}

          {draft && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 mb-8 text-sm text-amber-800">
              <b>Taslak / yer tutucu:</b> Bu sayfanın metni henüz nihai değildir. Bağlayıcı
              hukuki metin, danışman onayı alındıktan sonra buraya yerleştirilecektir.
            </div>
          )}

          <div className="space-y-6 text-slate-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-slate-900 [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-[15px] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_li]:text-[15px]">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
