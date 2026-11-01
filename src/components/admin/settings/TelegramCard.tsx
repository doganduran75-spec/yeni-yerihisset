"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Ayarlar › Entegrasyonlar › Telegram (src/lib/telegram.ts, /api/admin/telegram).
// Kurulum: BotFather'dan bot → token yapıştır → Telegram'da bota /start → "Sohbeti bul" → deneme → Aç.
// Konular parametrik: hazır olanlar açılıp kapanır, diğerleri "yakında". Token kaydedildikten sonra hiç gösterilmez.
import { useCallback, useEffect, useState } from "react";
import IntegrationSection from "@/components/admin/settings/IntegrationSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { Send, Loader2, Search, Trash2 } from "lucide-react";

async function api(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/admin/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Telegram hatası");
  return j;
}

const TOPIC_LABEL: Record<string, string> = {
  new_order: "Yeni sipariş", stock_request: "Stok talebi", after_sale_request: "İade / değişim talebi", customer_message: "Müşteri mesajı",
  integration_error: "Entegrasyon hatası", server_alert: "Sunucu uyarısı", daily_summary: "Günlük özet",
};
const STATUS: Record<string, string> = { pending: "sırada", sending: "gönderiliyor", sent: "gönderildi (güncellenecek)", done: "gönderildi", skipped: "atlandı", failed: "gönderilemedi" };

