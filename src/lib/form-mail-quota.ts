/* eslint-disable @typescript-eslint/no-explicit-any */
// Herkese açık formların aynı adrese e-posta sınırı (güvenlik 2026-11-16): bülten, kampanya kuponu, ücretsiz kargo
// (lead magnet), stok bildirimi. Adres başına son 24 saatte en fazla 3 e-posta — sayaç veritabanında (MIG 20261189,
// form_mail_allowed), tüm uygulama işlemleri ortak. Sınır dolunca form YİNE AYNI başarı cevabını verir (adresin
// durumu dışarı sızmaz), yalnız e-posta gitmez ve kayıt açılmaz.
// Yeni herkese açık form başkasının adresine e-posta gönderiyorsa göndermeden önce bunu çağır.

export const FORM_MAIL_MAX = 3;
export const FORM_MAIL_HOURS = 24;

/** true → gönder (sayıldı); false → bu adrese son 24 saatte 3 e-posta gitti, gönderme. */
export async function formMailAllowed(sb: any, email: string, form: string): Promise<boolean> {
  const { data, error } = await sb.rpc("form_mail_allowed", { p_email: email, p_form: form, p_max: FORM_MAIL_MAX, p_hours: FORM_MAIL_HOURS });
  if (error) {
    // Fonksiyon yoksa (migration henüz çalışmadı) form bozulmasın — IP sınırı ve bot tuzağı yine geçerli
    console.error("[form-mail-quota]", form, error.message);
    return true;
  }
  return data === true;
}
