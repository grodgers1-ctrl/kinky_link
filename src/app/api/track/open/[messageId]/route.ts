import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

const TRANSPARENT_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params

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
        event_type: "open",
        metadata: { ip, userAgent },
      })
    }
  } catch {
    // Log error but still return pixel
  }

  return new NextResponse(TRANSPARENT_PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  })
}
