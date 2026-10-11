// ŞİRKET KÜNYESİ — VARSAYILANLAR. Asıl değerler Ayarlar › Sayfalar › Şirket künyesi (settings) — src/lib/static-pages.ts getCompany().
// Kaynak: eski sitenin İletişim sayfası (yerihisset.com/iletisim, 2026-10-11). Boş (null) alanlar sayfada
// "(eklenecek)" görünür → canlıya geçmeden doldurulmalı (docs/HUKUKI-METINLER-NOTLAR.md).
export const COMPANY = {
  brand: "YeriHisset",
  title: "Kromozom Dış Ticaret Ltd. Şti.",
  address: "Barbaros Mah. Begonya Sok. No:1/2 Nida Kule Batı, Ataşehir / İstanbul",
  taxOffice: "Kozyatağı",
  taxNumber: "590 110 85 31",
  mersis: null as string | null,   // MERSİS numarası
  kep: null as string | null,      // KEP adresi (…@hs01.kep.tr)
  phone: null as string | null,    // müşteri hizmetleri telefonu
  email: "info@yerihisset.com",
  website: "https://www.yerihisset.com",
  hours: "Hafta içi 09:00 – 18:00",
  hosting: "Contabo GmbH (sunucu: Fransa)",
  // Kayıt tarihleri: metin değişince güncelle
  legalUpdated: "11 Ekim 2026",
};

