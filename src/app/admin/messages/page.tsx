"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Loader2, Search, Send, CheckCheck, Inbox, MessageSquare, Mail, Phone, Package,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Message = {
  id: string; user_id: string; order_id: string; content: string;
  sender_role: "user" | "admin"; is_read: boolean; created_at: string;
};

// Bir konuşma = bir SİPARİŞ. Mesajlaşma her zaman siparişe bağlıdır.
type Thread = {
  order_id: string;
  order_number: number | null;
  user_id: string;
  first_name: string; last_name: string; email: string; phone: string;
  last_at: string; last_content: string; last_role: "user" | "admin";
  unread: number;
};

function label(t: Thread) {
  return t.order_number ? `YH${t.order_number}` : `#${t.order_id.slice(0, 8)}`;
}

function MessagesInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("order"));
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchThreads(); }, []);

  useEffect(() => {
    if (selectedId) {
      router.replace(`/admin/messages?order=${selectedId}`, { scroll: false });
      fetchMessages(selectedId);
      markAsRead(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function fetchThreads() {
    setLoading(true);
    const { data: raw } = await (supabase as any)
      .from("messages")
      .select("order_id, user_id, content, created_at, is_read, sender_role")
      .not("order_id", "is", null)
      .order("created_at", { ascending: false });

    const map = new Map<string, Thread>();
    for (const m of (raw as any[]) || []) {
      if (!map.has(m.order_id)) {
        map.set(m.order_id, {
          order_id: m.order_id, order_number: null, user_id: m.user_id,
          first_name: "", last_name: "", email: "", phone: "",
          last_at: m.created_at, last_content: m.content, last_role: m.sender_role, unread: 0,
        });
      }
      if (m.sender_role === "user" && !m.is_read) map.get(m.order_id)!.unread += 1;
    }
    const list = [...map.values()];

    if (list.length) {
      const orderIds = list.map((t) => t.order_id);
      const userIds = [...new Set(list.map((t) => t.user_id))];
      const [{ data: ords }, { data: profs }] = await Promise.all([
        (supabase as any).from("orders").select("id, order_number, user_id").in("id", orderIds),
        (supabase as any).from("profiles").select("id, first_name, last_name, email, phone").in("id", userIds),
      ]);
      const ordMap = new Map((ords || []).map((o: any) => [o.id, o]));
      const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
      for (const t of list) {
        const o: any = ordMap.get(t.order_id);
        const p: any = profMap.get(t.user_id);
        t.order_number = o?.order_number ?? null;
        t.first_name = p?.first_name || ""; t.last_name = p?.last_name || "";
        t.email = p?.email || ""; t.phone = p?.phone || "";
      }
    }
    setThreads(list);
    setLoading(false);
  }

  async function fetchMessages(orderId: string) {
    setMessagesLoading(true);
    const { data } = await (supabase as any)
      .from("messages").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
    setMessages((data as any[]) || []);
    setMessagesLoading(false);
  }

  async function markAsRead(orderId: string) {
    await (supabase as any)
      .from("messages").update({ is_read: true })
      .eq("order_id", orderId).eq("sender_role", "user").eq("is_read", false);
    setThreads((prev) => prev.map((t) => t.order_id === orderId ? { ...t, unread: 0 } : t));
  }

  async function handleSend() {
    const content = newMessage.trim();
    const thread = threads.find((t) => t.order_id === selectedId);
    if (!content || !selectedId || !thread || sending) return;
    setSending(true);
    try {
      const { data, error } = await (supabase as any)
        .from("messages")
        .insert({ user_id: thread.user_id, order_id: selectedId, content, sender_role: "admin" })
        .select().single();
      if (error) throw error;
      setMessages((m) => [...m, data as any]);
      setThreads((prev) => prev.map((t) => t.order_id === selectedId ? { ...t, last_at: data.created_at, last_content: content, last_role: "admin" } : t));
      setNewMessage("");
      if (thread.email) {
        fetch("/api/crm/send-email", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: thread.user_id, body: content }),
        }).catch((e) => console.error("Email error:", e));
      }
    } catch {
      alert("Hata: Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  const q = search.toLowerCase();
  const filtered = threads.filter((t) =>
    `${t.first_name} ${t.last_name}`.toLowerCase().includes(q) ||
    t.email.toLowerCase().includes(q) ||
    label(t).toLowerCase().includes(q)
  );
  const selected = threads.find((t) => t.order_id === selectedId);

  return (
    <div className="h-[calc(100vh-140px)] flex gap-6">
      {/* Sipariş konuşmaları listesi */}
      <Card className="w-80 flex flex-col border-none shadow-sm overflow-hidden bg-white rounded-3xl shrink-0">
        <div className="p-4 border-b space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Inbox size={20} className="text-blue-600" /> Sipariş Mesajları
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input placeholder="Sipariş no / müşteri ara..." className="pl-9 h-10 rounded-xl bg-slate-50 border-none"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center"><Loader2 size={24} className="animate-spin mx-auto text-blue-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm italic">Mesaj bulunamadı.</div>
          ) : (
            filtered.map((t) => (
              <button key={t.order_id} onClick={() => setSelectedId(t.order_id)}
                className={cn(
                  "w-full p-4 flex items-start gap-3 transition-colors border-b last:border-0 text-left relative",
                  selectedId === t.order_id ? "bg-blue-50/50" : "hover:bg-slate-50"
                )}>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Package size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <p className="font-black text-sm text-blue-700 truncate">{label(t)}</p>
                    {t.unread > 0 && (
                      <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{t.unread}</span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-700 truncate">{t.first_name} {t.last_name}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {t.last_role === "admin" ? "Siz: " : ""}{t.last_content}
                  </p>
                </div>
                {selectedId === t.order_id && <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-600" />}
              </button>
            ))
          )}
        </div>
      </Card>

      {/* Konuşma ekranı */}
      <Card className="flex-1 flex flex-col border-none shadow-sm overflow-hidden bg-white rounded-3xl">
        {selectedId && selected ? (
          <>
            <div className="p-4 border-b bg-white shrink-0 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Package size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-black text-blue-700 leading-none">{label(selected)}</h4>
                    <span className="text-sm font-bold text-slate-800">{selected.first_name} {selected.last_name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    {selected.email && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <Mail size={10} /> {selected.email}
                      </span>
                    )}
                    {selected.phone && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-l pl-3">
                        <Phone size={10} /> {selected.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl font-bold text-xs shrink-0" onClick={() => fetchMessages(selectedId)}>Yenile</Button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
              {messagesLoading ? (
                <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={cn("flex flex-col max-w-[70%]", msg.sender_role === "admin" ? "ml-auto items-end" : "mr-auto items-start")}>
                    <div className={cn(
                      "px-4 py-3 rounded-2xl text-sm leading-relaxed font-medium shadow-sm",
                      msg.sender_role === "admin" ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-slate-900 border rounded-tl-none"
                    )}>
                      {msg.content}
                    </div>
                    <div className="flex items-center gap-1 mt-1 px-1">
                      <span className="text-[10px] text-slate-400">
                        {new Date(msg.created_at).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                      </span>
                      {msg.sender_role === "admin" && <CheckCheck size={12} className={cn(msg.is_read ? "text-blue-500" : "text-slate-300")} />}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t bg-white shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-3 items-end">
                <textarea
                  placeholder="Cevabınızı yazın..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 min-h-[50px] max-h-40 p-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-600 outline-none bg-slate-50/50 resize-none text-sm font-medium transition-all"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
                <Button disabled={!newMessage.trim() || sending} className="h-12 w-12 bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-lg shadow-blue-100 shrink-0 p-0">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </Button>
              </form>
              <p className="text-[10px] text-slate-400 mt-2 px-1 italic">Müşteri cevabınızı ilgili siparişin altında görecek ve e-posta ile bilgilendirilecektir.</p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200"><MessageSquare size={36} /></div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Bir sipariş konuşması seçin</h3>
              <p className="text-sm text-slate-400 max-w-[250px] mt-1 mx-auto">Soldaki listeden bir siparişe ait mesajları görüntüleyin.</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <Suspense fallback={<div className="flex h-[400px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <MessagesInner />
    </Suspense>
  );
}
