"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Basit Kargo resmî etiketi (SVG) — /api/admin/basitkargo { op: "label" } ile alınır, yazdırma penceresinde
// <img> olarak gösterilir (SVG içindeki betik <img>'de çalışmaz). Basıldığı kod siparişe yazılır (kod değişirse uyarı).
import { supabase } from "@/lib/supabase";

export async function printBasitLabel(orderId: string, code: string | null): Promise<{ ok: boolean; error?: string; printedAt?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/admin/basitkargo", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ op: "label", orderId }),
  });
  if (!r.ok) return { ok: false, error: (await r.json().catch(() => ({}))).error || `HTTP ${r.status}` };
  const svg = await r.text();
  const src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  const w = window.open("", "_blank");
  if (!w) return { ok: false, error: "Açılır pencere engellendi — tarayıcıda bu siteye izin ver." };
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Kargo etiketi</title><style>@page{margin:0}body{margin:0;display:flex;justify-content:center}img{max-width:100%;height:auto}</style></head><body><img src="${src}" alt="Kargo etiketi" onload="setTimeout(function(){window.print()},200)"></body></html>`);
  w.document.close();
  const printedAt = new Date().toISOString();
  if (code) await (supabase as any).from("orders").update({ label_printed_code: code, label_printed_at: printedAt }).eq("id", orderId);
  return { ok: true, printedAt };
}
