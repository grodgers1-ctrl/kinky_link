import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/db"
import { sendGmailEmail, injectTrackedLinks, injectTrackingPixel } from "@/lib/email"
import { syncBacklinksToDb } from "@/lib/gsc-backlinks"
import { checkSingleUrl, determineHealth } from "@/lib/health-checker"
import { checkUrlIndexedSimple } from "@/lib/index-checker"
import crypto from "crypto"

export const dynamic = "force-dynamic"

const BASE_URL = process.env.AUTH_URL || "http://localhost:3000"
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  if (!CRON_SECRET || req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
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

          const step = (steps || []).find(s => s.step_order === item.current_step)
          if (!step) {
            await supabaseAdmin.from("sequence_progress")
              .update({ status: "completed", updated_at: new Date().toISOString() })
              .eq("id", item.id)
            continue
          }

          if (!item.prospect.email) { errors++; continue }

          const { data: account } = await supabaseAdmin
            .from("accounts")
            .select("access_token, refresh_token")
            .eq("user_id", item.sequence.user_id)
            .eq("provider", "google")
            .single()

          if (!account) { errors++; continue }

          const messageRef = crypto.randomUUID()
          const renderedHtml = injectTrackingPixel(
            injectTrackedLinks(step.body_html, messageRef, BASE_URL),
            messageRef, BASE_URL
          )

          const result = await sendGmailEmail({
            to: item.prospect.email,
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
          const nextStep = (steps || []).find(s => s.step_order === nextStepOrder)
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
      .eq("provider", "google")
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

  // --- PART 3: HEALTH CHECK STALE BACKLINKS ---
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    const { data: staleBacklinks } = await supabaseAdmin
      .from("backlinks")
      .select("id, source_url, user_id")
      .or(`last_health_check.is.null,last_health_check.lte.${sevenDaysAgo}`)
      .limit(200)

    if (staleBacklinks && staleBacklinks.length > 0) {
      let broken = 0
      let healthy = 0

      for (const bl of staleBacklinks) {
        try {
          const result = await checkSingleUrl(bl.source_url)
          const healthStatus = determineHealth(result)

          await supabaseAdmin
            .from("backlinks")
            .update({ health_status: healthStatus, last_health_check: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", bl.id)

          await supabaseAdmin.from("backlink_history").insert({
            backlink_id: bl.id,
            health_status: healthStatus,
          })

          if (healthStatus === "broken") {
            broken++
            await supabaseAdmin.from("notifications").insert({
              user_id: bl.user_id,
              type: "info",
              title: "Broken backlink detected",
              body: `${bl.source_url} is broken`,
              link: `/dashboard/backlinks/${bl.id}`,
            })
          } else if (healthStatus === "healthy") {
            healthy++
          }
        } catch {
          // individual failure shouldn't block the batch
        }
      }

      results.healthCheck = { checked: staleBacklinks.length, broken, healthy }
    } else {
      results.healthCheck = { checked: 0 }
    }
  } catch (err) {
    console.error("Health check cron error:", err)
    results.healthCheck = { error: "Failed" }
  }

  // --- PART 4: INDEX CHECK PENDING BACKLINKS ---
  try {
    const { data: unindexedLinks } = await supabaseAdmin
      .from("backlinks")
      .select("id, source_url")
      .is("is_indexed", null)
      .limit(100)

    if (unindexedLinks && unindexedLinks.length > 0) {
      let indexed = 0
      let notIndexed = 0
      let unknown = 0

      for (const bl of unindexedLinks) {
        try {
          const result = await checkUrlIndexedSimple(bl.source_url)
          const isIndexed = result === "indexed" ? true : result === "not_indexed" ? false : null

          await supabaseAdmin
            .from("backlinks")
            .update({ is_indexed: isIndexed, updated_at: new Date().toISOString() })
            .eq("id", bl.id)

          if (result === "indexed") indexed++
          else if (result === "not_indexed") notIndexed++
          else unknown++
        } catch {
          // individual failure shouldn't block the batch
        }
      }

      results.indexCheck = { checked: unindexedLinks.length, indexed, notIndexed, unknown }
    } else {
      results.indexCheck = { checked: 0 }
    }
  } catch (err) {
    console.error("Index check cron error:", err)
    results.indexCheck = { error: "Failed" }
  }

  return NextResponse.json(results)
}
