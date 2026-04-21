import FirsatlarClient from "./FirsatlarClient";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export const revalidate = 60;

export default async function FirsatlarPage() {
  const sb = getSupabase();

  const [{ data: opps }, { data: roles }] = await Promise.all([
    sb.from("partner_opportunities").select("*").eq("is_active", true).order("created_at", { ascending: false }),
    sb.from("roles").select("id, name, slug").order("name", { ascending: true }),
  ]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-12 max-w-5xl">
          <div className="mb-10">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">
              Özel <span className="text-olive-600">Fırsatlar</span>
            </h1>
            <p className="text-slate-500 text-lg">
              İş ortaklarımızdan size özel fırsatlar ve indirimler.
            </p>
          </div>
          <FirsatlarClient opps={opps || []} allRoles={roles || []} />
        </div>
      </main>
      <Footer />
    </>
  );
}
