import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const siteId = searchParams.get("siteId")
    const healthStatus = searchParams.get("healthStatus")
    const search = searchParams.get("search")
    const indexFilter = searchParams.get("indexFilter")

    let query = supabaseAdmin
      .from("backlinks")
      .select("*, sites(url)")
      .eq("user_id", session.user.id)
      .order("last_seen", { ascending: false })
      .limit(500)

    if (siteId) query = query.eq("site_id", siteId)
    if (healthStatus) query = query.eq("health_status", healthStatus)
    if (search) query = query.ilike("source_url", `%${search}%`)
    if (indexFilter === "indexed") query = query.eq("is_indexed", true)
    else if (indexFilter === "not_indexed") query = query.eq("is_indexed", false)
    else if (indexFilter === "unknown") query = query.is("is_indexed", null)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { count: total } = await supabaseAdmin
      .from("backlinks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", session.user.id)

    const { count: healthy } = await supabaseAdmin
      .from("backlinks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .eq("health_status", "healthy")

    const { count: broken } = await supabaseAdmin
      .from("backlinks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .eq("health_status", "broken")

    return NextResponse.json({
      backlinks: data || [],
      summary: {
        total: total || 0,
        healthy: healthy || 0,
        broken: broken || 0,
        pending: (total || 0) - (healthy || 0) - (broken || 0),
      },
    })
  } catch (error) {
    console.error("Backlinks list error:", error)
    return NextResponse.json({ error: "Failed to load backlinks" }, { status: 500 })
  }
}
