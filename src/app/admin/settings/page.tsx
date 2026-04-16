"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Loader2, Save, Store, Globe, Mail, Server, BarChart3, Eye, EyeOff, ShoppingCart, Copy, Check, Layers, ShieldCheck, Tag, Bookmark, FolderSearch, Tags, Megaphone } from "lucide-react";
import VariantsTab from "@/components/admin/settings/VariantsTab";
import RolesTab from "@/components/admin/settings/RolesTab";
import BrandsTab from "@/components/admin/settings/BrandsTab";
import CategoriesTab from "@/components/admin/settings/CategoriesTab";
import KBCategoriesTab from "@/components/admin/settings/KBCategoriesTab";
import MemberTagsTab from "@/components/admin/settings/MemberTagsTab";
import PopupTab from "@/components/admin/settings/PopupTab";

type SettingsTab = "general" | "variants" | "roles" | "brands" | "categories" | "kb-categories" | "member-tags" | "popup";

type Settings = {
  id: string;
  store_name: string;
  store_logo_url: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  currency: string;
  // SMTP
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  smtp_from_name: string;
  smtp_from_email: string;
  // GA
  ga_measurement_id: string;
  // GMC
  gmc_merchant_id: string;
  gmc_target_country: string;
  gmc_content_language: string;
  gmc_feed_secret: string;
  gmc_product_condition: string;
  gmc_default_category: string;
  gmc_brand_default: string;
};

