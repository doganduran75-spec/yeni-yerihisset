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

    // "E-postamı düzelt" hız sınırı + şifre sıfırlama cevabı tek tip (güvenlik 2026-11-16, 3. parça kalanlar)
    await part("Hesap güvenliği: e-posta değiştirme sınırı ve şifre sıfırlama cevabı", async () => {
      const RUN = Date.now().toString(36);
      const email = `rgt-hesap-degis-${RUN}@${DOMAIN}`;
      const password = randomBytes(18).toString("base64url");
      const ip = () => `10.251.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`; // her istek ayrı IP: IP sınırından yemesin
      let userId = null;
      try {
        sql(`DELETE FROM public.profiles WHERE email ILIKE 'rgt-hesap-degis-%@${DOMAIN}'; DELETE FROM auth.users WHERE email ILIKE 'rgt-hesap-degis-%@${DOMAIN}';`);
        const c = await auth("admin/users", { method: "POST", service: true, body: { email, password, email_confirm: true } });
        userId = c.json?.id;
        if (!userId) return add("fail", "Test üyesi açılamadı", `HTTP ${c.status}`);
        sql(`INSERT INTO public.profiles (id, email, first_name, last_name) VALUES (${lit(userId)}, ${lit(email)}, 'Regresyon', 'degis') ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`);
        const s = await auth("token?grant_type=password", { method: "POST", body: { email, password } });
        const token = s.json?.access_token;
        if (!token) return add("fail", "Test üyesi giriş yapamadı", `HTTP ${s.status}`);

        // Şifre sıfırlama: kayıtlı ve kayıtsız adrese AYNI cevap (hesabın varlığı belli olmaz). Önce — e-posta değişmeden.
        const fp = (e) => api("/api/auth/forgot-password", { headers: { "x-forwarded-for": ip() }, body: { email: e, _hp: "", _t: 6000 } });
        const known = await fp(email);
        const unknown = await fp(`rgt-hesap-yok-${RUN}@${DOMAIN}`);
        add(known.status === 200 && unknown.status === 200 && known.text === unknown.text && JSON.stringify(known.json) === '{"ok":true}' ? "ok" : "fail",
          "Şifre sıfırlama: kayıtlı ve kayıtsız adrese aynı cevap ({ ok: true }, emailStatus yok)", `kayıtlı HTTP ${known.status} ${known.text.slice(0, 80)} · kayıtsız HTTP ${unknown.status} ${unknown.text.slice(0, 80)}`);

        // E-postamı düzelt: hesap başına 24 saatte 3 değişiklik, 4.'sü 429
        const rs = [];
        for (let i = 1; i <= 4; i++) {
          rs.push(await api("/api/auth/change-email", { token, headers: { "x-forwarded-for": ip() }, body: { email: `rgt-hesap-degis-${i}-${RUN}@${DOMAIN}` } }));
        }
        add(rs.slice(0, 3).every((r) => r.status === 200) && rs[3].status === 429 ? "ok" : "fail",
          "E-postamı düzelt: hesap başına 24 saatte en çok 3 değişiklik (4.'sü reddediliyor)", rs.map((r) => `${r.status}${r.json?.error ? ` ${r.json.error}` : ""}`).join(" / "));
      } finally {
        if (userId) sql(`DELETE FROM public.profiles WHERE id = ${lit(userId)}; DELETE FROM auth.users WHERE id = ${lit(userId)};`);
        sql(`DO $$ BEGIN IF to_regclass('public.form_mail_log') IS NOT NULL THEN
               DELETE FROM public.form_mail_log WHERE email ILIKE '%@${DOMAIN}'${userId ? ` OR email = ${lit(`change-email:${userId}`)}` : ""};
             END IF; END $$;`);
      }
      const ce = readFileSync(new URL("../../src/app/api/auth/change-email/route.ts", import.meta.url), "utf8");
      add(/form_mail_allowed/.test(ce) && /formMailAllowed\(supabase, newEmail, "change-email"\)/.test(ce) ? "ok" : "fail",
        "E-postamı düzelt: sınır veritabanında (hesap + hedef adres)", "change-email/route.ts sınır satırları eksik");
    });
  },
};
