import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const { campaignId, name, steps, prospectIds } = body

    if (!name || !steps?.length) {
      return NextResponse.json({ error: "Name and steps required" }, { status: 400 })
    }

    const { data: sequence, error: seqError } = await supabaseAdmin
      .from("sequences")
      .insert({ user_id: session.user.id, campaign_id: campaignId || null, name })
      .select()
      .single()

    if (seqError) return NextResponse.json({ error: seqError.message }, { status: 500 })

    const stepRows = steps.map((step: any, i: number) => ({
      sequence_id: sequence.id,
      step_order: i + 1,
      delay_days: step.delayDays,
      template_id: step.templateId || null,
      subject: step.subject,
      body_html: step.bodyHtml,
      body_text: step.bodyText || "",
    }))

    const { error: stepError } = await supabaseAdmin.from("sequence_steps").insert(stepRows)
    if (stepError) return NextResponse.json({ error: stepError.message }, { status: 500 })

    if (prospectIds?.length > 0) {
      const progressRows = prospectIds.map((pid: string) => ({
        sequence_id: sequence.id,
        prospect_id: pid,
        current_step: 1,
        next_send_at: new Date().toISOString(),
        status: "pending",
      }))
      await supabaseAdmin.from("sequence_progress").insert(progressRows)
    }

    return NextResponse.json({ sequence })
  } catch (error) {
    console.error("Sequence create error:", error)
    return NextResponse.json({ error: "Failed to create sequence" }, { status: 500 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { data, error } = await supabaseAdmin
      .from("sequences")
      .select("*, sequence_steps(*)")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sequences: data || [] })
  } catch (error) {
    console.error("Sequences list error:", error)
    return NextResponse.json({ error: "Failed to load sequences" }, { status: 500 })
  }
}
