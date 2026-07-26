import { supabaseAdmin } from "@/lib/db"
import { sendGmailEmail, injectTrackedLinks, injectTrackingPixel } from "@/lib/email"
import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

const BASE_URL = process.env.AUTH_URL || "http://localhost:3000"
const CRON_SECRET = process.env.CRON_SECRET

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { data: dueItems } = await supabaseAdmin
      .from("sequence_progress")
      .select("*, sequence:sequence_id(*), prospect:prospect_id(*)")
      .lte("next_send_at", new Date().toISOString())
      .in("status", ["pending", "in_progress"])
      .order("next_send_at", { ascending: true })
      .limit(50)

    if (!dueItems?.length) return NextResponse.json({ sent: 0 })

    let sent = 0
    let errors = 0

    for (const item of dueItems) {
      try {
        const { data: steps } = await supabaseAdmin
          .from("sequence_steps")
          .select("*")
          .eq("sequence_id", item.sequence_id)
          .order("step_order", { ascending: true })

        const step = (steps || []).find((s) => s.step_order === item.current_step)
        if (!step) {
          await supabaseAdmin.from("sequence_progress")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("id", item.id)
          continue
        }

        const { data: account } = await supabaseAdmin
          .from("accounts")
          .select("access_token, refresh_token")
          .eq("user_id", item.sequence.user_id)
          .single()

        if (!account) { errors++; continue }

        const messageRef = crypto.randomUUID()
        const renderedHtml = injectTrackingPixel(
          injectTrackedLinks(step.body_html, messageRef, BASE_URL),
          messageRef, BASE_URL
        )

        const result = await sendGmailEmail({
          to: item.prospect.email || item.prospect.url,
          subject: step.subject,
          bodyHtml: renderedHtml,
          bodyText: step.body_text,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
        })

        await supabaseAdmin.from("email_events").insert({
          user_id: item.sequence.user_id,
          message_id: messageRef,
          gmail_message_id: result.id,
          prospect_id: item.prospect_id,
          campaign_id: item.sequence.campaign_id,
          sequence_id: item.sequence_id,
          sequence_step: item.current_step,
          event_type: "sent",
          recipient: item.prospect.email,
          subject: step.subject,
          metadata: { threadId: result.threadId, stepOrder: item.current_step },
        })

        const nextStepOrder = item.current_step + 1
        const nextStep = (steps || []).find((s) => s.step_order === nextStepOrder)
        const nextSendAt = nextStep
          ? new Date(Date.now() + nextStep.delay_days * 86400000).toISOString()
          : null

        await supabaseAdmin.from("sequence_progress")
          .update({
            current_step: nextStepOrder,
            last_sent_at: new Date().toISOString(),
            next_send_at: nextSendAt,
            status: nextStep ? "in_progress" : "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)

        await supabaseAdmin.from("prospects")
          .update({ status: "contacted", updated_at: new Date().toISOString() })
          .eq("id", item.prospect_id)

        sent++
      } catch {
        errors++
      }
    }

    return NextResponse.json({ sent, errors, totalProcessed: dueItems.length })
  } catch (error) {
    console.error("Cron error:", error)
    return NextResponse.json({ error: "Cron failed" }, { status: 500 })
  }
}
