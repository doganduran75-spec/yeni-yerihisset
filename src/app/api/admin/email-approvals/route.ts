import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { approveAndSend, discard, unapproveKind, kindLabel, TEMPLATE_EDITABLE } from "@/lib/email-approval";
import { resetMailGuardCache } from "@/lib/mail-guard";

/* eslint-disable @typescript-eslint/no-explicit-any */

// E-POSTA ONAYI (kullanıcı 2026-11-15) — yalnız yönetici. Kural: src/lib/mail-guard.ts + src/lib/email-approval.ts.
//   GET                → bekleyenler + son kararlar + onaylı türler + açık/kapalı
//   GET ?id=…          → tek e-postanın içeriği (önizleme)
//   POST { op: "send", id } · { op: "discard", id } · { op: "unapprove", kind } · { op: "enabled", value }
async function admin(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return { res: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { res: NextResponse.json({ error: "Yetkisiz" }, { status: 403 }) };
  return { sb, user };
}

export async function GET(req: NextRequest) {
  const a = await admin(req);
  if ("res" in a) return a.res;
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const { data } = await a.sb.from("email_approvals").select("id, kind, recipient, subject, html, status, payload").eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    const atts = ((data.payload?.attachments as any[]) || []).map((x) => x.filename);
    return NextResponse.json({ id: data.id, kind: data.kind, label: kindLabel(data.kind), recipient: data.recipient, subject: data.subject, html: data.html, status: data.status, attachments: atts });
  }
  const [pend, done, kinds, st] = await Promise.all([
    a.sb.from("email_approvals").select("id, created_at, kind, recipient, subject").eq("status", "pending").order("created_at", { ascending: true }).limit(200),
    a.sb.from("email_approvals").select("id, created_at, kind, recipient, subject, status, decided_at, error").neq("status", "pending").order("decided_at", { ascending: false }).limit(30),
    a.sb.from("email_approved_kinds").select("kind, approved_at").order("approved_at", { ascending: false }),
    a.sb.from("settings").select("email_approval_enabled, email_lock_enabled").limit(1).maybeSingle(),
  ]);
  const withLabel = (r: any) => ({ ...r, label: kindLabel(r.kind), editable: TEMPLATE_EDITABLE.has(r.kind) });
  return NextResponse.json({
    enabled: st.data?.email_approval_enabled === true, locked: st.data?.email_lock_enabled !== false,
    pending: ((pend.data as any[]) || []).map(withLabel), recent: ((done.data as any[]) || []).map(withLabel), approved: ((kinds.data as any[]) || []).map(withLabel),
  });
}

export async function POST(req: NextRequest) {
  const a = await admin(req);
  if ("res" in a) return a.res;
  const body = await req.json().catch(() => ({}));
  let r: any;
  if (body.op === "send") r = await approveAndSend(String(body.id || ""), a.user.id, a.sb);
  else if (body.op === "discard") r = await discard(String(body.id || ""), a.user.id, a.sb);
  else if (body.op === "unapprove") r = await unapproveKind(String(body.kind || ""), a.sb);
  else if (body.op === "enabled") {
    const { error } = await a.sb.from("settings").update({ email_approval_enabled: body.value === true }).not("id", "is", null);
    resetMailGuardCache();
    r = error ? { error: error.message } : { ok: true };
  } else return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  return r.error ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
}
