"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SystemStatusStrip, { type SystemStatus } from "@/components/admin/SystemStatusStrip";
import ServerHealthCard from "@/components/admin/ServerHealthCard";
import BackupStatusCard from "@/components/admin/BackupStatusCard";
import MarketplaceSyncCard from "@/components/admin/MarketplaceSyncCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { ShieldAlert, KeyRound, UserX, Server, Plug, DatabaseBackup, Mail, Loader2, Send } from "lucide-react";

// SİSTEM — panodaki şeridin ayrıntısı: sunucu, entegrasyon, yedek, saldırı, yetkisiz giriş,
// hata alan müşteriler. Veri: /api/admin/system-status (+ mevcut sağlık / yedek / senkron kartları).
const t = (iso: string) => new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const KIND: Record<string, string> = { checkout: "Ödeme sayfası", stock: "Stok", payment_failed: "Kart ödemesi başarısız", after_sale: "Değişim / iade", other: "Diğer" };

function Section({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2">{icon} {title}</h2>
      {children}
    </section>
  );
}

// E-posta: son gönderimler + SMTP doğrulaması + "deneme e-postası gönder" (gerçekten geliyor mu?)
function MailSection({ m }: { m: any }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function sendTest() {
    setBusy(true); setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/system-status", {
        method: "POST", headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ action: "test_mail" }),
      });
      const j = await r.json();
      setMsg(r.ok ? { ok: true, text: `Gönderildi → ${j.to}. Gelen kutunu (ve spam klasörünü) kontrol et.` } : { ok: false, text: j.error || `HTTP ${r.status}` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || "Gönderilemedi" }); } finally { setBusy(false); }
  }
  const row = (k: string, v: React.ReactNode) => <tr className="border-b last:border-0"><td className="py-1.5 text-muted-foreground w-56">{k}</td><td className="py-1.5">{v}</td></tr>;
  return (
    <Card className="shadow-sm"><CardContent className="pt-4 text-sm space-y-3">
      {!m ? <p className="text-muted-foreground">Henüz kayıt yok (ilk gönderim / ilk doğrulamadan sonra dolar).</p> : (
        <table className="w-full"><tbody>
          {row("Son başarılı gönderim", m.last_ok_at ? t(m.last_ok_at) : "—")}
          {row("Son başarısız gönderim", m.last_fail_at ? <>{t(m.last_fail_at)}{m.last_error ? <span className="block text-xs text-red-700">{m.last_error}</span> : null}</> : "—")}
          {row("Art arda başarısız", String(m.fail_streak ?? 0))}
          {row("SMTP bağlantısı (15 dk'da bir)", m.verify_at ? <>{m.verify_ok ? "✓ çalışıyor" : "✗ bağlanılamıyor"} · {t(m.verify_at)}{!m.verify_ok && m.verify_error ? <span className="block text-xs text-red-700">{m.verify_error}</span> : null}</> : "henüz doğrulanmadı")}
          {row("E-posta kilidi", m.lock ? "açık — yalnız yöneticilere / izinli adreslere gider (canlıda kapatılacak)" : "kapalı — müşterilere gidiyor")}
        </tbody></table>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy} onClick={sendTest} className="gap-1.5">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Deneme e-postası gönder
        </Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-muted-foreground">“Gönderildi” yalnız e-posta sunucusunun kabul ettiğini gösterir; asıl kanıt deneme e-postasının gelen kutuna düşmesidir.</p>
    </CardContent></Card>
  );
}

