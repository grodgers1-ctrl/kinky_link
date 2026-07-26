import { auth } from "@/lib/auth"
import { getGscClient } from "@/lib/google"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

function getDateString(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split("T")[0]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { data: site } = await supabaseAdmin
      .from("sites")
      .select("url")
      .eq("id", id)
      .eq("user_id", session.user.id)
      .single()

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 })
    }

    const gsc = getGscClient(session.accessToken, session.refreshToken || "")
    const response = await gsc.searchanalytics.query({
      siteUrl: site.url,
      requestBody: {
        startDate: getDateString(30),
        endDate: getDateString(0),
        dimensions: ["query"],
        rowLimit: 10,
      },
    })

    return NextResponse.json({ rows: response.data.rows || [] })
  } catch (error) {
    console.error("GSC performance error:", error)
    return NextResponse.json({ error: "Failed to fetch performance" }, { status: 500 })
  }
}
