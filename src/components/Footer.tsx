"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Footer() {
  return (
    <footer className="py-24 border-t bg-[#F8FAFC]">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-16">
        <div className="space-y-8">
          <Link href="/" className="text-3xl font-black tracking-tighter text-blue-600">
            Yeri<span className="text-slate-900">Hisset</span>
          </Link>
          <p className="text-sm font-medium text-slate-500 leading-bold">
            Yaşam alanlarınıza değer katacak tasarımlar. Modern, estetik ve işlevsel ev dekorasyonunun öncüsü. 2026 Trendleriyle evinize ruh katıyoruz.
          </p>
          <div className="flex gap-4">
             {/* Social placeholders - in a real app these would be icons */}
             <div className="w-10 h-10 rounded-xl bg-slate-200 hover:bg-blue-600 hover:text-white transition-all cursor-pointer flex items-center justify-center font-black italic">f</div>
             <div className="w-10 h-10 rounded-xl bg-slate-200 hover:bg-blue-600 hover:text-white transition-all cursor-pointer flex items-center justify-center font-black italic">ig</div>
             <div className="w-10 h-10 rounded-xl bg-slate-200 hover:bg-blue-600 hover:text-white transition-all cursor-pointer flex items-center justify-center font-black italic">x</div>
          </div>
        </div>
        
        <div className="space-y-8">
          <h5 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900">Kurumsal</h5>
          <ul className="space-y-4 text-sm font-bold text-slate-500 italic">
            <li><Link href="#" className="hover:text-blue-600 transition-colors uppercase">Hakkımızda</Link></li>
            <li><Link href="#" className="hover:text-blue-600 transition-colors uppercase">İletişim</Link></li>
            <li><Link href="#" className="hover:text-blue-600 transition-colors uppercase">Kariyer</Link></li>
            <li><Link href="#" className="hover:text-blue-600 transition-colors uppercase">Mağazalarımız</Link></li>
          </ul>
        </div>
        
        <div className="space-y-8">
          <h5 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900">Yardım & Destek</h5>
          <ul className="space-y-4 text-sm font-bold text-slate-500 italic">
            <li><Link href="#" className="hover:text-blue-600 transition-colors uppercase">Sipariş Takibi</Link></li>
            <li><Link href="#" className="hover:text-blue-600 transition-colors uppercase">İade ve Değişim</Link></li>
            <li><Link href="#" className="hover:text-blue-600 transition-colors uppercase">Kargo Bilgileri</Link></li>
            <li><Link href="#" className="hover:text-blue-600 transition-colors uppercase">Sıkça Sorulan Sorular</Link></li>
          </ul>
        </div>
        
        <div className="space-y-8">
          <h5 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900">Haber Bülteni</h5>
          <p className="text-sm font-medium text-slate-500 italic leading-relaxed">Yeni koleksiyonlar ve özel indirimlerden ilk siz haberdar olun.</p>
          <div className="flex flex-col gap-3">
            <Input placeholder="E-posta adresiniz" className="h-14 rounded-2xl bg-white border-slate-200 font-bold italic" />
            <Button className="h-14 rounded-2xl bg-slate-900 hover:bg-blue-600 text-white font-black tracking-widest uppercase transition-all shadow-xl shadow-slate-100">ABONE OL</Button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 mt-24 pt-12 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-8">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
          © {new Date().getFullYear()} YeriHisset. TÜM HAKLARI SAKLIDIR.
        </p>
        <div className="flex gap-8 text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
           <Link href="#" className="hover:text-slate-900 transition-colors">KVKK</Link>
           <Link href="#" className="hover:text-slate-900 transition-colors">Çerez Politikası</Link>
           <Link href="#" className="hover:text-slate-900 transition-colors">Mesafeli Satış</Link>
        </div>
      </div>
    </footer>
  );
}
