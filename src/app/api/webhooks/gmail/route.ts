import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message = body.message
    if (!message?.data) return NextResponse.json({}, { status: 200 })

    const decoded = JSON.parse(Buffer.from(message.data, "base64").toString())
    const { emailAddress, historyId } = decoded
    if (!emailAddress) return NextResponse.json({}, { status: 200 })

    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("*")
      .eq("provider_account_id", emailAddress)
      .single()

    if (!account) return NextResponse.json({}, { status: 200 })

    const oauth2Client = new google.auth.OAuth2(
      process.env.AUTH_GOOGLE_ID,
      process.env.AUTH_GOOGLE_SECRET
    )
    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    })

    const gmail = google.gmail({ version: "v1", auth: oauth2Client })
    const historyResponse = await gmail.users.history.list({
      userId: "me",
      startHistoryId: historyId,
      historyTypes: ["messageAdded"],
    })

    const histories = historyResponse.data.history || []

    for (const hist of histories) {
      for (const msg of hist.messages || []) {
        if (!msg.id) continue

        const messageDetail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["In-Reply-To", "References", "Subject", "From", "Message-ID"],
        })

        const headers = messageDetail.data.payload?.headers || []
        const inReplyTo = headers.find((h) => h.name === "In-Reply-To")?.value
        const subject = headers.find((h) => h.name === "Subject")?.value
        const from = headers.find((h) => h.name === "From")?.value
        const messageId = headers.find((h) => h.name === "Message-ID")?.value

        if (!inReplyTo) continue

        const { data: originalEvent } = await supabaseAdmin
          .from("email_events")
          .select("*")
          .or(`gmail_message_id.eq.${inReplyTo},metadata->threadId.eq.${messageDetail.data.threadId}`)
          .eq("event_type", "sent")
          .single()

        if (!originalEvent) continue

        await supabaseAdmin.from("email_events").insert({
          user_id: originalEvent.user_id,
          message_id: messageId || crypto.randomUUID(),
          gmail_message_id: msg.id,
          prospect_id: originalEvent.prospect_id,
          campaign_id: originalEvent.campaign_id,
          sequence_id: originalEvent.sequence_id,
          event_type: "reply",
          recipient: from,
          subject,
          metadata: { threadId: messageDetail.data.threadId, inReplyTo },
        })

        if (originalEvent.sequence_id && originalEvent.prospect_id) {
          await supabaseAdmin.from("sequence_progress")
            .update({ status: "replied", next_send_at: null, updated_at: new Date().toISOString() })
            .eq("sequence_id", originalEvent.sequence_id)
            .eq("prospect_id", originalEvent.prospect_id)

          await supabaseAdmin.from("prospects")
            .update({ status: "replied", updated_at: new Date().toISOString() })
            .eq("id", originalEvent.prospect_id)
        }
      }
    }

    return NextResponse.json({ processed: histories.length })
  } catch {
    return NextResponse.json({}, { status: 200 })
  }
}
