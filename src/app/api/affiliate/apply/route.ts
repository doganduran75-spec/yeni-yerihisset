import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

function generateCode(firstName: string): string {
  const base = (firstName || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}${suffix}`;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("affiliate_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) return NextResponse.json({ error: "Zaten affiliate üyesisiniz" }, { status: 409 });

  const body = await req.json();
  const { answers } = body;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name")
    .eq("id", user.id)
    .single();

  let code = generateCode(profile?.first_name || "");
  let attempts = 0;
  while (attempts < 5) {
    const { data: clash } = await supabase
      .from("affiliate_profiles")
      .select("id")
      .eq("code", code)
      .single();
    if (!clash) break;
    code = generateCode(profile?.first_name || "");
    attempts++;
  }

  const { data, error } = await supabase
    .from("affiliate_profiles")
    .insert({ user_id: user.id, code, status: "active", commission_rate: 10.0, application_answers: answers || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { assignRole } = await import("@/lib/user-roles");
  await assignRole(user.id, "affiliate");

  return NextResponse.json({ affiliate: data });
}
