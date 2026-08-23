import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/** UTM parametreli link dönüşümü */
function addUtmLinks(html: string, campaign: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  let result = html.replace(/href="(https?:\/\/[^"]+)"/g, (_, url: string) => {
    const sep = url.includes("?") ? "&" : "?";
    return `href="${url}${sep}utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}"`;
  });
  result = result.replace(/href="(\/[^"]+)"/g, (_, path: string) => {
    const sep = path.includes("?") ? "&" : "?";
    return `href="${siteUrl}${path}${sep}utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}"`;
  });
  return result;
}

export async function POST(req: NextRequest) {
  // Auth
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = await req.json() as {
    campaign: string;
    subject: string;
    html_body: string;
    recipient_type: "all" | "tag" | "manual";
    tag_option_id?: string;
    emails?: string[];
  };

  const { campaign, subject, html_body, recipient_type, tag_option_id, emails } = body;
  if (!campaign || !subject || !html_body) {
    return NextResponse.json({ error: "campaign, subject ve html_body zorunlu" }, { status: 400 });
  }

  // Settings
  const { data: settings } = await (supabase as any).from("settings").select("*").limit(1).single() as { data: any };
  if (!settings?.smtp_host) {
    return NextResponse.json({ error: "SMTP ayarları yapılandırılmamış" }, { status: 500 });
  }

  const storeName: string = settings.store_name || "YeriHisset";
  const fromEmail: string = settings.smtp_from_email || settings.smtp_from || settings.smtp_user || "";

  // Alıcı listesi
  let recipientEmails: string[] = [];
  if (recipient_type === "manual" && emails?.length) {
    recipientEmails = emails.filter((e) => e.includes("@"));
  } else if (recipient_type === "tag" && tag_option_id) {
    const { data: userTags } = await (supabase as any)
      .from("user_tags").select("user_id").eq("tag_option_id", tag_option_id);
    const ids = (userTags || []).map((t: any) => t.user_id);
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("email").in("id", ids);
      recipientEmails = (profiles || []).map((p: any) => p.email).filter(Boolean);
    }
  } else {
    const { data: profiles } = await supabase.from("profiles").select("email").not("email", "is", null);
    recipientEmails = (profiles || []).map((p: any) => p.email).filter(Boolean);
  }

  if (!recipientEmails.length) {
    return NextResponse.json({ error: "Alıcı bulunamadı" }, { status: 400 });
  }

  // UTM eklenmiş HTML hazırla
  const utmHtml = addUtmLinks(html_body, campaign);

  // Kampanya kaydı oluştur
  const { data: campaignRecord, error: campErr } = await (supabase as any)
    .from("email_campaigns")
    .insert({
      campaign_slug: campaign,
      subject,
      html_body: utmHtml,
      recipient_count: recipientEmails.length,
      recipient_type,
      status: "queued",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (campErr || !campaignRecord) {
    return NextResponse.json({ error: "Kampanya kaydı oluşturulamadı" }, { status: 500 });
  }

  // Kuyruğa ekle
  const queueRows = recipientEmails.map((email) => ({
    campaign_id: campaignRecord.id,
    recipient_email: email,
    subject,
    html_body: utmHtml,
    from_name: storeName,
    from_email: fromEmail,
    status: "pending",
  }));

  await (supabase as any).from("email_queue").insert(queueRows);

  return NextResponse.json({
    ok: true,
    campaignId: campaignRecord.id,
    total: recipientEmails.length,
  });
}
