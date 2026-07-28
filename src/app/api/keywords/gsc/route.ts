import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { fetchGscKeywords } from "@/lib/keyword-service"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const siteId = searchParams.get("siteId")

    if (!siteId) {
      return NextResponse.json({ error: "siteId required" }, { status: 400 })
    }

    const { data: site } = await supabaseAdmin
      .from("sites")
      .select("url")
      .eq("id", siteId)
      .eq("user_id", session.user.id)
      .single()

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 })
    }

    const keywords = await fetchGscKeywords(site.url, session.accessToken as string)

    return NextResponse.json({ keywords })
  } catch (error) {
    console.error("GSC keywords error:", error)
    return NextResponse.json({ error: "Failed to fetch GSC keywords" }, { status: 500 })
  }
}
