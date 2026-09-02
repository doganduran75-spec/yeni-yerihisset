import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarGroupLabel } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, ShoppingBag, CreditCard, Settings, Users, ExternalLink, BookOpen, Handshake, MessagesSquare, Link2, Ticket, BellRing, FileEdit, Send, Gift, Star, Boxes } from "lucide-react";
import AdminGuard from "@/components/admin/AdminGuard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="h-16 flex items-center justify-between px-4 border-b">
          <div className="font-bold text-lg tracking-tight">Admin Panel</div>
          <Link 
            href="/" 
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-all group relative"
            title="Siteyi Görüntüle"
          >
            <ExternalLink size={18} />
            <span className="absolute -bottom-8 right-0 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
              Siteyi Görüntüle
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="py-1">
            <SidebarGroupLabel>Yönetim</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    render={<Link href="/admin"><LayoutDashboard size={18} className="mr-2" /> Dashboard</Link>} 
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/products"><ShoppingBag size={18} className="mr-2" /> Ürünler</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/stock"><Boxes size={18} className="mr-2" /> Stok Yönetimi</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/orders"><CreditCard size={18} className="mr-2" /> Siparişler</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/members"><Users size={18} className="mr-2" /> Üyeler</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/reviews"><Star size={18} className="mr-2" /> Yorumlar</Link>}
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="py-1">
            <SidebarGroupLabel>Tanımlar</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/partners"><Handshake size={18} className="mr-2" /> İş Ortakları</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/kb-articles"><BookOpen size={18} className="mr-2" /> Bilgi Bankası</Link>}
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="py-1">
            <SidebarGroupLabel>Müşteri İlişkileri</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/crm"><MessagesSquare size={18} className="mr-2" /> CRM Genel Bakış</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/crm/email-templates"><BookOpen size={18} className="mr-2" /> Email Şablonları</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/affiliates"><Link2 size={18} className="mr-2" /> Satış Ortaklığı</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/messages"><MessagesSquare size={18} className="mr-2" /> Mesajlar</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/coupons"><Ticket size={18} className="mr-2" /> Kuponlar &amp; Ödüller</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/crm/stock-notifications"><BellRing size={18} className="mr-2" /> Stok Bildirimleri</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/crm/bulk-email"><Send size={18} className="mr-2" /> Toplu Email</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/opportunities"><Gift size={18} className="mr-2" /> İş Ortağı Fırsatları</Link>}
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="py-1">
            <SidebarGroupLabel>Sistem</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/site-content"><FileEdit size={18} className="mr-2" /> Sayfa İçerikleri</Link>}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin/settings"><Settings size={18} className="mr-2" /> Ayarlar</Link>}
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="h-16 flex shrink-0 items-center justify-between px-6 bg-background border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 shadow-sm">
          <h1 className="font-semibold text-lg">Yönetim Paneli</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Admin User</span>
            <Avatar>
              <AvatarFallback>AU</AvatarFallback>
            </Avatar>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto bg-muted/20">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
    </AdminGuard>
  );
}
