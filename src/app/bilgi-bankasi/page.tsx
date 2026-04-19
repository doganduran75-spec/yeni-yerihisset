import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BookOpen, Play, ChevronRight } from "lucide-react";

// Server-side Supabase (public anon key yeterli — RLS SELECT izni var)
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// HTML içerikten ilk <img src> çıkar
function extractFirstImage(html: string): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

// YouTube URL'sinden thumbnail al
function youtubeThumbnail(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

// HTML'den düz metin özet
function plainText(html: string, len = 140): string {
  if (!html) return "";
  const t = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > len ? t.slice(0, len) + "…" : t;
}

// Kategori sırası için basit renk paleti
const CATEGORY_COLORS = [
  "bg-olive-50 text-olive-700 border-olive-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-sky-50 text-sky-700 border-sky-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-teal-50 text-teal-700 border-teal-200",
];

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ kategori?: string }>;
}) {
  const { kategori } = await searchParams;
  const supabase = getSupabase();

  // Kategoriler
  const { data: categories } = await supabase
    .from("kb_categories")
    .select("id, name, slug")
    .order("name");

  // Makaleler — seçili kategori varsa filtrele
  let query = supabase
    .from("kb_articles")
    .select("id, title, slug, content, video_url, category_id, kb_categories(id, name, slug)")
    .order("created_at", { ascending: false });

  if (kategori) {
    const cat = (categories || []).find((c: any) => c.slug === kategori);
    if (cat) query = query.eq("category_id", cat.id);
  }

  const { data: articles } = await query;

  const cats = (categories || []) as Array<{ id: string; name: string; slug: string }>;
  const arts = (articles || []) as any[];

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />


      <div className="container mx-auto px-4 max-w-5xl py-12">
        {/* ── Kategori sekmeleri ──────────────────────────────────────────── */}
        {cats.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-10">
            <Link
              href="/bilgi-bankasi"
              className={`px-4 py-2 rounded-full text-sm font-black uppercase tracking-wide border transition-all ${
                !kategori
                  ? "bg-olive-600 text-white border-olive-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-olive-300 hover:text-olive-600"
              }`}
            >
              Tümü
            </Link>
            {cats.map((cat, i) => (
              <Link
                key={cat.id}
                href={`/bilgi-bankasi?kategori=${cat.slug}`}
                className={`px-4 py-2 rounded-full text-sm font-black uppercase tracking-wide border transition-all ${
                  kategori === cat.slug
                    ? "bg-olive-600 text-white border-olive-600 shadow-sm"
                    : `${CATEGORY_COLORS[i % CATEGORY_COLORS.length]} hover:border-olive-300`
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        )}

        {/* ── Makale grid'i ───────────────────────────────────────────────── */}
        {arts.length === 0 ? (
          <div className="py-24 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-medium">
            Bu kategoride henüz makale bulunmuyor.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {arts.map((article) => {
              // Kapak görseli: içerikten ilk img → YouTube thumbnail → null
              const cover =
                extractFirstImage(article.content) ||
                youtubeThumbnail(article.video_url) ||
                null;

              const catObj = article.kb_categories as {
                id: string;
                name: string;
                slug: string;
              } | null;

              const catIndex = cats.findIndex((c) => c.id === article.category_id);
              const colorClass =
                CATEGORY_COLORS[catIndex >= 0 ? catIndex % CATEGORY_COLORS.length : 0];

              return (
                <Link
                  key={article.id}
                  href={`/bilgi-bankasi/${article.slug}`}
                  className="group block bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg hover:border-olive-200 transition-all duration-300"
                >
                  {/* Kapak görseli */}
                  <div className="aspect-[16/9] overflow-hidden bg-olive-50 relative">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt={article.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      /* Kapak görseli yoksa dekoratif placeholder */
                      <div className="w-full h-full bg-gradient-to-br from-olive-50 to-olive-100 flex items-center justify-center">
                        <BookOpen size={40} className="text-olive-300" strokeWidth={1} />
                      </div>
                    )}
                    {/* Video varsa play badge */}
                    {article.video_url && (
                      <span className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm">
                        <Play size={14} className="text-olive-600 fill-olive-600 ml-0.5" />
                      </span>
                    )}
                  </div>

                  {/* İçerik */}
                  <div className="p-5 space-y-3">
                    {catObj && (
                      <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${colorClass}`}>
                        {catObj.name}
                      </span>
                    )}
                    <h3 className="font-black text-slate-900 text-base leading-snug group-hover:text-olive-600 transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-3">
                      {plainText(article.content)}
                    </p>
                    <div className="flex items-center gap-1 text-xs font-black text-olive-600 uppercase tracking-wide pt-1">
                      Devamını Oku
                      <ChevronRight size={13} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
