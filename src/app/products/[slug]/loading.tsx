// Ürün sayfası açılırken anında görünen iskelet (kullanıcı 2026-11-16: mağazada fotoğrafa dokununca sayfa birkaç saniye
// sonra açılıyor, arada hiçbir şey olmadığı için "açılmadı" sanılıyordu). Next: loading.tsx önceden yüklenir, dokunur dokunmaz çıkar.
import Navbar from "@/components/Navbar";

export default function ProductLoading() {
  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 md:py-12" aria-busy="true" aria-label="Ürün yükleniyor">
        <div className="grid md:grid-cols-2 gap-6 md:gap-12 animate-pulse">
          <div className="aspect-square rounded-2xl md:rounded-[2.5rem] bg-olive-50 border border-slate-100" />
          <div className="space-y-4">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="h-8 w-4/5 rounded-lg bg-slate-200" />
            <div className="h-8 w-2/5 rounded-lg bg-slate-200" />
            <div className="grid grid-cols-5 gap-2 pt-4">
              {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-11 rounded-xl bg-slate-100" />)}
            </div>
            <div className="h-14 rounded-2xl bg-olive-100 mt-6" />
          </div>
        </div>
      </main>
    </>
  );
}
