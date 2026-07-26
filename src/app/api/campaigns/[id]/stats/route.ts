import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("user_id", session.user.id)
      .single()

    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { data: events } = await supabaseAdmin
      .from("email_events")
      .select("*")
      .eq("campaign_id", campaignId)

    const sent = events?.filter((e) => e.event_type === "sent").length || 0
    const uniqueOpens = new Set(events?.filter((e) => e.event_type === "open").map((e) => e.message_id)).size
    const totalOpens = events?.filter((e) => e.event_type === "open").length || 0
    const clicks = events?.filter((e) => e.event_type === "click").length || 0
    const replies = events?.filter((e) => e.event_type === "reply").length || 0

    const { count: totalProspects } = await supabaseAdmin
      .from("prospects")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)

    const { count: contactedCount } = await supabaseAdmin
      .from("prospects")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .neq("status", "prospect")

    return NextResponse.json({
      sent,
      uniqueOpens,
      totalOpens,
      openRate: sent > 0 ? Math.round((uniqueOpens / sent) * 100) : 0,
      clicks,
      clickRate: sent > 0 ? Math.round((clicks / sent) * 100) : 0,
      replies,
      replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
      totalProspects: totalProspects || 0,
      contactedCount: contactedCount || 0,
    })
  } catch (error) {
    console.error("Campaign stats error:", error)
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 })
  }
}
