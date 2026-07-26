import { auth } from "@/lib/auth"
import { getGscClient } from "@/lib/google"
import { supabaseAdmin } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const gsc = getGscClient(session.accessToken, session.refreshToken || "")
    const response = await gsc.sites.list()
    const sites = response.data.siteEntry || []

    const userId = session.user.id
    if (sites.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from("sites")
        .select("url")
        .eq("user_id", userId)

      const existingUrls = new Set(existing?.map((s) => s.url) || [])

      for (const site of sites) {
        if (site.siteUrl && !existingUrls.has(site.siteUrl)) {
          await supabaseAdmin.from("sites").insert({
            user_id: userId,
            url: site.siteUrl,
            gsc_verified: true,
          })
        }
      }
    }

    return NextResponse.json({ sites })
  } catch (error) {
    console.error("GSC API error:", error)
    return NextResponse.json({ error: "Failed to fetch sites" }, { status: 500 })
  }
}
