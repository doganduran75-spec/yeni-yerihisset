import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ChevronLeft, BookOpen, Play } from "lucide-react";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// YouTube embed URL'sine çevir
function youtubeEmbed(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = getSupabase();
  const { data } = await supabase
    .from("kb_articles")
    .select("title, content")
    .eq("slug", slug)
    .single();

  if (!data) return { title: "Makale Bulunamadı" };

  const description = data.content
    ? data.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
    : "";

  return { title: data.title, description };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = getSupabase();

  const { data: article } = await supabase
    .from("kb_articles")
    .select("*, kb_categories(id, name, slug)")
    .eq("slug", slug)
    .single();

  if (!article) notFound();

  const cat = article.kb_categories as { id: string; name: string; slug: string } | null;
  const embedUrl = youtubeEmbed(article.video_url);

  // İlgili makaleler (aynı kategori, kendisi hariç, max 3)
  const { data: related } = cat
    ? await supabase
        .from("kb_articles")
        .select("id, title, slug")
        .eq("category_id", cat.id)
        .neq("id", article.id)
        .limit(3)
    : { data: [] };

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />

      <div className="container mx-auto px-4 max-w-3xl py-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-10">
          <Link href="/bilgi-bankasi" className="hover:text-olive-600 transition-colors flex items-center gap-1">
            <ChevronLeft size={13} /> Bilgi Bankası
          </Link>
          {cat && (
            <>
              <span>/</span>
              <Link
                href={`/bilgi-bankasi?kategori=${cat.slug}`}
                className="hover:text-olive-600 transition-colors"
              >
                {cat.name}
              </Link>
            </>
          )}
        </nav>

        {/* Makale Başlığı */}
        <header className="mb-10 space-y-4">
          {cat && (
            <Link
              href={`/bilgi-bankasi?kategori=${cat.slug}`}
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-olive-600 bg-olive-50 border border-olive-200 px-3 py-1.5 rounded-full hover:bg-olive-100 transition-colors"
            >
              <BookOpen size={11} /> {cat.name}
            </Link>
          )}
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 leading-tight">
            {article.title}
          </h1>
        </header>

        {/* Video embed */}
        {embedUrl && (
          <div className="mb-10 rounded-2xl overflow-hidden shadow-lg aspect-video bg-slate-900">
            <iframe
              src={embedUrl}
              title={article.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        )}

        {/* Video URL ama embed değilse link olarak göster */}
        {article.video_url && !embedUrl && (
          <a
            href={article.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-10 flex items-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl hover:bg-olive-700 transition-colors w-fit"
          >
            <Play size={18} className="fill-white" />
            <span className="font-black text-sm uppercase tracking-wide">Videoyu İzle</span>
          </a>
        )}

        {/* Makale İçeriği */}
        <div
          className="kb-content prose prose-slate max-w-none"
          dangerouslySetInnerHTML={{ __html: article.content || "" }}
        />

        {/* İlgili Makaleler */}
        {related && related.length > 0 && (
          <aside className="mt-16 pt-12 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">
              Bu Kategorideki Diğer Makaleler
            </h3>
            <div className="space-y-3">
              {(related as any[]).map((r) => (
                <Link
                  key={r.id}
                  href={`/bilgi-bankasi/${r.slug}`}
                  className="flex items-center justify-between gap-4 p-4 bg-white border border-slate-100 rounded-xl hover:border-olive-200 hover:shadow-sm transition-all group"
                >
                  <span className="font-bold text-sm text-slate-800 group-hover:text-olive-600 transition-colors">
                    {r.title}
                  </span>
                  <ChevronLeft size={15} className="text-slate-300 rotate-180 group-hover:text-olive-400 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              ))}
            </div>
          </aside>
        )}

        {/* Geri dön */}
        <div className="mt-12">
          <Link
            href="/bilgi-bankasi"
            className="inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-olive-600 transition-colors uppercase tracking-wide"
          >
            <ChevronLeft size={15} /> Bilgi Bankasına Dön
          </Link>
        </div>
      </div>

      <Footer />

      {/* Makale içerik stilleri */}
      <style>{`
        .kb-content h1 { font-size: 1.75rem; font-weight: 800; margin: 1.5em 0 0.5em; color: #1e293b; }
        .kb-content h2 { font-size: 1.4rem; font-weight: 700; margin: 1.25em 0 0.4em; color: #1e293b; }
        .kb-content h3 { font-size: 1.15rem; font-weight: 700; margin: 1em 0 0.3em; color: #334155; }
        .kb-content p  { margin: 0.75em 0; color: #475569; line-height: 1.75; }
        .kb-content ul { list-style: disc; padding-left: 1.5em; margin: 0.75em 0; color: #475569; }
        .kb-content ol { list-style: decimal; padding-left: 1.5em; margin: 0.75em 0; color: #475569; }
        .kb-content li { margin: 0.25em 0; line-height: 1.7; }
        .kb-content a  { color: #536430; text-decoration: underline; text-underline-offset: 3px; }
        .kb-content a:hover { color: #3d4a22; }
        .kb-content strong { font-weight: 700; color: #1e293b; }
        .kb-content em { font-style: italic; }
        .kb-content img { max-width: 100%; border-radius: 0.75rem; margin: 1.25em 0; display: block; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .kb-content blockquote { border-left: 3px solid #879b60; padding-left: 1rem; margin: 1em 0; color: #64748b; font-style: italic; }
        .kb-content code { background: #f1f5f9; padding: 0.15em 0.4em; border-radius: 0.25rem; font-size: 0.875em; color: #536430; }
      `}</style>
    </div>
  );
}
