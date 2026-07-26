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

  void supabaseAdmin.from("email_events").insert({
    message_id: messageId,
    event_type: "click",
    metadata: { ip, userAgent, destinationUrl: originalUrl },
  })

  return NextResponse.redirect(originalUrl, 302)
}