export default function TelegramCard() {
  const [st, setSt] = useState<any>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSt(await api({ op: "status" })); } catch (e: any) { setSt({ error: e?.message }); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    try { await fn(); await load(); } catch (e: any) { siteAlert({ title: "Telegram", message: e?.message || "Hata", tone: "danger" }); }
    finally { setBusy(null); }
  }

  const step = (n: number, done: boolean, text: React.ReactNode) => (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${done ? "bg-green-600 text-white" : "bg-slate-200 text-slate-600"}`}>{done ? "✓" : n}</span>
      <div className="flex-1">{text}</div>
    </div>
  );
  const enabled = !!st?.enabled;
  const topics: Record<string, boolean> = st?.topics || {};

  return (
    <IntegrationSection id="telegram" icon={<Send size={20} className="text-sky-500" />} title="Telegram bildirimleri"
      summary="Yeni sipariş, talepler, müşteri mesajı, entegrasyon hatası, sunucu uyarısı, günlük özet"
      status={enabled ? "Açık" : st?.tokenSet ? "Kapalı" : "Kurulmadı"} tone={enabled ? "ok" : st?.tokenError ? "warn" : "off"}
      right={<label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={enabled} disabled={!!busy || !st?.tokenSet || !st?.chatId}
          onChange={(e) => run("en", async () => { await api({ op: "save", enabled: e.target.checked }); })} /> Açık
      </label>}>
      <p className="text-sm text-muted-foreground">
        Seçtiğin konular Telegram’daki bir sohbete gelir. Yeni siparişte mesaj hemen gider; pazaryeri / Google gönderimleri bitince aynı mesaj
        “hangi entegrasyon güncellendi” bilgisiyle güncellenir. Mesajda müşteri adı ve ürünler olur (adres / telefon yok).
      </p>
      {st?.error && <p className="text-xs text-red-600">{st.error}</p>}

      {step(1, !!st?.bot, (
        <div className="space-y-2">
          <p>Telegram’da <b>@BotFather</b> → <code>/newbot</code> ile bot oluştur, verdiği token’ı buraya yapıştır. Token kaydedildikten sonra bir daha gösterilmez.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} className="max-w-md font-mono text-xs"
              placeholder={st?.tokenSet ? "Kayıtlı (değiştirmek için yeni token yapıştır)" : "123456789:AA…"} />
            <Button size="sm" disabled={!!busy || !token.trim()} onClick={() => run("tok", async () => { await api({ op: "save", token }); setToken(""); })}>
              {busy === "tok" && <Loader2 size={14} className="animate-spin mr-1" />} Kaydet
            </Button>
            {st?.tokenSet && (
              <Button size="sm" variant="ghost" className="text-red-600" disabled={!!busy} onClick={async () => {
                if (!(await siteConfirm({ title: "Token silinsin mi?", message: "Telegram bildirimleri kapanır.", confirmText: "Sil", tone: "danger" }))) return;
                run("rm", async () => { await api({ op: "remove_token" }); });
              }}><Trash2 size={14} /> Token’ı sil</Button>
            )}
          </div>
          {st?.bot && <p className="text-xs text-green-700">Bağlı bot: <b>@{st.bot}</b></p>}
          {st?.tokenError && <p className="text-xs text-red-600">{st.tokenError}</p>}
        </div>
      ))}

      {step(2, !!st?.chatId, (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span>Telegram’da botu aç, <code>/start</code> yaz; sonra:</span>
            <Button size="sm" variant="outline" disabled={!!busy || !st?.tokenSet} onClick={() => run("chat", async () => {
              const j = await api({ op: "find_chat" });
              siteAlert({ message: `Sohbet bulundu: ${j.name || j.chatId}`, tone: "success" });
            })}>{busy === "chat" ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Sohbeti bul</Button>
          </div>
          {st?.chatId && <p className="text-xs text-muted-foreground">Sohbet kimliği: <code>{st.chatId}</code></p>}
        </div>
      ))}

      {step(3, false, (
        <div className="flex flex-wrap items-center gap-2">
          <span>Deneme mesajı gönder, sonra sağ üstten <b>Aç</b>.</span>
          <Button size="sm" variant="outline" disabled={!!busy || !st?.tokenSet || !st?.chatId} onClick={() => run("test", async () => {
            await api({ op: "test" });
            siteAlert({ message: "Deneme mesajı gönderildi — Telegram’a bak.", tone: "success" });
          })}>{busy === "test" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Deneme gönder</Button>
        </div>
      ))}

      <div className="rounded-lg border divide-y">
        <p className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-50">Konular — hangi bildirimler gelsin</p>
        {(st?.topicList || []).map((t: any) => (
          <label key={t.key} className={`flex items-start gap-2 px-3 py-2 text-sm ${t.ready ? "" : "opacity-60"}`}>
            <input type="checkbox" className="mt-1" disabled={!t.ready || !!busy} checked={t.ready && !!topics[t.key]}
              onChange={(e) => run("topic", async () => { await api({ op: "save", topics: { ...topics, [t.key]: e.target.checked } }); })} />
            <span className="flex-1">
              <b>{t.label}</b>{!t.ready && <span className="ml-2 text-[10px] font-bold uppercase text-slate-400">yakında</span>}
              <span className="block text-xs text-muted-foreground">{t.desc}</span>
              {t.key === "daily_summary" && (
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  Saat:
                  <select className="h-7 rounded border px-1 bg-white" disabled={!!busy} value={st?.dailyHour ?? 9}
                    onChange={(e) => run("hour", async () => { await api({ op: "save", dailyHour: Number(e.target.value) }); })}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                  <button type="button" className="underline text-sky-700 disabled:opacity-50" disabled={!!busy || !st?.tokenSet || !st?.chatId}
                    onClick={() => run("daily", async () => { await api({ op: "send_daily" }); siteAlert({ message: "Günlük özet gönderildi — Telegram’a bak.", tone: "success" }); })}>
                    Şimdi gönder (deneme)
                  </button>
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      {st?.recent?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-slate-600">Son gönderimler</p>
          <ul className="text-xs space-y-0.5">
            {st.recent.map((r: any) => (
              <li key={r.id} className="flex flex-wrap gap-2">
                <span className="text-slate-400">{new Date(r.created_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</span>
                <span>{TOPIC_LABEL[r.topic] || r.topic} {r.order && <b>{r.order}</b>}</span>
                <span className={r.status === "failed" ? "text-red-600 font-semibold" : r.status === "done" || r.status === "sent" ? "text-green-700" : "text-slate-500"}>{STATUS[r.status] || r.status}</span>
                {r.error && <span className="text-slate-400">— {r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </IntegrationSection>
  );
}
