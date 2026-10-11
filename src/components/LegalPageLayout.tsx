import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/**
 * Yasal/kurumsal sayfalar için ortak düzen (Gizlilik, KVKK, Mesafeli Satış,
 * İade, Çerez, İletişim). İçerik `children` olarak gelir.
 *
 * Metinler 2026-10-11'de yazıldı (taslak); son kontrol kullanıcı + avukat → docs/HUKUKI-METINLER-NOTLAR.md.
 * Onaylanınca: draft={false} + sayfadaki robots noindex satırı kaldırılır. Şirket bilgileri: src/config/company.ts
 */
export default function LegalPageLayout({
  title,
  intro,
  draft = true,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  draft?: boolean;
  updated?: string;
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
              <b>Taslak:</b> Bu metin son kontrol aşamasındadır; onaylandıktan sonra bu uyarı kalkacaktır.
            </div>
          )}

          <div className="space-y-6 text-slate-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-slate-900 [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-[15px] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_li]:text-[15px] [&_h3]:font-black [&_h3]:text-slate-900 [&_h3]:mt-4 [&_a]:text-olive-700 [&_a]:underline [&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:border-slate-200 [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:text-left [&_th]:py-2 [&_th]:pr-3 [&_th]:border-b-2 [&_th]:border-slate-300">
            {children}
          </div>
          {updated && <p className="mt-10 text-xs text-slate-400">Son güncelleme: {updated}</p>}
        </div>
      </main>
      <Footer />
    </>
  );
}
