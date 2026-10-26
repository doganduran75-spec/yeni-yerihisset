import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { sendSiteMail } from "@/lib/site-mail";
import { isTestEmail } from "@/lib/mail-guard";
import { clientIp } from "@/lib/rate-limit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// SİSTEM DURUMU — panonun üst şeridi + /admin/system ayrıntıları (yalnız yönetici).
// Her kontrol: ok (yeşil, bakmana gerek yok) · warn (sarı) · fail (kırmızı). Kaynaklar:
//   sunucu sağlığı (server_health_runs, 15 dk'da bir) · entegrasyon (cron_heartbeats + kuyruk hataları) ·
//   e-posta (mail_health: son gönderimler + 15 dk'da bir SMTP girişi) · yedek (backup_runs) · saldırı (bot_blocks + SSH denemeleri) · yetkisiz giriş (yönetici girişleri,
//   yeni IP'den sunucu girişi) · hata alan müşteriler (client_errors + gönderilemeyen müşteri e-postaları)
type Status = "ok" | "warn" | "fail";
type Tile = { key: string; label: string; status: Status; value: string; hint?: string; anchor: string; ack?: string[] }; // ack: "Evet, bendim" ile kapatılabilecek uyarı anahtarları

const ago = (iso?: string | null) => {
  if (!iso) return "hiç";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} dk önce` : m < 48 * 60 ? `${Math.round(m / 60)} sa önce` : `${Math.round(m / 1440)} gün önce`;
};

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 403 }) };
  return { sb };
}

// POST {action:"test_mail"} → yönetici bildirim adresine deneme e-postası (gerçekten gidiyor mu?)
// dryRun: true → göndermeden yalnız alıcıyı döndürür (regresyon testi; her deploy'da e-posta atılmasın)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  // "Evet, bendim": yeni IP'den SSH girişi uyarısını kapat (kim / ne zaman onayladı kaydı kalır)
  if (body?.action === "ack") {
    const keys: string[] = (Array.isArray(body.keys) ? body.keys : []).map(String).filter((k: string) => /^ssh_new_ip:[0-9a-fA-F.:]+(:\d+)?$/.test(k)).slice(0, 20);
    if (!keys.length) return NextResponse.json({ error: "Onaylanacak uyarı yok" }, { status: 400 });
    const user = await getAuthUserFromRequest(req);
    const { error } = await auth.sb.from("server_health_acks").upsert(keys.map((key) => ({ key, acked_by: user?.id ?? null, acked_at: new Date().toISOString() })), { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // İz: onayı başkası verdiyse de haberin olsun → yöneticiye ikinci e-posta (regresyon test hesabında gönderilmez)
    const { data: who } = await auth.sb.from("profiles").select("email, first_name, last_name").eq("id", user?.id).maybeSingle();
    if (!isTestEmail(who?.email)) {
      const { data: st } = await auth.sb.from("settings").select("*").limit(1).maybeSingle();
      const to = st?.admin_notify_email || st?.contact_email || st?.smtp_from_email || st?.smtp_user;
      const tr = (d: Date) => d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
      const lines = keys.map((k) => {
        const m = /^ssh_new_ip:(.+?)(?::(\d+))?$/.exec(k);
        return `<li><b>${esc(m?.[1])}</b>${m?.[2] ? ` — giriş ${tr(new Date(Number(m[2]) * 1000))}` : ""}</li>`;
      }).join("");
      const name = [who?.first_name, who?.last_name].filter(Boolean).join(" ") || "Yönetici";
      if (to) await sendSiteMail(to, "SSH giriş uyarısı “bendim” diye onaylandı", `
        <p style="font-size:15px;color:#374151;line-height:1.6">Paneldeki yeni IP'den SSH girişi uyarısı kapatıldı:</p>
        <ul style="font-size:15px;color:#374151;line-height:1.7">${lines}</ul>
        <p style="font-size:14px;color:#374151;line-height:1.6">Onaylayan: <b>${esc(name)}</b> (${esc(who?.email)}) · ${tr(new Date())} · panel bağlantısı IP: ${esc(clientIp(req))}</p>
        <p style="font-size:13px;color:#b45309;line-height:1.6">Bunu sen yapmadıysan: admin panel şifreni ve sunucu şifresini hemen değiştir.</p>`).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }
  if (body?.action !== "test_mail") return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  // select("*"): ayar kolonları kurulumdan kuruluma değişebilir; yoksa sorgu hata verip adres "boş" görünüyordu.
  // Alıcı sırası yönetici bildirimleriyle aynı (sendAdminSystemAlert): bildirim → iletişim → gönderen adresi.
  const { data: st } = await auth.sb.from("settings").select("*").limit(1).maybeSingle();
  const to = st?.admin_notify_email || st?.contact_email || st?.smtp_from_email || st?.smtp_user;
  if (!to) return NextResponse.json({ error: "Yönetici e-posta adresi ayarlı değil (Ayarlar › Genel › İletişim Bilgileri › E-posta Adresi)" }, { status: 400 });
  if (body?.dryRun) return NextResponse.json({ ok: true, to, dryRun: true });
  const r = await sendSiteMail(to, "Deneme e-postası", `<p style="font-size:15px">Bu bir deneme e-postasıdır. Geldiyse sitenin e-posta gönderimi çalışıyor.</p><p style="font-size:13px;color:#6b7280">Gönderim: ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</p>`);
  return r.status === "sent" ? NextResponse.json({ ok: true, to }) : NextResponse.json({ error: r.error || "Gönderilemedi" }, { status: 502 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { sb } = auth;

  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const [health, backup, restore, beats, st, mpFailed, bots, logins, errs, mailFails, mail] = await Promise.all([
    sb.from("server_health_runs").select("status, created_at, checks").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("backup_runs").select("created_at, ok, message").eq("kind", "backup").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("backup_runs").select("created_at, ok").eq("kind", "restore_test").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("cron_heartbeats").select("name, last_run_at, message"),
    sb.from("settings").select("trendyol_enabled, hepsiburada_enabled, amazon_enabled, email_lock_enabled").limit(1).maybeSingle(),
    sb.from("marketplace_stock_sync").select("id", { count: "exact", head: true }).eq("status", "failed"),
    sb.from("bot_blocks").select("endpoint, reason").gte("created_at", since).limit(5000),
    sb.rpc("admin_login_activity", { p_days: 7 }),
    sb.from("client_errors").select("created_at, kind, message, path, order_id").gte("created_at", since).order("created_at", { ascending: false }).limit(50),
    sb.from("notification_log").select("created_at, trigger, recipient, error_message, order_id").eq("status", "failed").gte("created_at", since).order("created_at", { ascending: false }).limit(50),
    sb.from("mail_health").select("*").eq("id", 1).maybeSingle(),
  ]);
  const { data: ackRows } = await sb.from("server_health_acks").select("key").like("key", "ssh_new_ip:%");
  const acked = new Set(((ackRows as any[]) || []).map((a) => a.key));

  const tiles: Tile[] = [];
  const checks: any[] = (health.data?.checks as any[]) || [];

  // 1) Site / sunucu
  {
    const h = health.data;
    const stale = !h || Date.now() - new Date(h.created_at).getTime() > 40 * 60000;
    const bad = checks.filter((c) => c.status !== "ok" && !String(c.key).startsWith("ssh"));
    tiles.push({
      key: "server", label: "Site ve sunucu", anchor: "sunucu",
      status: stale ? "fail" : bad.some((c) => c.status === "fail") ? "fail" : bad.length ? "warn" : "ok",
      value: stale ? `son kontrol ${ago(h?.created_at)}` : bad.length ? bad.map((c) => c.label).join(", ") : `${checks.length} kontrol sağlıklı · ${ago(h.created_at)}`,
      hint: stale ? "Sağlık kontrolü çalışmıyor (cron) — sunucuya bakılmalı" : bad[0]?.hint,
    });
  }

  // 2) Entegrasyonlar (pazaryerleri)
  {
    const on = !!(st.data?.trendyol_enabled || st.data?.hepsiburada_enabled || st.data?.amazon_enabled);
    const beat = ((beats.data as any[]) || []).find((b) => b.name === "marketplace-sync");
    const stale = on && (!beat || Date.now() - new Date(beat.last_run_at).getTime() > 10 * 60000);
    const failed = Number(mpFailed.count || 0);
    tiles.push({
      key: "integrations", label: "Entegrasyonlar", anchor: "entegrasyon",
      status: !on ? "ok" : stale ? "fail" : failed ? "warn" : "ok",
      value: !on ? "pazaryerleri kapalı" : stale ? `senkron durmuş (${ago(beat?.last_run_at)})` : failed ? `${failed} stok gönderimi başarısız` : `senkron çalışıyor · ${ago(beat?.last_run_at)}`,
      hint: stale ? "Pazaryeri stok/sipariş senkronu çalışmıyor" : failed ? "Ayarlar › Entegrasyonlar › hata listesi" : undefined,
    });
  }

  // 3) E-posta — gerçekten gidiyor mu? (son gönderimler + SMTP girişi doğrulaması)
  {
    const m = mail.data;
    const vStale = !m?.verify_at || Date.now() - new Date(m.verify_at).getTime() > 40 * 60000;
    const streak = Number(m?.fail_streak || 0);
    const lock = st.data?.email_lock_enabled !== false;
    const status: Status = m?.verify_ok === false || streak >= 3 ? "fail" : streak > 0 || vStale ? "warn" : "ok";
    tiles.push({
      key: "mail", label: "E-posta", anchor: "eposta", status,
      value: m?.verify_ok === false ? `SMTP'ye bağlanılamıyor (${ago(m.verify_at)})`
        : streak > 0 ? `son ${streak} gönderim başarısız`
        : `son gönderim ${ago(m?.last_ok_at)}${vStale ? " · bağlantı henüz doğrulanmadı" : ` · bağlantı ✓ ${ago(m?.verify_at)}`}${lock ? " · kilit açık" : ""}`,
      hint: m?.verify_ok === false ? m.verify_error || "SMTP ayarlarını kontrol et"
        : streak > 0 ? m?.last_error || "Ayrıntıda hata metni var"
        : vStale ? "Doğrulama 15 dk'da bir sağlık kontrolüyle yapılır" : undefined,
    });
  }

  // 4) Yedek
  {
    const b = backup.data;
    const h = b ? (Date.now() - new Date(b.created_at).getTime()) / 3600000 : 999;
    const rt = restore.data;
    tiles.push({
      key: "backup", label: "Yedek", anchor: "yedek",
      status: !b || !b.ok || h > 26 ? "fail" : rt && !rt.ok ? "warn" : "ok",
      value: !b ? "hiç yedek yok" : !b.ok ? `son yedek başarısız (${ago(b.created_at)})` : `${ago(b.created_at)}${rt ? ` · geri yükleme testi ${rt.ok ? "✓" : "✗"}` : ""}`,
      hint: !b || !b.ok || h > 26 ? "Gece yedeği alınamadı — sunucuya bakılmalı" : rt && !rt.ok ? "Haftalık geri yükleme testi başarısız" : undefined,
    });
  }

  // 5) Saldırı / bot
  {
    const n = ((bots.data as any[]) || []).length;
    const ssh = checks.find((c) => c.key === "ssh_attempts");
    const heavy = n >= 200;
    tiles.push({
      key: "attacks", label: "Saldırı / bot", anchor: "saldiri",
      status: heavy || ssh?.status === "warn" ? "warn" : "ok",
      value: `${n} bot engellendi / 24 sa${ssh ? ` · SSH: ${ssh.value}` : ""}`,
      hint: heavy ? "Formlara yoğun bot saldırısı — engelleniyor, takip et" : ssh?.status === "warn" ? ssh.hint : undefined,
    });
  }

  // 6) Yetkisiz giriş
  {
    const L = ((logins.data as any[]) || []);
    const newIp24 = L.filter((l) => l.new_ip && new Date(l.created_at).getTime() > Date.now() - 24 * 3600000);
    const sshNew = checks.filter((c) => String(c.key).startsWith("ssh_new_ip") && !acked.has(c.key)); // "evet, bendim" denenler gizli
    tiles.push({
      key: "access", label: "Yetkisiz giriş", anchor: "giris",
      status: sshNew.length || newIp24.length ? "warn" : "ok",
      ack: sshNew.length ? sshNew.map((c) => String(c.key)) : undefined,
      value: sshNew.length ? `SSH ile sunucuya yeni IP'den giriş: ${sshNew.map((c) => c.value).join(", ")}`
        : newIp24.length ? `yönetici paneline yeni IP'den giriş (${newIp24.length})`
        : L[0] ? `son yönetici girişi ${ago(L[0].created_at)}` : "son 7 günde yönetici girişi yok",
      hint: sshNew.length || newIp24.length ? "Bu giriş sen değilsen şifreni hemen değiştir" : undefined,
    });
  }

  // 7) Hata alan müşteriler
  const custMail = ((mailFails.data as any[]) || []).filter((m) => !/\.(test|invalid)$/i.test(m.recipient || "") && !/kilidi/i.test(m.error_message || ""));
  {
    const E = ((errs.data as any[]) || []);
    const pay = E.filter((e) => e.kind === "payment_failed").length;
    const total = E.length + custMail.length;
    tiles.push({
      key: "customer_errors", label: "Hata alan müşteriler", anchor: "musteri-hatalari",
      status: total ? "warn" : "ok",
      value: total ? [E.length - pay ? `${E.length - pay} sayfa hatası` : "", pay ? `${pay} başarısız kart ödemesi` : "", custMail.length ? `${custMail.length} gönderilemeyen e-posta` : ""].filter(Boolean).join(" · ") + " / 24 sa" : "son 24 saatte hata yok",
      hint: total ? "Ayrıntıda müşterinin gördüğü hata ve sipariş var" : undefined,
    });
  }

  const order: Record<Status, number> = { fail: 0, warn: 1, ok: 2 };
  const overall: Status = tiles.reduce<Status>((w, t) => (order[t.status] < order[w] ? t.status : w), "ok");
  return NextResponse.json({
    ok: true, overall, tiles,
    details: {
      healthChecks: checks,
      healthAt: health.data?.created_at ?? null,
      bots: Object.entries(((bots.data as any[]) || []).reduce((m: Record<string, number>, b) => { const k = `${b.endpoint} · ${b.reason}`; m[k] = (m[k] || 0) + 1; return m; }, {}))
        .sort((a: any, b: any) => b[1] - a[1]).slice(0, 10),
      logins: ((logins.data as any[]) || []).slice(0, 15),
      errors: ((errs.data as any[]) || []).slice(0, 30),
      mailFails: custMail.slice(0, 20),
      heartbeats: beats.data || [],
      mail: mail.data ? { ...mail.data, lock: st.data?.email_lock_enabled !== false } : null,
    },
  });
}
