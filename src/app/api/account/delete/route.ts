import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// KVKK "hesabımı sil" — YUMUŞAK kapatma:
//  - profil PII anonimleştirilir (ad/telefon/TCKN) + E-POSTA serbest bırakılır
//    (anonim adrese çevrilir → kişi aynı e-postayla sıfırdan üye olabilir),
//  - kayıtlı adresler silinir,
//  - giriş kapatılır (auth kullanıcı banlanır — satır ve sipariş FK'leri durur),
//  - siparişler KORUNUR (yasal saklama; orphan olmaz).
// Sert silme YAPILMAZ (aksi halde sipariş kayıtları/muhasebe bütünlüğü bozulur).
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const supabase = createAdminClient();
  const anonEmail = `silindi-${user.id}@anonim.yerihisset.invalid`;

  try {
    // 1) Profil PII anonimleştir + kapatma damgası
    await (supabase as any).from("profiles").update({
      first_name: "Silinmiş",
      last_name: "Kullanıcı",
      phone: null,
      identity_number: null,
      email: anonEmail,
      deleted_at: new Date().toISOString(),
    }).eq("id", user.id);

    // 2) Kayıtlı adresleri sil (PII)
    await supabase.from("user_addresses").delete().eq("user_id", user.id);

    // 3) Girişi kapat (banla) + auth e-postasını anonimleştir (e-posta serbest kalsın)
    //    — satır ve sipariş FK'leri korunur
    //    İki ayrı çağrı: e-posta değişikliği reddedilse bile ban mutlaka uygulansın.
    try {
      const { error: banErr } = await (supabase as any).auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
      if (banErr) console.error("[account/delete] ban hatası:", banErr.message);
      const { error: mailErr } = await (supabase as any).auth.admin.updateUserById(user.id, {
        email: anonEmail, email_confirm: true, user_metadata: {},
      });
      if (mailErr) console.error("[account/delete] e-posta anonimleştirme hatası:", mailErr.message);
    } catch (e: any) {
      console.error("[account/delete] auth hatası:", e?.message || e);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[account/delete] hata:", e?.message || e);
    return NextResponse.json({ error: "Hesap kapatılamadı." }, { status: 500 });
  }
}
