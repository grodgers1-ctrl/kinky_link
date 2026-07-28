import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { checkSingleUrl, determineHealth } from "@/lib/health-checker"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const { data: backlink } = await supabaseAdmin
      .from("backlinks")
      .select("*")
      .eq("id", id)
      .eq("user_id", session.user.id)
      .single()

    if (!backlink) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const status = await checkSingleUrl(backlink.source_url)
    const targetStatus = await checkSingleUrl(backlink.target_url)
    const healthStatus = determineHealth(status)

    await supabaseAdmin
      .from("backlinks")
      .update({ health_status: healthStatus, last_health_check: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)

    await supabaseAdmin.from("backlink_history").insert({
      backlink_id: id,
      health_status: healthStatus,
    })

    if (healthStatus === "broken") {
      await supabaseAdmin.from("notifications").insert({
        user_id: session.user.id,
        type: "info",
        title: "Broken backlink detected",
        body: `${backlink.source_url} is returning ${status.statusCode}`,
        link: `/dashboard/backlinks/${id}`,
      }).maybeSingle()
    }

    return NextResponse.json({ healthStatus, sourceCheck: status, targetCheck: targetStatus })
  } catch (error) {
    console.error("Health check error:", error)
    return NextResponse.json({ error: "Health check failed" }, { status: 500 })
  }
}
