import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params
  const { searchParams } = new URL(req.url)
  const destinationUrl = searchParams.get("url")

  if (!destinationUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
  }

  const originalUrl = decodeURIComponent(destinationUrl)
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
  const userAgent = req.headers.get("user-agent") || "unknown"

  try {
    const { data: sentEvent } = await supabaseAdmin
      .from("email_events")
      .select("user_id, campaign_id, prospect_id, sequence_id")
      .eq("message_id", messageId)
      .eq("event_type", "sent")
      .single()

    if (sentEvent) {
      await supabaseAdmin.from("email_events").insert({
        user_id: sentEvent.user_id,
        message_id: messageId,
        campaign_id: sentEvent.campaign_id,
        prospect_id: sentEvent.prospect_id,
        sequence_id: sentEvent.sequence_id,
        event_type: "click",
        metadata: { ip, userAgent, destinationUrl: originalUrl },
      })
    }
  } catch {
    // Log error but still redirect
  }

  return NextResponse.redirect(originalUrl, 302)
}
