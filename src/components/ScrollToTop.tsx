"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Sayfa aşağı inince beliren yüzen "yukarı çık" butonu. Global (layout'ta).
 * Mobil öncelikli: dokunma hedefi büyük, sağ-alt köşede, sepet/alt bar ile
 * çakışmasın diye yeterli boşluk.
 */
export default function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Yukarı çık"
      className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full bg-olive-600 text-white shadow-xl shadow-olive-200/60 flex items-center justify-center hover:bg-olive-700 active:scale-90 transition-all animate-in fade-in zoom-in duration-200"
    >
      <ArrowUp size={22} />
    </button>
  );
}
