"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, ShoppingBag, Ticket,
  MessageSquare, StickyNote, Loader2, Plus, User,
} from "lucide-react";

const statusLabels: Record<string, string> = {
  pending: "Bekliyor", processing: "Hazırlanıyor", shipped: "Kargoda",
  delivered: "Teslim", completed: "Tamamlandı", cancelled: "İptal",
  refunded: "İade", awaiting_payment: "Ödeme Bekliyor",
};

export default function MemberDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const sb = supabase as any;
    const [p, o, c, m, n] = await Promise.all([
      sb.from("profiles").select("id, email, first_name, last_name, phone, city, created_at").eq("id", id).maybeSingle(),
      sb.from("orders").select("id, order_number, status, total_amount, payment_status, created_at").eq("user_id", id).order("created_at", { ascending: false }),
      sb.from("user_coupons").select("id, use_count, created_at, coupons(code, name, type, amount)").eq("user_id", id).order("created_at", { ascending: false }),
      sb.from("messages").select("id, content, sender_role, created_at").eq("user_id", id).order("created_at", { ascending: false }),
      sb.from("member_notes").select("id, note, created_at").eq("user_id", id).order("created_at", { ascending: false }),
    ]);
    setProfile(p.data);
    setOrders(o.data || []);
    setCoupons(c.data || []);
    setMessages(m.data || []);
    setNotes(n.data || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { if (id) fetchAll(); }, [id, fetchAll]);

  async function addNote() {
    const note = noteInput.trim();
    if (!note) return;
    setSavingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("member_notes").insert({ user_id: id, note, created_by: user?.id });
    setSavingNote(false);
    if (error) { alert("Not eklenemedi: " + error.message); return; }
    setNoteInput("");
    fetchAll();
  }

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "İsimsiz Üye";
  const totalSpent = orders
    .filter((o) => o.payment_status === "paid" || o.status === "completed")
    .reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("tr-TR");

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;
  }
  if (!profile) {
    return (
      <div className="space-y-4">
        <Link href="/admin/members" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600"><ArrowLeft size={16} /> Üyeler</Link>
        <p className="text-slate-500">Üye bulunamadı.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/members" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:gap-3 transition-all">
        <ArrowLeft size={16} /> Üyeler
      </Link>

      {/* Üst bilgi kartı */}
      <div className="bg-white rounded-3xl border shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <User size={26} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">{fullName}</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
                {profile.email && <span className="flex items-center gap-1"><Mail size={13} /> {profile.email}</span>}
                {profile.phone && <span className="flex items-center gap-1"><Phone size={13} /> {profile.phone}</span>}
                {profile.city && <span className="flex items-center gap-1"><MapPin size={13} /> {profile.city}</span>}
                <span className="flex items-center gap-1"><Calendar size={13} /> {fmtDate(profile.created_at)} tarihinde üye</span>
              </div>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div><p className="text-2xl font-black text-slate-900">{orders.length}</p><p className="text-[10px] font-bold uppercase text-slate-400">Sipariş</p></div>
            <div><p className="text-2xl font-black text-green-600">₺{totalSpent.toLocaleString("tr-TR")}</p><p className="text-[10px] font-bold uppercase text-slate-400">Harcama</p></div>
            <div><p className="text-2xl font-black text-amber-600">{coupons.length}</p><p className="text-[10px] font-bold uppercase text-slate-400">Kupon</p></div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Notlar */}
        <section className="bg-white rounded-3xl border shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><StickyNote size={18} className="text-amber-500" /> Notlar</h3>
          <div className="flex gap-2">
            <input
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNote(); } }}
              placeholder="Bu üye hakkında not ekle…"
              className="flex-1 h-10 px-3 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-blue-500 text-sm"
            />
            <button onClick={addNote} disabled={savingNote || !noteInput.trim()} className="h-10 px-4 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-40 flex items-center gap-1">
              {savingNote ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ekle
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-xs text-slate-400">Henüz not yok.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="bg-amber-50/60 border border-amber-100 rounded-xl px-3 py-2">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.note}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString("tr-TR")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Kuponlar */}
        <section className="bg-white rounded-3xl border shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><Ticket size={18} className="text-amber-500" /> Kuponlar</h3>
          {coupons.length === 0 ? (
            <p className="text-xs text-slate-400">Tanımlı kupon yok.</p>
          ) : (
            <ul className="space-y-2">
              {coupons.map((c) => (
                <li key={c.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2">
                  <div>
                    <span className="font-mono font-bold text-slate-800 text-sm">{c.coupons?.code}</span>
                    <span className="text-xs text-slate-500 ml-2">{c.coupons?.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{c.use_count > 0 ? "Kullanıldı" : "Aktif"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Alışverişler */}
        <section className="bg-white rounded-3xl border shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><ShoppingBag size={18} className="text-blue-500" /> Alışverişler</h3>
          {orders.length === 0 ? (
            <p className="text-xs text-slate-400">Henüz sipariş yok.</p>
          ) : (
            <ul className="space-y-2">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2">
                  <div>
                    <span className="font-bold text-slate-800 text-sm">#{o.order_number || o.id.slice(0, 8).toUpperCase()}</span>
                    <span className="text-[10px] text-slate-400 ml-2">{fmtDate(o.created_at)}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-900 text-sm">₺{Number(o.total_amount).toLocaleString("tr-TR")}</p>
                    <p className="text-[10px] font-bold text-slate-400">{statusLabels[o.status] || o.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Yazışmalar */}
        <section className="bg-white rounded-3xl border shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><MessageSquare size={18} className="text-purple-500" /> Yazışmalar</h3>
          {messages.length === 0 ? (
            <p className="text-xs text-slate-400">Yazışma yok.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {messages.map((m) => (
                <li key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.sender_role === "admin" ? "bg-blue-50 border border-blue-100" : "bg-slate-50 border border-slate-100"}`}>
                  <p className="text-slate-700 whitespace-pre-wrap">{m.content}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{m.sender_role === "admin" ? "Ekip" : "Müşteri"} · {new Date(m.created_at).toLocaleString("tr-TR")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