export default function SystemPage() {
  const [d, setD] = useState<SystemStatus | null>(null);
  const det = d?.details;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sistem</h1>
        <p className="text-muted-foreground">Site, entegrasyonlar, yedek ve güvenlik. Yeşilse bakmana gerek yok.</p>
      </div>
      <SystemStatusStrip onData={setD} linkTo="/admin/system" />

      <Section id="sunucu" icon={<Server size={18} className="text-slate-500" />} title="Site ve sunucu">
        <ServerHealthCard />
      </Section>

      <Section id="entegrasyon" icon={<Plug size={18} className="text-slate-500" />} title="Entegrasyonlar">
        <MarketplaceSyncCard />
        {det?.heartbeats?.length > 0 && (
          <Card className="shadow-sm"><CardContent className="pt-4 text-sm space-y-1">
            {det.heartbeats.map((b: any) => <p key={b.name}><b>{b.name}</b> · son çalışma {t(b.last_run_at)}{b.message ? ` · ${b.message}` : ""}</p>)}
          </CardContent></Card>
        )}
      </Section>

      <Section id="eposta" icon={<Mail size={18} className="text-slate-500" />} title="E-posta">
        <MailSection m={det?.mail} />
      </Section>

      <Section id="yedek" icon={<DatabaseBackup size={18} className="text-slate-500" />} title="Yedek">
        <BackupStatusCard />
      </Section>

      <Section id="saldiri" icon={<ShieldAlert size={18} className="text-slate-500" />} title="Saldırı / bot (son 24 saat)">
        <Card className="shadow-sm"><CardContent className="pt-4 text-sm">
          {!det ? "…" : det.bots.length === 0 ? <p className="text-muted-foreground">Engellenen bot isteği yok.</p> : (
            <table className="w-full"><tbody>
              {det.bots.map(([k, n]: [string, number]) => <tr key={k} className="border-b last:border-0"><td className="py-1.5">{k}</td><td className="py-1.5 text-right font-bold">{n}</td></tr>)}
            </tbody></table>
          )}
          <p className="text-xs text-muted-foreground mt-3">Formlara (bülten, kayıt, sipariş, stok bildirimi…) gelen otomatik istekler engellenip burada sayılır; müşteriye bir şey olmaz. SSH (sunucu) denemeleri “Site ve sunucu” kontrollerinde.</p>
        </CardContent></Card>
      </Section>

      <Section id="giris" icon={<KeyRound size={18} className="text-slate-500" />} title="Yönetici girişleri (son 7 gün)">
        <Card className="shadow-sm"><CardContent className="pt-4 text-sm">
          {!det ? "…" : det.logins.length === 0 ? <p className="text-muted-foreground">Kayıtlı yönetici girişi yok.</p> : (
            <table className="w-full"><tbody>
              {det.logins.map((l: any, i: number) => (
                <tr key={i} className={`border-b last:border-0 ${l.new_ip ? "bg-amber-50" : ""}`}>
                  <td className="py-1.5">{t(l.created_at)}</td><td className="py-1.5">{l.email}</td>
                  <td className="py-1.5 font-mono text-xs">{l.ip || "—"}</td>
                  <td className="py-1.5 text-right text-xs font-bold text-amber-700">{l.new_ip ? "yeni IP" : ""}</td>
                </tr>
              ))}
            </tbody></table>
          )}
          <p className="text-xs text-muted-foreground mt-3">“Yeni IP”: o yöneticinin son 30 günde kullanmadığı bir adresten giriş. Sen değilsen şifreni hemen değiştir.</p>
        </CardContent></Card>
      </Section>

      <Section id="musteri-hatalari" icon={<UserX size={18} className="text-slate-500" />} title="Hata alan müşteriler (son 24 saat)">
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sayfa / ödeme hataları</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {!det ? "…" : det.errors.length === 0 ? <p className="text-muted-foreground">Hata yok.</p> : (
              <ul className="space-y-1.5">
                {det.errors.map((e: any, i: number) => (
                  <li key={i} className="border-b last:border-0 pb-1.5">
                    <span className="text-xs text-muted-foreground">{t(e.created_at)} · {KIND[e.kind] ?? e.kind}{e.path ? ` · ${e.path}` : ""}</span>
                    <p>{e.message}{e.order_id && <> · <Link className="text-blue-600 underline" href={`/admin/orders?id=${e.order_id}`}>siparişe git</Link></>}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Müşteriye gönderilemeyen e-postalar</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {!det ? "…" : det.mailFails.length === 0 ? <p className="text-muted-foreground">Yok.</p> : (
              <ul className="space-y-1.5">
                {det.mailFails.map((m: any, i: number) => (
                  <li key={i} className="border-b last:border-0 pb-1.5">
                    <span className="text-xs text-muted-foreground">{t(m.created_at)} · {m.trigger} · {m.recipient}</span>
                    <p>{m.error_message}{m.order_id && <> · <Link className="text-blue-600 underline" href={`/admin/orders?id=${m.order_id}`}>siparişe git</Link></>}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
