import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get("campaignId")

    let query = supabaseAdmin
      .from("email_events")
      .select("*")
      .eq("user_id", session.user.id)

    if (campaignId) query = query.eq("campaign_id", campaignId)

    const { data: events, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const sent = events?.filter((e) => e.event_type === "sent").length || 0
    const totalOpens = events?.filter((e) => e.event_type === "open").length || 0
    const uniqueOpens = new Set(events?.filter((e) => e.event_type === "open").map((e) => e.message_id)).size
    const clicks = events?.filter((e) => e.event_type === "click").length || 0

    return NextResponse.json({
      sent,
      totalOpens,
      uniqueOpens,
      openRate: sent > 0 ? Math.round((uniqueOpens / sent) * 100) : 0,
      totalClicks: clicks,
      clickRate: sent > 0 ? Math.round((clicks / sent) * 100) : 0,
    })
  } catch (error) {
    console.error("Stats error:", error)
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 })
  }
}
