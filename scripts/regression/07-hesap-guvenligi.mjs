// HESAP GÜVENLİĞİ — önceden açılmış hesapla ele geçirme (güvenlik taraması 2026-11-16, 3. parça bulgu 1).
// Kayıt ve "e-postamı düzelt" adresi doğrulamadan kabul ediyor: biri başkasının e-postasıyla hesap açıp oturumunu açık
// tutabiliyordu; sahibi şifre sıfırlayınca o oturum açık kalıyor, sonraki siparişleri / adresleri görüyordu.
// Kural: e-posta bağlantısıyla gelen kişi (şifre sıfırlama / belirleme) /api/auth/mark-verified'a geldiğinde hesabın
// BAŞKA oturumları kapanır; /sifre-belirle şifre kaydedilince de diğer oturumları kapatır.
// Test verisi: geçici "rgt-hesap-…@yerihisset.test" üyesi, bölüm sonunda silinir. E-posta gönderilmez.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const DOMAIN = "yerihisset.test";

export default {
  name: "Hesap güvenliği",
  async run(t) {
    const { sql, lit, add, part, api, auth } = t;

    await part("Hesap güvenliği: şifre sıfırlama bağlantısı diğer oturumları kapatıyor", async () => {
      const RUN = Date.now().toString(36);
      const email = `rgt-hesap-${RUN}@${DOMAIN}`;
      const password = randomBytes(18).toString("base64url");
      const drop = (where) => sql(`
        DELETE FROM public.user_coupons WHERE user_id IN (SELECT id FROM auth.users WHERE ${where});
        DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE ${where});
        DELETE FROM auth.users WHERE ${where};`);
      let userId = null;
      try {
        drop(`email ILIKE 'rgt-hesap-%@${DOMAIN}'`);
        // "Saldırgan": e-postayı kendi şifresiyle kaydetmiş, oturumu açık (A)
        const c = await auth("admin/users", { method: "POST", service: true, body: { email, password, email_confirm: true } });
        userId = c.json?.id;
        if (!userId) return add("fail", "Test üyesi açılamadı", `HTTP ${c.status}`);
        const a = await auth("token?grant_type=password", { method: "POST", body: { email, password } });
        if (!a.json?.refresh_token) return add("fail", "Test üyesi giriş yapamadı", `HTTP ${a.status}`);

        // "Sahibi": şifre sıfırlama bağlantısını açıyor (B) — sayfa mark-verified'ı çağırır
        const gl = await auth("admin/generate_link", { method: "POST", service: true, body: { type: "recovery", email } });
        const hashed = gl.json?.hashed_token ?? gl.json?.properties?.hashed_token;
        if (!hashed) return add("fail", "Şifre sıfırlama bağlantısı üretilemedi", `HTTP ${gl.status}`);
        const b = await auth("verify", { method: "POST", body: { type: "recovery", token_hash: hashed } });
        if (!b.json?.access_token) return add("fail", "Şifre sıfırlama bağlantısı doğrulanamadı", `HTTP ${b.status} ${String(b.text).slice(0, 80)}`);
        const mv = await api("/api/auth/mark-verified", { token: b.json.access_token });

        // A'nın oturumu düşmüş olmalı; B çalışmaya devam etmeli
        const ra = await auth("token?grant_type=refresh_token", { method: "POST", body: { refresh_token: a.json.refresh_token } });
        const rb = await auth("token?grant_type=refresh_token", { method: "POST", body: { refresh_token: b.json.refresh_token } });
        add(mv.status === 200 && !ra.json?.access_token && !!rb.json?.access_token ? "ok" : "fail",
          "Şifre sıfırlama bağlantısı açılınca hesabın diğer oturumları kapanıyor (bağlantıyı açanınki açık kalıyor)",
          `mark-verified HTTP ${mv.status}; eski oturum yenilemesi HTTP ${ra.status}${ra.json?.access_token ? " (AÇIK KALDI)" : ""}; yeni oturum HTTP ${rb.status}`);

        // Şifreyle giriş yapan kişi bu uçla diğer oturumları kapatamaz / kendini doğrulanmış yapamaz (kanıt: amr)
        const a2 = await auth("token?grant_type=password", { method: "POST", body: { email, password } });
        const mv2 = a2.json?.access_token ? await api("/api/auth/mark-verified", { token: a2.json.access_token }) : null;
        const rb2 = await auth("token?grant_type=refresh_token", { method: "POST", body: { refresh_token: rb.json?.refresh_token || b.json.refresh_token } });
        add(mv2?.json?.reason === "no-email-proof" && !!rb2.json?.access_token ? "ok" : "fail",
          "Şifreyle girilen oturum e-posta kanıtı sayılmıyor (başkasının oturumunu kapatamıyor)",
          `cevap ${JSON.stringify(mv2?.json)}; e-posta bağlantılı oturum HTTP ${rb2.status}`);
      } finally {
        if (userId) drop(`id = ${lit(userId)}`);
      }

      // Kaynak: /sifre-belirle şifreyi kaydedince diğer oturumları kapatıyor
      const page = readFileSync(new URL("../../src/app/sifre-belirle/page.tsx", import.meta.url), "utf8");
      add(/updateUser\(\{ password \}\)[\s\S]{0,400}signOut\(\{ scope: "others" \}\)/.test(page) ? "ok" : "fail",
        "/sifre-belirle: şifre kaydedilince diğer oturumlar kapanıyor", "signOut({ scope: \"others\" }) updateUser'dan sonra yok");
    });
  },
};
