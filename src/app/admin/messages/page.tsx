"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Loader2, Search, User, Send, CheckCheck, Inbox,
  MessageSquare, Mail, Phone, Calendar
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  user_id: string;
  content: string;
  sender_role: 'user' | 'admin';
  is_read: boolean;
  created_at: string;
};

type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  last_message_at?: string;
  unread_count?: number;
};

export default function AdminMessagesPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      fetchMessages(selectedUserId);
      markAsRead(selectedUserId);
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchUsers() {
    setLoading(true);
    // Masaj yazan kullanıcıları ve son mesaj tarihlerini çek
    const { data: rawMessages } = await supabase
      .from('messages' as any)
      .select('user_id, created_at, is_read, sender_role')
      .order('created_at', { ascending: false });

    if (!rawMessages || (rawMessages as any).hasOwnProperty('error')) {
      setLoading(false);
      return;
    }

    const messagesList = rawMessages as any[];

    // Benzersiz kullanıcı ID'lerini ve istatistikleri topla
    const userStatsMap = new Map();
    messagesList.forEach(m => {
      if (!userStatsMap.has(m.user_id)) {
        userStatsMap.set(m.user_id, {
          last_at: m.created_at,
          unread: m.sender_role === 'user' && !m.is_read ? 1 : 0
        });
      } else if (m.sender_role === 'user' && !m.is_read) {
        userStatsMap.get(m.user_id).unread += 1;
      }
    });

    const userIds = Array.from(userStatsMap.keys());
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone')
      .in('id', userIds);

    const formattedUsers: Profile[] = (profiles || []).map(p => ({
      ...p,
      first_name: p.first_name || "",
      last_name: p.last_name || "",
      email: p.email || "",
      phone: p.phone || "",
      last_message_at: userStatsMap.get(p.id).last_at,
      unread_count: userStatsMap.get(p.id).unread
    })).sort((a, b) => new Date(b.last_message_at!).getTime() - new Date(a.last_message_at!).getTime());

    setUsers(formattedUsers);
    setLoading(false);
  }

  async function fetchMessages(userId: string) {
    setMessagesLoading(true);
    const { data } = await supabase
      .from('messages' as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    setMessages((data as any[]) || []);
    setMessagesLoading(false);
  }

  async function markAsRead(userId: string) {
    await supabase
      .from('messages' as any)
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('sender_role', 'user');
    
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, unread_count: 0 } : u));
  }

  async function handleSend() {
    if (!newMessage.trim() || !selectedUserId || sending) return;
    setSending(true);

    const selectedUser = users.find(u => u.id === selectedUserId);

    try {
      const { data, error } = await supabase
        .from('messages' as any)
        .insert({
          user_id: selectedUserId,
          content: newMessage.trim(),
          sender_role: 'admin'
        })
        .select()
        .single();

      if (error) throw error;

      setMessages([...messages, data as any]);
      setNewMessage("");

      // E-posta bildirimi gönder
      if (selectedUser?.email) {
        await fetch('/api/crm/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: selectedUserId,
            body: newMessage.trim(),
          })
        }).catch(e => console.error("Email error:", e));
      }

    } catch (err) {
      alert("Hata: Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  const filteredUsers = users.filter(u => 
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="h-[calc(100vh-140px)] flex gap-6">
      {/* User List Sidebar */}
      <Card className="w-80 flex flex-col border-none shadow-sm overflow-hidden bg-white rounded-3xl shrink-0">
        <div className="p-4 border-b space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Inbox size={20} className="text-blue-600" /> Mesajlar
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input 
              placeholder="Müşteri ara..." 
              className="pl-9 h-10 rounded-xl bg-slate-50 border-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center"><Loader2 size={24} className="animate-spin mx-auto text-blue-600" /></div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm italic">Mesaj bulunamadı.</div>
          ) : (
            filteredUsers.map(user => (
              <button
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                className={cn(
                  "w-full p-4 flex items-center gap-3 transition-colors border-b last:border-0 text-left relative",
                  selectedUserId === user.id ? "bg-blue-50/50" : "hover:bg-slate-50"
                )}
              >
                <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                  <AvatarFallback className="bg-blue-100 text-blue-600 font-bold capitalize">
                    {user.first_name[0]}{user.last_name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-sm text-slate-900 truncate">{user.first_name} {user.last_name}</p>
                    {user.unread_count && user.unread_count > 0 ? (
                      <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {user.unread_count}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{user.email}</p>
                </div>
                {selectedUserId === user.id && <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-600" />}
              </button>
            ))
          )}
        </div>
      </Card>

      {/* Conversation View */}
      <Card className="flex-1 flex flex-col border-none shadow-sm overflow-hidden bg-white rounded-3xl">
        {selectedUserId ? (
          <>
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border-2 border-blue-100">
                  <AvatarFallback className="bg-blue-100 text-blue-600 font-bold capitalize">
                    {selectedUser?.first_name[0]}{selectedUser?.last_name[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-black text-slate-900 leading-none">{selectedUser?.first_name} {selectedUser?.last_name}</h4>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <Mail size={10} /> {selectedUser?.email}
                    </span>
                    {selectedUser?.phone && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-l pl-3">
                        <Phone size={10} /> {selectedUser.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl font-bold text-xs" onClick={() => fetchMessages(selectedUserId)}>
                Yenile
              </Button>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30"
            >
              {messagesLoading ? (
                <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div key={msg.id} className={cn(
                      "flex flex-col max-w-[70%]",
                      msg.sender_role === "admin" ? "ml-auto items-end" : "mr-auto items-start"
                    )}>
                      <div className={cn(
                        "px-4 py-3 rounded-2xl text-sm leading-relaxed font-medium shadow-sm",
                        msg.sender_role === "admin" 
                          ? "bg-blue-600 text-white rounded-tr-none" 
                          : "bg-white text-slate-900 border rounded-tl-none"
                      )}>
                        {msg.content}
                      </div>
                      <div className="flex items-center gap-1 mt-1 px-1">
                        <span className="text-[10px] text-slate-400">
                          {new Date(msg.created_at).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                        </span>
                        {msg.sender_role === "admin" && (
                          <CheckCheck size={12} className={cn(msg.is_read ? "text-blue-500" : "text-slate-300")} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer / Input */}
            <div className="p-4 border-t bg-white shrink-0">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex gap-3 items-end"
              >
                <div className="flex-1 relative">
                  <textarea 
                    placeholder="Cevabınızı yazın..." 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="w-full min-h-[50px] max-h-40 p-3 pr-10 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-600 ring-offset-0 outline-none bg-slate-50/50 resize-none text-sm font-medium transition-all"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                </div>
                <Button 
                  disabled={!newMessage.trim() || sending}
                  className="h-12 w-12 bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-lg shadow-blue-100 shrink-0 p-0"
                >
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </Button>
              </form>
              <p className="text-[10px] text-slate-400 mt-2 px-1 italic">Müşteri cevabınızı panelinde görecek ve e-posta ile bilgilendirilecektir.</p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
              <MessageSquare size={36} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Sohbet Başlatın</h3>
              <p className="text-sm text-slate-400 max-w-[250px] mt-1 mx-auto">Mesajlarını görüntülemek istediğiniz bir müşteri seçin.</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
