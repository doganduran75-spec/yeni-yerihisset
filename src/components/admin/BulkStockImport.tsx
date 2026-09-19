"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { FileUp, Loader2 } from "lucide-react";

// Toplu stok/fiyat/barkod güncelleme. Excel/CSV yükle → SKU'ya göre eşleştir →
// stok/fiyat/barkod güncelle. Excel'e Aktar formatıyla uyumlu.
const norm = (s: any) => String(s ?? "").trim().toLocaleLowerCase("tr-TR");

export default function BulkStockImport({ onDone }: { onDone?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true); setMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      if (!grid.length) { setMsg("Dosya boş."); setBusy(false); return; }

      // Başlık satırını bul (SKU/Stok Kodu içeren)
      let headerIdx = grid.findIndex((row) => row.some((c) => ["sku", "stok kodu"].includes(norm(c))));
      if (headerIdx < 0) headerIdx = 0;
      const headers = grid[headerIdx].map(norm);
      const col = (names: string[]) => headers.findIndex((h) => names.includes(h));
      const iSku = col(["sku", "stok kodu"]);
      const iStock = col(["stok"]);
      const iPrice = col(["fiyat"]);
      const iBarcode = col(["barkod"]);
      if (iSku < 0) { setMsg("SKU / Stok Kodu sütunu bulunamadı."); setBusy(false); return; }

      const rows: any[] = [];
      for (let r = headerIdx + 1; r < grid.length; r++) {
        const row = grid[r];
        const sku = row[iSku];
        if (!sku || !String(sku).trim()) continue;
        const entry: any = { sku: String(sku).trim() };
        if (iStock >= 0 && row[iStock] !== undefined && row[iStock] !== "") entry.stock = Number(String(row[iStock]).replace(/[^\d.-]/g, ""));
        if (iPrice >= 0 && row[iPrice] !== undefined && row[iPrice] !== "") entry.price = Number(String(row[iPrice]).replace(/[^\d.,-]/g, "").replace(",", "."));
        if (iBarcode >= 0 && row[iBarcode] !== undefined && String(row[iBarcode]).trim() !== "") entry.barcode = String(row[iBarcode]).trim();
        rows.push(entry);
      }
      if (!rows.length) { setMsg("Güncellenecek satır bulunamadı."); setBusy(false); return; }

      if (!confirm(`${rows.length} satır bulundu. SKU eşleşen ürünlerin stok/fiyat/barkod bilgileri güncellenecek. Devam edilsin mi?`)) {
        setBusy(false); return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/stock/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ rows }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) { setMsg(d.error || "Güncelleme başarısız."); setBusy(false); return; }
      setMsg(`✓ ${d.updated} varyant güncellendi${d.notFound ? `, ${d.notFound} SKU bulunamadı` : ""}.`);
      onDone?.();
    } catch (e: any) {
      setMsg("Dosya okunamadı: " + (e?.message || e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <Button variant="outline" className="gap-2" disabled={busy} onClick={() => inputRef.current?.click()}
        title="Excel/CSV ile stok/fiyat/barkod toplu güncelle (SKU'ya göre)">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} Toplu Güncelle
      </Button>
      {msg && <span className={`text-[11px] font-medium ${msg.startsWith("✓") ? "text-green-600" : "text-amber-600"}`}>{msg}</span>}
    </div>
  );
}
