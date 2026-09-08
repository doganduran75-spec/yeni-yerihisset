"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Edit, Trash2, Loader2, Handshake, Globe, Phone, User } from "lucide-react";

type Partner = {
  id: string;
  company_name: string;
  contact_person: string;
  phone: string;
  website: string;
};

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    company_name: "",
    contact_person: "",
    phone: "",
    website: ""
  });

  useEffect(() => {
    fetchPartners();
  }, []);

  async function fetchPartners() {
    try {
      const { data, error } = await supabase.from('partners').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setPartners(data || []);
    } catch (error) {
      console.error("Error fetching partners:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.company_name) return;
    setSaving(true);
    try {
      if (editingId) {
        await supabase.from('partners').update(formData).eq('id', editingId);
      } else {
        await supabase.from('partners').insert(formData);
      }
      setIsDialogOpen(false);
      setFormData({ company_name: "", contact_person: "", phone: "", website: "" });
      fetchPartners();
    } catch (error) {
      console.error("Error saving partner:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu iş ortağını silmek istediğinize emin misiniz?")) return;
    await supabase.from('partners').delete().eq('id', id);
    fetchPartners();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-3xl font-bold tracking-tight text-slate-900">İş Ortakları</h2>
           <p className="text-muted-foreground">Birlikte çalıştığınız firmaları ve kontak kişilerini yönetin.</p>
        </div>
        
        <Button onClick={() => { setEditingId(null); setFormData({ company_name: "", contact_person: "", phone: "", website: "" }); setIsDialogOpen(true); }} className="gap-2">
           <Plus size={16} /> Yeni İş Ortağı
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "İş Ortağını Düzenle" : "Yeni İş Ortağı Ekle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2">
                <label className="text-sm font-medium">Firma / Ünvan</label>
                <Input value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} placeholder="Örn: Aras Kargo" />
             </div>
             <div className="space-y-2">
                <label className="text-sm font-medium">İlgili Kişi</label>
                <Input value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} placeholder="Örn: Ahmet Yılmaz" />
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Telefon</label>
                  <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="05XX XXX XX XX" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Websitesi</label>
                  <Input value={formData.website} onChange={e => setFormData({...formData, website: e.target.value})} placeholder="https://..." />
                </div>
             </div>
          </div>
          <DialogFooter>
             <Button onClick={handleSave} disabled={saving}>
               {saving ? <Loader2 size={16} className="animate-spin" /> : "Kaydet"}
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="shadow-sm border-muted">
        <CardContent className="p-0">
           {loading ? (
             <div className="py-20 text-center"><Loader2 size={32} className="animate-spin mx-auto opacity-20" /></div>
           ) : (
             <Table>
               <TableHeader>
                 <TableRow className="bg-slate-50/50">
                    <TableHead>Firma / Ünvan</TableHead>
                    <TableHead>İlgili Kişi</TableHead>
                    <TableHead>İletişim</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {partners.map(partner => (
                   <TableRow key={partner.id}>
                      <TableCell className="font-bold">{partner.company_name}</TableCell>
                      <TableCell>
                         <div className="flex items-center gap-2 text-sm">
                            <User size={14} className="text-slate-400" />
                            {partner.contact_person || '-'}
                         </div>
                      </TableCell>
                      <TableCell>
                         <div className="flex flex-col gap-1">
                            {partner.phone && (
                               <div className="flex items-center gap-2 text-xs text-slate-600">
                                  <Phone size={12} /> {partner.phone}
                               </div>
                            )}
                            {partner.website && (
                               <div className="flex items-center gap-2 text-xs text-blue-600">
                                  <Globe size={12} /> <a href={partner.website} target="_blank" rel="noopener noreferrer" className="hover:underline">{partner.website}</a>
                               </div>
                            )}
                         </div>
                      </TableCell>
                      <TableCell className="text-right">
                         <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => { 
                               setEditingId(partner.id); 
                               setFormData({
                                  company_name: partner.company_name,
                                  contact_person: partner.contact_person || "",
                                  phone: partner.phone || "",
                                  website: partner.website || ""
                               }); 
                               setIsDialogOpen(true); 
                            }}>
                               <Edit size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(partner.id)}>
                               <Trash2 size={14} />
                            </Button>
                         </div>
                      </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           )}
        </CardContent>
      </Card>
    </div>
  );
}
