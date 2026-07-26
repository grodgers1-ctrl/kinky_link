import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const prospectId = searchParams.get("prospectId")

    let query = supabaseAdmin
      .from("email_events")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("event_type", "reply")
      .order("created_at", { ascending: false })
      .limit(1)

    if (prospectId) query = query.eq("prospect_id", prospectId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ reply: data?.[0] || null, replies: data || [] })
  } catch (error) {
    console.error("Replies error:", error)
    return NextResponse.json({ error: "Failed to load replies" }, { status: 500 })
  }
}
