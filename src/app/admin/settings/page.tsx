"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Loader2, Save, Store, Globe, Mail, Server, BarChart3, Eye, EyeOff, ShoppingCart, Copy, Check, Layers, ShieldCheck, Tag, Bookmark, FolderSearch, Tags, Megaphone, Truck, CreditCard, Landmark, MessageSquare, Plug } from "lucide-react";
import VariantsTab from "@/components/admin/settings/VariantsTab";
import RolesTab from "@/components/admin/settings/RolesTab";
import BrandsTab from "@/components/admin/settings/BrandsTab";
import CategoriesTab from "@/components/admin/settings/CategoriesTab";
import KBCategoriesTab from "@/components/admin/settings/KBCategoriesTab";
import MemberTagsTab from "@/components/admin/settings/MemberTagsTab";
import PopupTab from "@/components/admin/settings/PopupTab";
import EmailTemplatesTab from "@/components/admin/settings/EmailTemplatesTab";
import IntegrationsTab from "@/components/admin/settings/IntegrationsTab";
import ShippingMethodsManager from "@/components/admin/ShippingMethodsManager";
import IntroVideoUpload from "@/components/admin/settings/IntroVideoUpload";
import { siteAlert } from "@/components/ui/site-dialog";

type SettingsTab = "general" | "variants" | "roles" | "brands" | "categories" | "kb-categories" | "member-tags" | "popup" | "email-templates" | "integrations";

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
  // E-posta kilidi (canlıya geçene kadar)
  email_lock_enabled: boolean;
  email_allowlist: string;
  // Ödeme
  bank_transfer_enabled: boolean;
  bank_transfer_info: string;
  // Kargonomi
  kargonomi_api_token: string;
  kargonomi_warehouse_id: string;
  // GA
  ga_measurement_id: string;
  // Mobil karşılama videosu
  intro_video_enabled: boolean;
  intro_video_url: string;
  // Meta (Instagram / Facebook reklamları)
  meta_pixel_id: string;
  meta_domain_verification: string;
  meta_capi_token: string;
  meta_test_event_code: string;
  // GMC
  gmc_merchant_id: string;
  gmc_target_country: string;
  gmc_content_language: string;
  gmc_feed_secret: string;
  gmc_product_condition: string;
  gmc_default_category: string;
  gmc_brand_default: string;
  // Yorumlar
  product_reviews_show_all: boolean;
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
  email_lock_enabled: true,
  email_allowlist: "",
  bank_transfer_enabled: false,
  bank_transfer_info: "",
  kargonomi_api_token: "",
  kargonomi_warehouse_id: "",
  ga_measurement_id: "",
  intro_video_enabled: true,
  intro_video_url: "/intro/intro.mp4",
  meta_pixel_id: "",
  meta_domain_verification: "",
  meta_capi_token: "",
  meta_test_event_code: "",
  gmc_merchant_id: "",
  gmc_target_country: "TR",
  gmc_content_language: "tr",
  gmc_feed_secret: "",
  gmc_product_condition: "new",
  gmc_default_category: "",
  gmc_brand_default: "",
  product_reviews_show_all: true,
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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }

  async function fetchSettings() {
    setLoadError(null);
    try {
      // Gizli alanlar (SMTP şifresi vb.) tarayıcıdan okunamaz → admin API'si
      const res = await fetch("/api/admin/settings", { headers: await authHeaders(), cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Ayarlar okunamadı");
      if (d.settings) setSettings({ ...DEFAULT_SETTINGS, ...d.settings } as Settings);
    } catch (error: any) {
      console.error("Error fetching settings:", error);
      // Yüklenemediyse kaydetmeye izin verme — boş formla mevcut ayarların üstüne yazılmasın
      setLoadError(error?.message || "Ayarlar okunamadı");
    } finally {
      setLoading(false);
    }
  }

  function set(fields: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...fields }));
  }

  async function handleSaveSettings(e?: React.FormEvent) {
    e?.preventDefault();
    if (loadError) {
      siteAlert({ title: "Ayarlar yüklenemedi", message: "Mevcut ayarlar okunamadığı için kayıt yapılmadı (boş form mevcut ayarların üstüne yazmasın). Sayfayı yenileyip (Ctrl+Shift+R) tekrar dene.", tone: "danger" });
      return;
    }
    setSaving(true);
    try {
      // Kaydetme sunucuda: güncellenecek satırı sunucu bulur (istemci id'sine güvenilmez)
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        // Entegrasyon alanları (Trendyol/Hepsiburada/Kargonomi) Entegrasyonlar sekmesinde kaydedilir → burada gönderme
        body: JSON.stringify({ settings: Object.fromEntries(Object.entries(settings).filter(([k]) => !/^(trendyol_|hepsiburada_|amazon_|kargonomi_)/.test(k))) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error || "Ayarlar kaydedilemedi.");
      siteAlert({ message: "Ayarlar başarıyla kaydedildi.", tone: "success" });
      fetchSettings();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      siteAlert({ title: "Kaydedilemedi", message: error?.message || "Ayarlar kaydedilemedi.", tone: "danger" });
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
    { id: "integrations",  label: "Entegrasyonlar",          icon: <Plug size={16} /> },
    { id: "email-templates", label: "E-posta Şablonları",    icon: <Mail size={16} /> },
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

      {/* Sekme Navigasyonu — sığmayan sekmeler alt satıra iner (yatay kaydırma yok) */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border bg-muted/40 p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => router.replace(`/admin/settings?tab=${tab.id}`)}
            className={[
              "flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                : "text-muted-foreground hover:text-foreground hover:bg-white/60",
            ].join(" ")}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "integrations"   && <IntegrationsTab />}
      {activeTab === "email-templates" && <EmailTemplatesTab />}
      {activeTab === "popup"          && <PopupTab />}
      {activeTab === "member-tags"   && <MemberTagsTab />}
      {activeTab === "brands"        && <BrandsTab />}
      {activeTab === "categories"    && <CategoriesTab />}
      {activeTab === "kb-categories" && <KBCategoriesTab />}
      {activeTab === "variants"      && <VariantsTab />}
      {activeTab === "roles"         && <RolesTab />}

      {/* Genel Ayarlar Sekmesi */}
      {activeTab === "general" && loadError && (
        <div className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <b>Ayarlar yüklenemedi:</b> {loadError}. Kaydetme kapalı — sayfayı yenile (Ctrl+Shift+R). Sorun sürerse çıkış yapıp tekrar giriş yap.
        </div>
      )}

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

        {/* Yorumlar */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare size={20} className="text-blue-600" /> Yorumlar
            </CardTitle>
            <CardDescription>Ürün sayfasında müşteri yorumlarının nasıl gösterileceği.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-xl border border-muted">
              <div className="pr-4">
                <p className="font-medium text-sm">Tüm yorumları her üründe göster</p>
                <p className="text-xs text-muted-foreground">
                  Açık: onaylı tüm yorumlar her ürün sayfasında görünür (yorum azken önerilir).
                  Kapalı: her ürün yalnızca kendi yorumlarını gösterir.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.product_reviews_show_all}
                  onChange={(e) => set({ product_reviews_show_all: e.target.checked })}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-2 text-xs font-semibold text-muted-foreground">
                  {settings.product_reviews_show_all ? "Tümü" : "Ürüne özel"}
                </span>
              </label>
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
        <Card className={`shadow-sm ${settings.email_lock_enabled ? "border-amber-300 bg-amber-50/40" : "border-muted"}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-amber-600" /> E-posta Kilidi
            </CardTitle>
            <CardDescription>
              Canlıya geçene kadar AÇIK kalmalı: e-postalar yalnız yöneticilere ve aşağıdaki izinli adreslere gider.
              Aktarılan gerçek müşterilere testlerden yanlışlıkla e-posta gitmez; engellenen gönderim bildirim kayıtlarında
              &quot;failed — E-posta kilidi&quot; olarak görünür. Canlıya geçiş günü kapatılır.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.email_lock_enabled}
                onChange={(e) => set({ email_lock_enabled: e.target.checked })}
                className="h-4 w-4 accent-amber-600"
              />
              <span className="text-sm font-semibold">
                {settings.email_lock_enabled ? "Kilit açık — yalnız izinli adreslere gönderilir" : "Kilit kapalı — tüm müşterilere gönderilir (canlı)"}
              </span>
            </label>
            <div className="space-y-2">
              <label className="text-sm font-medium">İzinli adresler (yöneticiler zaten izinli)</label>
              <textarea
                value={settings.email_allowlist}
                onChange={(e) => set({ email_allowlist: e.target.value })}
                rows={3}
                placeholder={"test1@gmail.com\ntest2@gmail.com"}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">Her satıra bir e-posta (virgülle de ayırabilirsin). Testte kullandığın hesapları buraya yaz.</p>
            </div>
          </CardContent>
        </Card>

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

        {/* Mobil karşılama videosu */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 size={20} className="text-olive-600" /> Mobil karşılama videosu</CardTitle>
            <CardDescription>
              Telefonda ana sayfaya ilk girişte bir kez tam ekran oynar, bitince ana sayfaya döner. Sayfa önce açılır;
              video arka planda yüklenir, birkaç saniyede hazır olmazsa hiç gösterilmez. Dikey, sessiz, 5–10 sn, tercihen 3 MB altı mp4.
              “Video yükle” ile seçtiğin video hemen yayına girer (Kaydet’e ve deploy’a gerek yok).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={!!settings.intro_video_enabled} onChange={(e) => set({ intro_video_enabled: e.target.checked })} /> Karşılama videosunu göster
            </label>
            <IntroVideoUpload currentUrl={settings.intro_video_url || ""} onUploaded={(url) => set({ intro_video_url: url, intro_video_enabled: true })} />
            <div className="space-y-1">
              <label className="text-sm font-medium">Video adresi</label>
              <Input value={settings.intro_video_url || ""} onChange={(e) => set({ intro_video_url: e.target.value.trim() })} placeholder="/intro/intro.mp4 ya da https://…/video.mp4" />
              <p className="text-xs text-muted-foreground">Kendi telefonunda tekrar görmek için ana sayfa adresinin sonuna <code>?intro=1</code> ekle.</p>
            </div>
          </CardContent>
        </Card>

        {/* Meta (Instagram / Facebook) reklamları */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 size={20} className="text-indigo-600" /> Meta (Instagram / Facebook) Reklamları
            </CardTitle>
            <CardDescription>
              Katalog reklamları (“Şimdi Alışveriş Yap”) için Pixel ve Conversions API. Pixel yalnız ziyaretçi
              çerezlere “Kabul Et” derse yüklenir; satın alma sunucudan da bildirilir (aynı satış iki kez sayılmaz).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Katalog besleme adresi (Commerce Manager › Veri kaynakları)</label>
              <div className="font-mono text-xs bg-slate-50 border rounded-md px-3 py-2.5 text-slate-600 break-all">
                {`${process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com"}/feed/meta`}
                {settings.gmc_feed_secret ? `?secret=${settings.gmc_feed_secret}` : ""}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Pixel ID (Veri kümesi kimliği)</label>
                <Input value={settings.meta_pixel_id || ""} onChange={(e) => set({ meta_pixel_id: e.target.value.replace(/\D/g, "") })} placeholder="123456789012345" />
                <p className="text-xs text-muted-foreground">Events Manager › Veri kaynakları › Pixel</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Alan adı doğrulama kodu</label>
                <Input value={settings.meta_domain_verification || ""} onChange={(e) => set({ meta_domain_verification: e.target.value.replace(/.*content="([^"]+)".*/, "$1").trim() })} placeholder="abc123xyz..." />
                <p className="text-xs text-muted-foreground">Business ayarları › Alan adları › Meta etiketi (yalnız content değeri ya da etiketin tamamı)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Conversions API erişim anahtarı</label>
                <Input type="password" autoComplete="off" value={settings.meta_capi_token || ""} onChange={(e) => set({ meta_capi_token: e.target.value.trim() })} placeholder="EAAG..." />
                <p className="text-xs text-muted-foreground">Events Manager › Pixel › Ayarlar › Conversions API › Erişim anahtarı oluştur. Gizli tutulur.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Test olay kodu (opsiyonel)</label>
                <Input value={settings.meta_test_event_code || ""} onChange={(e) => set({ meta_test_event_code: e.target.value.trim() })} placeholder="TEST12345" />
                <p className="text-xs text-muted-foreground">Doluyken satışlar Events Manager › “Test olayları”nda görünür, reklamlara sayılmaz. Denemeden sonra BOŞALT.</p>
              </div>
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

        {/* ─── Ödeme Yöntemleri ─── */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard size={20} className="text-blue-600" /> Ödeme Yöntemleri
            </CardTitle>
            <CardDescription>
              Ödeme sayfasında müşterilere sunulacak ödeme seçeneklerini yapılandırın.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Havale / EFT */}
            <div className="border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4 bg-slate-50 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white border rounded-lg flex items-center justify-center">
                    <Landmark size={18} className="text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Havale / EFT</p>
                    <p className="text-xs text-muted-foreground">Banka havalesi ile ödeme</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.bank_transfer_enabled}
                    onChange={(e) => set({ bank_transfer_enabled: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-2 text-xs font-semibold text-muted-foreground">
                    {settings.bank_transfer_enabled ? "Aktif" : "Pasif"}
                  </span>
                </label>
              </div>
              {settings.bank_transfer_enabled && (
                <div className="p-4 space-y-2">
                  <label className="text-sm font-medium">
                    Banka Bilgileri <span className="text-muted-foreground font-normal">(ödeme sayfasında ve sipariş e-postasında gösterilir)</span>
                  </label>
                  <textarea
                    rows={6}
                    className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                    value={settings.bank_transfer_info}
                    onChange={(e) => set({ bank_transfer_info: e.target.value })}
                    placeholder={`Banka Adı: Ziraat Bankası
Hesap Adı: YeriHisset Tic. Ltd. Şti.
IBAN: TR00 0000 0000 0000 0000 0000 00
Açıklama: Sipariş numaranızı açıklamaya yazmayı unutmayın.`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Havale/EFT ile sipariş veren müşteriler bu bilgileri ödeme sayfasında görecek ve sipariş onay e-postasında alacaklar.
                  </p>
                </div>
              )}
            </div>

            {/* Kredi Kartı */}
            <div className="border rounded-xl overflow-hidden opacity-60">
              <div className="flex items-center justify-between p-4 bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white border rounded-lg flex items-center justify-center">
                    <CreditCard size={18} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Kredi / Banka Kartı</p>
                    <p className="text-xs text-muted-foreground">Sanal POS entegrasyonu</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-400 px-3 py-1 rounded-full">
                  Yakında
                </span>
              </div>
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

      {activeTab === "general" && (
        <div className="mt-6"><ShippingMethodsManager /></div>
      )}
    </div>
  );
}
