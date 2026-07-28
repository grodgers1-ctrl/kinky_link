import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { syncBacklinksToDb } from "@/lib/gsc-backlinks"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const siteId = searchParams.get("siteId")

    let query = supabaseAdmin
      .from("sites")
      .select("*")
      .eq("user_id", session.user.id)

    if (siteId) query = query.eq("id", siteId)

    const { data: sites } = await query
    if (!sites || sites.length === 0) {
      return NextResponse.json({ error: "No sites found" }, { status: 400 })
    }

    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("access_token")
      .eq("user_id", session.user.id)
      .single()

    if (!account?.access_token) {
      return NextResponse.json({ error: "No GSC access token" }, { status: 400 })
    }

    let totalNew = 0
    let totalExisting = 0

    for (const site of sites) {
      const result = await syncBacklinksToDb(
        session.user.id,
        site.id,
        site.url,
        account.access_token,
      )
      totalNew += result.new
      totalExisting += result.total
    }

    return NextResponse.json({
      synced: true,
      newBacklinks: totalNew,
      totalProcessed: totalExisting + totalNew,
      sitesProcessed: sites.length,
    })
  } catch (error) {
    console.error("Backlink sync error:", error)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}
