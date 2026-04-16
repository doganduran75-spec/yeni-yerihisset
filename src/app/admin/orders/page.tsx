"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { Eye, MoreVertical, Loader2, Package, Truck, CheckCircle, XCircle, Clock, MapPin, Phone, Mail, Users, ShoppingBag } from "lucide-react";

type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  product_id: string;
  products: { title: string } | null;
};

type Order = {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  shipping_address: string;
  user_id: string;
  profiles: { 
    first_name: string; 
    last_name: string; 
    email: string;
    phone: string;
  } | null;
  order_items?: OrderItem[];
};

const statusColors: Record<string, string> = {
  pending: "bg-orange-50 text-orange-700 ring-orange-600/20",
  paid: "bg-blue-50 text-blue-700 ring-blue-600/20",
  shipped: "bg-purple-50 text-purple-700 ring-purple-600/20",
  delivered: "bg-green-50 text-green-700 ring-green-600/20",
  cancelled: "bg-red-50 text-red-700 ring-red-600/20",
};

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  paid: "Ödeme Alındı",
  shipped: "Kargolandı",
  delivered: "Teslim Edildi",
  cancelled: "İptal Edildi",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  // Details Modal State
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          profiles (
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Join fetch error details:", JSON.stringify(error));
        // Fallback: If join fails, fetch simple data
        const { data: simpleData, error: simpleError } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (simpleError) throw simpleError;
        setOrders(simpleData as any || []);
        return;
      }
      
      setOrders((data as any) || []);
    } catch (error) {
      console.error("Order fetch failed completely:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleViewDetails(order: Order) {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
    setItemsLoading(true);

    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          id,
          quantity,
          unit_price,
          product_id,
          products(title)
        `)
        .eq('order_id', order.id);

      if (error) throw error;
      setSelectedOrder(prev => prev ? { ...prev, order_items: data as any } : null);
    } catch (error) {
      console.error("Error fetching order items:", error);
    } finally {
      setItemsLoading(false);
    }
  }

  async function updateOrderStatus(id: string, newStatus: string) {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      // Duruma karşılık gelen bildirim tetikleyicisini belirle
      const triggerMap: Record<string, string> = {
        paid: 'order_paid',
        shipped: 'order_shipped',
        delivered: 'order_delivered',
        cancelled: 'order_cancelled',
      };
      const trigger = triggerMap[newStatus];

      if (trigger) {
        const order = orders.find(o => o.id === id);
        if (order?.user_id) {
          fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trigger, orderId: id, userId: order.user_id }),
          }).catch(err => console.warn('Bildirim gönderilemedi:', err));
        }
      }

      fetchOrders();
      if (selectedOrder?.id === id) {
        setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      alert("Sipariş durumu güncellenirken bir hata oluştu.");
    } finally {
      setUpdatingId(null);
    }
  }

  function StatusIcon({ status, className }: { status: string; className?: string }) {
    switch (status) {
      case 'pending': return <Clock className={className} size={14} />;
      case 'paid': return <Package className={className} size={14} />;
      case 'shipped': return <Truck className={className} size={14} />;
      case 'delivered': return <CheckCircle className={className} size={14} />;
      case 'cancelled': return <XCircle className={className} size={14} />;
      default: return <Clock className={className} size={14} />;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-3xl font-bold tracking-tight">Siparişler</h2>
           <p className="text-muted-foreground">Müşterilerinizin verdiği siparişleri yönetin.</p>
        </div>
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle>Sipariş Listesi</CardTitle>
          <CardDescription>Tüm siparişlerin güncel durumları ve detayları.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">
              <Loader2 className="mx-auto h-8 w-8 animate-spin mb-2" />
              Yükleniyor...
            </div>
          ) : orders.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg">
               Sistemde henüz sipariş bulunmuyor.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sipariş / Müşteri</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className="group hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] text-muted-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>
                        <span className="font-medium text-sm">
                          {order.profiles?.first_name} {order.profiles?.last_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString('tr-TR')}
                    </TableCell>
                    <TableCell className="font-semibold text-sm">
                      ₺{order.total_amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusColors[order.status] || statusColors.pending}`}>
                        <StatusIcon status={order.status} />
                        {statusLabels[order.status] || order.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 px-2 text-xs gap-1"
                          onClick={() => handleViewDetails(order)}
                        >
                          <Eye size={12} /> Detay
                        </Button>
                        {updatingId === order.id ? (
                           <Loader2 size={16} className="animate-spin text-muted-foreground self-center mx-2" />
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical size={16} />
                              </Button>
                            } />
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem className="gap-2 text-xs" onClick={() => updateOrderStatus(order.id, 'paid')}>
                                <Package size={14} className="text-blue-500" /> Ödeme Alındı
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-xs" onClick={() => updateOrderStatus(order.id, 'shipped')}>
                                <Truck size={14} className="text-purple-500" /> Kargolandı
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-xs" onClick={() => updateOrderStatus(order.id, 'delivered')}>
                                <CheckCircle size={14} className="text-green-500" /> Teslim Edildi
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-xs text-red-600" onClick={() => updateOrderStatus(order.id, 'cancelled')}>
                                <XCircle size={14} /> İptal Et
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Sipariş Detayı 
              <span className="text-sm font-mono font-normal text-muted-foreground">
                #{selectedOrder?.id.slice(0, 8).toUpperCase()}
              </span>
            </DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Users size={16} className="text-muted-foreground" /> Müşteri Bilgileri
                  </h4>
                  <div className="text-sm space-y-1 bg-muted/30 p-3 rounded-lg border border-muted">
                    <p className="font-medium underline-offset-4 decoration-dotted underline">
                      {selectedOrder.profiles?.first_name} {selectedOrder.profiles?.last_name}
                    </p>
                    <p className="text-muted-foreground flex items-center gap-2">
                       <Mail size={12} /> {selectedOrder.profiles?.email}
                    </p>
                    <p className="text-muted-foreground flex items-center gap-2">
                       <Phone size={12} /> {selectedOrder.profiles?.phone || "Telefon yok"}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <MapPin size={16} className="text-muted-foreground" /> Teslimat Adresi
                  </h4>
                  <div className="text-sm bg-muted/30 p-3 rounded-lg border border-muted h-full">
                    <p className="text-muted-foreground leading-relaxed">
                      {selectedOrder.shipping_address || "Adres bilgisi girilmemiş."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <ShoppingBag size={16} className="text-muted-foreground" /> Sipariş İçeriği
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="h-9">Ürün</TableHead>
                        <TableHead className="h-9 text-center">Adet</TableHead>
                        <TableHead className="h-9 text-right">Birim</TableHead>
                        <TableHead className="h-9 text-right">Toplam</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8">
                             <Loader2 size={16} className="animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : selectedOrder.order_items?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs font-medium">{item.products?.title}</TableCell>
                          <TableCell className="text-xs text-center">{item.quantity}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground">₺{item.unit_price.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right font-medium">₺{(item.unit_price * item.quantity).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="bg-muted/50 p-3 flex justify-between items-center border-t">
                     <span className="text-sm font-bold">Genel Toplam</span>
                     <span className="text-lg font-black text-blue-600">₺{selectedOrder.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <div className="space-y-1">
                   <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Mevcut Durum</p>
                   <p className="text-sm font-semibold flex items-center gap-2">
                     <StatusIcon status={selectedOrder.status} className="text-blue-600" />
                     {statusLabels[selectedOrder.status] || selectedOrder.status}
                   </p>
                </div>
                <div className="flex gap-2">
                   <Button 
                    variant="outline" 
                    size="sm" 
                    className="bg-white"
                    onClick={() => updateOrderStatus(selectedOrder.id, 'shipped')}
                    disabled={selectedOrder.status === 'shipped' || selectedOrder.status === 'delivered'}
                   >
                     Kargola
                   </Button>
                   <Button 
                    variant="default" 
                    size="sm"
                    onClick={() => updateOrderStatus(selectedOrder.id, 'delivered')}
                    disabled={selectedOrder.status === 'delivered'}
                   >
                     Teslim Et
                   </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
