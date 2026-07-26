import { auth } from "@/lib/auth"
import { sendGmailEmail, injectTrackedLinks, injectTrackingPixel } from "@/lib/email"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

const BASE_URL = process.env.AUTH_URL || "http://localhost:3000"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { to, subject, bodyHtml, bodyText, prospectId, campaignId } = body

    if (!to || !subject || !bodyHtml) {
      return NextResponse.json({ error: "Missing required fields: to, subject, bodyHtml" }, { status: 400 })
    }

    const messageRef = crypto.randomUUID()

    const htmlWithLinks = injectTrackedLinks(bodyHtml, messageRef, BASE_URL)
    const htmlWithPixel = injectTrackingPixel(htmlWithLinks, messageRef, BASE_URL)

    const result = await sendGmailEmail({
      to,
      subject,
      bodyHtml: htmlWithPixel,
      bodyText: bodyText || "",
      accessToken: session.accessToken,
      refreshToken: session.refreshToken || "",
    })

    await supabaseAdmin.from("email_events").insert({
      user_id: session.user.id,
      message_id: messageRef,
      gmail_message_id: result.id,
      prospect_id: prospectId || null,
      campaign_id: campaignId || null,
      event_type: "sent",
      recipient: to,
      subject,
      metadata: { threadId: result.threadId },
    })

    if (prospectId) {
      await supabaseAdmin
        .from("prospects")
        .update({ status: "contacted", updated_at: new Date().toISOString() })
        .eq("id", prospectId)
    }

    return NextResponse.json({
      success: true,
      messageId: messageRef,
      gmailMessageId: result.id,
      threadId: result.threadId,
    })
  } catch (error) {
    console.error("Email send error:", error)
    return NextResponse.json({
      error: "Failed to send email",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