const DEFAULT_SETTINGS: Settings = {
  id: "",
  store_name: "",
  store_logo_url: "",
  contact_email: "",
  contact_phone: "",
  address: "",
  currency: "TRY",
  smtp_host: "",
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: "",
  smtp_password: "",
  smtp_from_name: "",
  smtp_from_email: "",
  ga_measurement_id: "",
  gmc_merchant_id: "",
  gmc_target_country: "TR",
  gmc_content_language: "tr",
  gmc_feed_secret: "",
  gmc_product_condition: "new",
  gmc_default_category: "",
  gmc_brand_default: "",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as SettingsTab) || "general";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const { data, error } = await supabase.from("settings").select("*").order("updated_at", { ascending: true }).limit(1);
      if (error) throw error;
      if (data && data.length > 0) setSettings({ ...DEFAULT_SETTINGS, ...data[0] } as Settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  }

  function set(fields: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...fields }));
  }

  async function handleSaveSettings(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    try {
      const payload = { ...settings, updated_at: new Date().toISOString() };
      // Mevcut kayıt varsa güncelle, yoksa oluştur
      const { error } = settings.id
        ? await supabase.from("settings").update(payload).eq("id", settings.id)
        : await supabase.from("settings").insert(payload);
      if (error) throw error;
      alert("Ayarlar başarıyla kaydedildi.");
      fetchSettings();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      alert("Hata: " + (error?.message || "Ayarlar kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "general",       label: "Genel Ayarlar",           icon: <Store size={16} /> },
    { id: "popup",         label: "Popup",                   icon: <Megaphone size={16} /> },
    { id: "brands",        label: "Markalar",                icon: <Tag size={16} /> },
    { id: "categories",    label: "Kategoriler",             icon: <Bookmark size={16} /> },
    { id: "kb-categories", label: "B. Bankası Kategorileri", icon: <FolderSearch size={16} /> },
    { id: "member-tags",   label: "Üye Etiketleri",          icon: <Tags size={16} /> },
    { id: "variants",      label: "Varyasyonlar",            icon: <Layers size={16} /> },
    { id: "roles",         label: "Roller",                  icon: <ShieldCheck size={16} /> },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Ayarlar</h2>
        <p className="text-muted-foreground">Mağaza yapılandırması, varyasyon grupları ve kullanıcı rolleri.</p>
      </div>

      {/* Sekme Navigasyonu */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => router.replace(`/admin/settings?tab=${tab.id}`)}
            className={[
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300",
            ].join(" ")}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "popup"          && <PopupTab />}
      {activeTab === "member-tags"   && <MemberTagsTab />}
      {activeTab === "brands"        && <BrandsTab />}
      {activeTab === "categories"    && <CategoriesTab />}
      {activeTab === "kb-categories" && <KBCategoriesTab />}
      {activeTab === "variants"      && <VariantsTab />}
      {activeTab === "roles"         && <RolesTab />}

      {/* Genel Ayarlar Sekmesi */}
      {activeTab === "general" && (
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Mağaza Bilgileri */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store size={20} className="text-blue-600" /> Mağaza Bilgileri
            </CardTitle>
            <CardDescription>Sitenizin logosu, ismi ve para birimi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Mağaza Adı</label>
                <Input
                  value={settings.store_name}
                  onChange={(e) => set({ store_name: e.target.value })}
                  placeholder="YeriHisset"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Para Birimi</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={settings.currency}
                  onChange={(e) => set({ currency: e.target.value })}
                >
                  <option value="TRY">Türk Lirası (₺)</option>
                  <option value="USD">Amerikan Doları ($)</option>
                  <option value="EUR">Euro (€)</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mağaza Logosu (URL)</label>
              <div className="flex gap-2">
                <Input
                  value={settings.store_logo_url}
                  onChange={(e) => set({ store_logo_url: e.target.value })}
                  placeholder="https://..."
                />
                <Button variant="outline" size="icon" type="button">
                  <Globe size={18} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* İletişim Bilgileri */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail size={20} className="text-blue-600" /> İletişim Bilgileri
            </CardTitle>
            <CardDescription>Müşterilerinizin size ulaşabileceği bilgiler.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">E-posta Adresi</label>
                <Input
                  type="email"
                  value={settings.contact_email}
                  onChange={(e) => set({ contact_email: e.target.value })}
                  placeholder="info@yerihisset.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Telefon Numarası</label>
                <Input
                  value={settings.contact_phone}
                  onChange={(e) => set({ contact_phone: e.target.value })}
                  placeholder="0 (212) ..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mağaza Adresi</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={settings.address || ""}
                onChange={(e) => set({ address: e.target.value })}
                placeholder="Mahalle, Sokak, No..."
              />
            </div>
          </CardContent>
        </Card>

        {/* SMTP Ayarları */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server size={20} className="text-blue-600" /> SMTP / Email Gönderim Ayarları
            </CardTitle>
            <CardDescription>
              Sipariş bildirim emaillerinin gönderileceği SMTP sunucu bilgileri.
              Örnek: smtp.gmail.com (port 587), mail.kurumdomain.com (port 465)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">SMTP Sunucu (Host)</label>
                <Input
                  value={settings.smtp_host}
                  onChange={(e) => set({ smtp_host: e.target.value })}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Port</label>
                  <Input
                    type="number"
                    value={settings.smtp_port}
                    onChange={(e) => set({ smtp_port: Number(e.target.value) })}
                    placeholder="587"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">SSL/TLS</label>
                  <div className="flex h-10 items-center">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={settings.smtp_secure}
                        onChange={(e) => set({ smtp_secure: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Güvenli
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Kullanıcı Adı (E-posta)</label>
                <Input
                  type="email"
                  value={settings.smtp_user}
                  onChange={(e) => set({ smtp_user: e.target.value })}
                  placeholder="bildirim@yerihisset.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Şifre / Uygulama Şifresi</label>
                <div className="relative">
                  <Input
                    type={showSmtpPass ? "text" : "password"}
                    value={settings.smtp_password}
                    onChange={(e) => set({ smtp_password: e.target.value })}
                    placeholder="••••••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPass(!showSmtpPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-700"
                  >
                    {showSmtpPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Gönderen Adı</label>
                <Input
                  value={settings.smtp_from_name}
                  onChange={(e) => set({ smtp_from_name: e.target.value })}
                  placeholder="YeriHisset"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Gönderen E-posta</label>
                <Input
                  type="email"
                  value={settings.smtp_from_email}
                  onChange={(e) => set({ smtp_from_email: e.target.value })}
                  placeholder="noreply@yerihisset.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Google Analytics */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 size={20} className="text-blue-600" /> Google Analytics
            </CardTitle>
            <CardDescription>
              Email içindeki linklere otomatik UTM parametreleri eklenir.
              GA4 Measurement ID girerseniz link takibi etkinleştirilir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">GA4 Measurement ID</label>
              <Input
                value={settings.ga_measurement_id}
                onChange={(e) => set({ ga_measurement_id: e.target.value })}
                placeholder="G-XXXXXXXXXX"
                className="max-w-sm"
              />
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border text-xs text-slate-600 space-y-1">
              <p><strong>Email linklerine eklenen UTM parametreleri:</strong></p>
              <code className="block">utm_source=email · utm_medium=transactional · utm_campaign=[tetikleyici]</code>
              <p className="text-muted-foreground">Örnek: <code>utm_campaign=order_shipped</code></p>
            </div>
          </CardContent>
        </Card>

        {/* Google Merchant Center */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart size={20} className="text-blue-600" /> Google Merchant Center
            </CardTitle>
            <CardDescription>
              Ürünlerinizi Google Shopping'de listelemek için GMC entegrasyon ayarları.
              Besleme URL'sini GMC'de "Veri Kaynakları &gt; Birincil Besleme" bölümüne girin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Feed URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Ürün Besleme URL'si (Feed)</label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 font-mono text-xs bg-slate-50 border rounded-md px-3 py-2.5 text-slate-600 truncate">
                  {`${process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com"}/feed/google-merchant`}
                  {settings.gmc_feed_secret ? `?secret=${settings.gmc_feed_secret}` : ""}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => {
                    const url = `${process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com"}/feed/google-merchant${settings.gmc_feed_secret ? `?secret=${settings.gmc_feed_secret}` : ""}`;
                    navigator.clipboard.writeText(url);
                    setCopiedFeed(true);
                    setTimeout(() => setCopiedFeed(false), 2000);
                  }}
                >
                  {copiedFeed ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  {copiedFeed ? "Kopyalandı" : "Kopyala"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Merchant Center ID</label>
                <Input
                  value={settings.gmc_merchant_id}
                  onChange={(e) => set({ gmc_merchant_id: e.target.value })}
                  placeholder="123456789"
                />
                <p className="text-xs text-muted-foreground">GMC Hesap Yönetimi &gt; Hesap Bilgileri'ndeki ID</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Feed Gizli Anahtarı (Opsiyonel)</label>
                <Input
                  value={settings.gmc_feed_secret}
                  onChange={(e) => set({ gmc_feed_secret: e.target.value })}
                  placeholder="gizli-anahtar-buraya"
                />
                <p className="text-xs text-muted-foreground">Besleme URL'sine ?secret= olarak eklenir</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Hedef Ülke</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={settings.gmc_target_country}
                  onChange={(e) => set({ gmc_target_country: e.target.value })}
                >
                  <option value="TR">Türkiye (TR)</option>
                  <option value="US">Amerika Birleşik Devletleri (US)</option>
                  <option value="DE">Almanya (DE)</option>
                  <option value="GB">Birleşik Krallık (GB)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">İçerik Dili</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={settings.gmc_content_language}
                  onChange={(e) => set({ gmc_content_language: e.target.value })}
                >
                  <option value="tr">Türkçe (tr)</option>
                  <option value="en">İngilizce (en)</option>
                  <option value="de">Almanca (de)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Varsayılan Ürün Durumu</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={settings.gmc_product_condition}
                  onChange={(e) => set({ gmc_product_condition: e.target.value })}
                >
                  <option value="new">Yeni (new)</option>
                  <option value="refurbished">Yenilenmiş (refurbished)</option>
                  <option value="used">İkinci El (used)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Varsayılan Marka</label>
                <Input
                  value={settings.gmc_brand_default}
                  onChange={(e) => set({ gmc_brand_default: e.target.value })}
                  placeholder="YeriHisset"
                />
                <p className="text-xs text-muted-foreground">Markası tanımsız ürünler için kullanılır</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Google Ürün Kategorisi (ID)</label>
                <Input
                  value={settings.gmc_default_category}
                  onChange={(e) => set({ gmc_default_category: e.target.value })}
                  placeholder="594 (Ev & Bahçe > Ev Dekoru)"
                />
                <p className="text-xs text-muted-foreground">
                  <a
                    href="https://www.google.com/basepages/producttype/taxonomy-with-ids.tr-TR.txt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    Google Taksonomi Listesi →
                  </a>
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800 space-y-2">
              <p className="font-semibold">GMC Bağlantı Adımları:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Merchant Center hesabı oluşturun: <strong>merchants.google.com</strong></li>
                <li>Mağaza URL'nizi doğrulayın (Search Console veya HTML etiketi ile)</li>
                <li>"Veri Kaynakları" &gt; "Birincil Besleme" &gt; "Zamanlanmış Alma" seçin</li>
                <li>Yukarıdaki besleme URL'sini yapıştırın, dili ve ülkeyi seçin</li>
                <li>Günlük güncelleme için saatleri ayarlayın</li>
                <li>Ürünlerin onaylanması 1-3 iş günü sürebilir</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="gap-2 px-8">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Değişiklikleri Kaydet
          </Button>
        </div>
      </form>
      )}
    </div>
  );
}
