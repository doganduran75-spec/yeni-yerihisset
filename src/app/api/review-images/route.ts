/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { REVIEW_IMAGE_MAX_BYTES, REVIEW_IMAGES_PER_DAY, sniffImageType } from "@/lib/review-images";

// YORUM GÖRSELİ YÜKLEME (güvenlik 2026-11-16, MIG 20261191): Hesabım › Yorum yap görselleri buradan, TEK TEK yüklenir
// (proxy istek gövdesini 10 MB'a kadar tutar; tek görsel en çok 5 MB). Üye depoya doğrudan yazamaz.
//   POST multipart { file }  (Bearer oturum) → { url }  ·  dosya en çok 5 MB, gerçek görsel türü (ilk baytlar),
//   üye başına son 24 saatte en çok 20 görsel. Yorum başına en çok 5 görsel: order_reviews ekleme kuralı.
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Görsel bulunamadı" }, { status: 400 });
  if (file.size > REVIEW_IMAGE_MAX_BYTES) return NextResponse.json({ error: "Her görsel en çok 5 MB olabilir." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImageType(bytes);
  if (!kind) return NextResponse.json({ error: "Yalnız JPG, PNG, WEBP, AVIF ya da GIF görsel yükleyebilirsin." }, { status: 400 });

  const sb = createAdminClient() as any;
  const folder = `reviews/${user.id}`;
  const { data: existing } = await sb.storage.from("product-images").list(folder, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  const since = Date.now() - 24 * 3600_000;
  const today = ((existing as any[]) || []).filter((o) => o?.created_at && new Date(o.created_at).getTime() > since).length;
  if (today >= REVIEW_IMAGES_PER_DAY) {
    return NextResponse.json({ error: `Bugün için görsel yükleme sınırına ulaştın (${REVIEW_IMAGES_PER_DAY}). Yarın tekrar deneyebilirsin.` }, { status: 429 });
  }

  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${kind.ext}`;
  const { error } = await sb.storage.from("product-images").upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (error) {
    console.error("[review-images]", error.message);
    return NextResponse.json({ error: "Görsel yüklenemedi, lütfen tekrar dene." }, { status: 500 });
  }
  const { data: { publicUrl } } = sb.storage.from("product-images").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: publicUrl });
}
