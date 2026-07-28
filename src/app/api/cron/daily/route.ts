import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/db"
import { sendGmailEmail, injectTrackedLinks, injectTrackingPixel } from "@/lib/email"
import { syncBacklinksToDb } from "@/lib/gsc-backlinks"
import crypto from "crypto"

export const dynamic = "force-dynamic"

const BASE_URL = process.env.AUTH_URL || "http://localhost:3000"
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: Record<string, any> = {}

  // --- PART 1: SEND DUE FOLLOW-UPS ---
  try {
    const { data: dueItems } = await supabaseAdmin
      .from("sequence_progress")
      .select("*, sequence:sequence_id(*), prospect:prospect_id(*)")
      .lte("next_send_at", new Date().toISOString())
      .in("status", ["pending", "in_progress"])
      .order("next_send_at", { ascending: true })
      .limit(50)

    if (dueItems?.length) {
      let sent = 0
      let errors = 0

      for (const item of dueItems) {
        try {
          const { data: steps } = await supabaseAdmin
            .from("sequence_steps")
            .select("*")
            .eq("sequence_id", item.sequence_id)
            .order("step_order", { ascending: true })

          const step = (steps || []).find((s: any) => s.step_order === item.current_step)
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
          const nextStep = (steps || []).find((s: any) => s.step_order === nextStepOrder)
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

      results.followups = { sent, errors, totalProcessed: dueItems.length }
    } else {
      results.followups = { sent: 0, errors: 0, totalProcessed: 0 }
    }
  } catch (err) {
    console.error("Follow-up cron error:", err)
    results.followups = { error: "Failed" }
  }

  // --- PART 2: SYNC BACKLINKS ---
  try {
    const { data: accounts } = await supabaseAdmin
      .from("accounts")
      .select("user_id, access_token")
      .not("access_token", "is", null)

    let totalNew = 0
    let totalProcessed = 0
    let sitesProcessed = 0

    for (const account of accounts || []) {
      const { data: sites } = await supabaseAdmin
        .from("sites")
        .select("*")
        .eq("user_id", account.user_id)

      for (const site of sites || []) {
        const result = await syncBacklinksToDb(
          account.user_id,
          site.id,
          site.url,
          account.access_token,
        )
        totalNew += result.new
        totalProcessed += result.total
        sitesProcessed++
      }
    }

    results.backlinks = { new: totalNew, total: totalProcessed, sitesProcessed }
  } catch (err) {
    console.error("Backlink sync cron error:", err)
    results.backlinks = { error: "Failed" }
  }

  return NextResponse.json(results)
}
