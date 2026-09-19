/* eslint-disable @typescript-eslint/no-explicit-any */
// Misafir (guest) checkout: verilen bilgiden ŞİFRESİZ bir üye bulur/oluşturur ve
// sipariş için adres snapshot'ı üretir. Var olan e-posta bir üyeye aitse hata
// döner (hesap ele geçirme riski → kullanıcıdan giriş istenir). Sipariş her zaman
// bir user_id'ye bağlanır (orphan olmaz); misafir sonradan "şifremi unuttum" ile
// hesabına erişebilir.

import type { createAdminClient } from "@/lib/supabase-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type GuestInput = {
  email?: string; firstName?: string; lastName?: string; phone?: string;
  city?: string; district?: string; addressDetail?: string;
};

export type GuestAddress = {
  first_name: string; last_name: string; phone: string;
  address_detail: string; district: string; city: string;
};

export async function resolveGuest(
  supabase: AdminClient,
  g: GuestInput
): Promise<{ ok: true; userId: string; email: string; address: GuestAddress } | { ok: false; error: string; code: number }> {
  const email = (g.email || "").trim().toLowerCase();
  const first = (g.firstName || "").trim();
  const last = (g.lastName || "").trim();
  const phone = (g.phone || "").replace(/\D/g, "");
  const city = (g.city || "").trim();
  const district = (g.district || "").trim();
  const addressDetail = (g.addressDetail || "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Geçerli bir e-posta girin.", code: 400 };
  if (!first || !last) return { ok: false, error: "Ad ve soyad zorunlu.", code: 400 };
  if (phone.length !== 10) return { ok: false, error: "Telefon 10 haneli olmalı.", code: 400 };
  if (!city || !district || !addressDetail) return { ok: false, error: "Teslimat adresi bilgileri eksik.", code: 400 };

  // Bu e-posta zaten kayıtlı mı? (üye → giriş iste, sessizce üstüne yazma)
  const { data: existing } = await (supabase as any).from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing?.id) {
    return { ok: false, error: "Bu e-posta zaten kayıtlı. Lütfen giriş yapıp devam edin (şifreni unuttuysan sıfırlayabilirsin).", code: 409 };
  }

  // Şifresiz kullanıcı oluştur
  const { data: created, error: cErr } = await (supabase as any).auth.admin.createUser({
    email, email_confirm: true, user_metadata: { first_name: first, last_name: last },
  });
  if (cErr || !created?.user?.id) {
    const { data: again } = await (supabase as any).from("profiles").select("id").eq("email", email).maybeSingle();
    if (again?.id) return { ok: false, error: "Bu e-posta zaten kayıtlı. Lütfen giriş yapın.", code: 409 };
    return { ok: false, error: "Misafir kaydı oluşturulamadı.", code: 500 };
  }
  const userId = created.user.id;

  // Profil satırını garanti et (auth trigger'ı profil oluşturmuyorsa)
  await (supabase as any).from("profiles").upsert(
    { id: userId, email, first_name: first, last_name: last, phone },
    { onConflict: "id" }
  );

  return {
    ok: true, userId, email,
    address: { first_name: first, last_name: last, phone, address_detail: addressDetail, district, city },
  };
}
