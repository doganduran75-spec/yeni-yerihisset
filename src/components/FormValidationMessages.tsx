"use client";

import { useEffect } from "react";

// Tarayıcının varsayılan (İngilizce) form-doğrulama baloncuklarını site
// genelinde Türkçeleştirir: "Please fill out this field" vb. Kök layout'a bir
// kez mount edilir; belge düzeyinde `invalid` olayını CAPTURE aşamasında
// dinleyerek her form alanına (input/textarea/select/checkbox) uygulanır.
//
// Yalnızca NATIVE (tarayıcı) hatalarını çevirir. Uygulamanın kendi
// setCustomValidity(...) mesajlarını (ör. "Şifreler eşleşmiyor") ezmez.
// Mesajı biz koyduysak, kullanıcı düzenlemeye başlayınca temizleriz — böylece
// alan düzeltilince eski uyarı kalıcı olmaz.

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function turkishMessage(el: Field): string {
  const v = el.validity;
  const type = (el as HTMLInputElement).type;

  if (v.valueMissing) {
    if (el instanceof HTMLSelectElement) return "Lütfen listeden bir seçim yapın.";
    if (type === "checkbox" || type === "radio") return "Lütfen bu kutuyu işaretleyin.";
    if (type === "file") return "Lütfen bir dosya seçin.";
    return "Lütfen bu alanı doldurun.";
  }
  if (v.typeMismatch) {
    if (type === "email") return "Lütfen geçerli bir e-posta adresi girin.";
    if (type === "url") return "Lütfen geçerli bir URL girin.";
    return "Lütfen istenen biçimde bir değer girin.";
  }
  if (v.tooShort) {
    const min = (el as HTMLInputElement).minLength;
    return `Bu alan en az ${min} karakter olmalı.`;
  }
  if (v.tooLong) {
    const max = (el as HTMLInputElement).maxLength;
    return `Bu alan en fazla ${max} karakter olabilir.`;
  }
  if (v.rangeUnderflow) return `Değer ${(el as HTMLInputElement).min} veya daha büyük olmalı.`;
  if (v.rangeOverflow) return `Değer ${(el as HTMLInputElement).max} veya daha küçük olmalı.`;
  if (v.stepMismatch) return "Lütfen geçerli bir değer girin.";
  if (v.patternMismatch) return "Lütfen istenen biçimde bir değer girin.";
  if (v.badInput) return "Lütfen geçerli bir değer girin.";
  return "";
}

export default function FormValidationMessages() {
  useEffect(() => {
    // Mesajı bizim koyduğumuz alanları izle (uygulamanınkini ezmeyelim/temizlemeyelim)
    const ours = new WeakSet<Field>();

    function hasNativeError(el: Field): boolean {
      const v = el.validity;
      return v.valueMissing || v.typeMismatch || v.tooShort || v.tooLong ||
        v.rangeUnderflow || v.rangeOverflow || v.stepMismatch ||
        v.patternMismatch || v.badInput;
    }

    function onInvalid(e: Event) {
      const el = e.target as Field | null;
      if (!el || typeof (el as any).setCustomValidity !== "function") return;
      // Sadece uygulamanın koyduğu özel mesaj varsa (customError, native hata yok) dokunma.
      if (el.validity.customError && !hasNativeError(el)) return;
      el.setCustomValidity(turkishMessage(el));
      ours.add(el);
    }

    function onEdit(e: Event) {
      const el = e.target as Field | null;
      if (el && ours.has(el)) {
        el.setCustomValidity("");
        ours.delete(el);
      }
    }

    document.addEventListener("invalid", onInvalid, true); // capture: submit'te tüm alanlar
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
    };
  }, []);

  return null;
}
