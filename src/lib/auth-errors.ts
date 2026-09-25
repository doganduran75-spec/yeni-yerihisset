// Supabase/GoTrue İngilizce auth mesajlarını Türkçeleştir (giriş, kayıt, şifre
// belirleme/değiştirme). Tanınmayan mesajda genel Türkçe metin döner — kullanıcı
// İngilizce hata görmesin.
export function trAuthError(msg?: string): string {
  const m = (msg || "").toLowerCase();
  if (!m) return "Bir hata oluştu. Lütfen tekrar deneyin.";
  if (m.includes("invalid login credentials")) return "E-posta veya şifre hatalı.";
  if (m.includes("user is banned") || m.includes("banned")) return "Bu hesap kapatılmış. Aynı e-postayla yeniden üye olabilirsin.";
  if (m.includes("email not confirmed")) return "E-posta adresiniz henüz onaylanmamış.";
  if (m.includes("user already registered") || m.includes("already been registered") || m.includes("email address already") || m.includes("email_exists")) return "Bu e-posta adresi zaten kayıtlı.";
  if (m.includes("should be different from the old password") || m.includes("same_password")) return "Yeni şifre eski şifrenle aynı olamaz.";
  if (m.includes("password should be at least") || m.includes("password is too short")) return "Şifre en az 6 karakter olmalı.";
  if (m.includes("weak password") || m.includes("password is known to be weak") || m.includes("weak_password")) return "Bu şifre çok zayıf. Daha güçlü bir şifre seç.";
  if (m.includes("unable to validate email") || m.includes("invalid format") || m.includes("email address") && m.includes("invalid")) return "Geçersiz e-posta adresi.";
  if (m.includes("token has expired") || m.includes("otp_expired") || m.includes("expired") || m.includes("invalid or has expired")) return "Bağlantının süresi dolmuş. Lütfen “Şifremi unuttum” ile yeni bir bağlantı iste.";
  if (m.includes("auth session missing") || m.includes("session") && m.includes("missing")) return "Oturumun sona ermiş. Lütfen tekrar giriş yap ya da yeni bir bağlantı iste.";
  if (m.includes("user not found")) return "Bu e-postaya ait bir hesap bulunamadı.";
  if (m.includes("signup") && m.includes("disabled")) return "Şu anda yeni üyelik alınamıyor.";
  if (m.includes("rate limit") || m.includes("for security purposes") || m.includes("too many")) return "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.";
  if (m.includes("network") || m.includes("failed to fetch")) return "Bağlantı hatası. Lütfen tekrar deneyin.";
  // Zaten Türkçe bir mesajsa (kendi API'lerimiz) olduğu gibi göster
  if (/[çğıöşüÇĞİÖŞÜ]/.test(msg || "")) return msg as string;
  return "Bir hata oluştu. Lütfen tekrar deneyin.";
}
