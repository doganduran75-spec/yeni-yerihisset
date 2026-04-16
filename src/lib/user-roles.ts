import { createAdminClient } from "./supabase-admin";

/**
 * Kullanıcıya belirtilen slug'a sahip rolü atar.
 * Rol zaten atanmışsa tekrar eklenmez.
 */
export async function assignRole(userId: string, roleSlug: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("slug", roleSlug)
    .single();

  if (!role) return;

  await supabase
    .from("user_roles")
    .upsert(
      { user_id: userId, role_id: role.id },
      { onConflict: "user_id,role_id", ignoreDuplicates: true }
    );
}

/**
 * Kullanıcının tüm rol slug'larını döner.
 */
export async function getUserRoleSlugs(userId: string): Promise<string[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("user_roles")
    .select("roles(slug)")
    .eq("user_id", userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.roles?.slug).filter(Boolean);
}

/**
 * Kullanıcının belirtilen role sahip olup olmadığını kontrol eder.
 */
export async function hasRole(userId: string, roleSlug: string): Promise<boolean> {
  const slugs = await getUserRoleSlugs(userId);
  return slugs.includes(roleSlug);
}
