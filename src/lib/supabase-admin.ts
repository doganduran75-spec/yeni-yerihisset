import { createClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

// Service role client — yalnızca server-side (API routes) kullanılmalı.
// Bu client RLS'yi atlar, tarayıcıya gönderilmemeli.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik.");
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}
