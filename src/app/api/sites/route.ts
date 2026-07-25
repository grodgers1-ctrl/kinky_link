import { auth } from "@/lib/auth"
import { getGscClient } from "@/lib/google"
import { supabase } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const gsc = getGscClient(
      (session as any).accessToken as string,
      (session as any).refreshToken as string
    )
    const response = await gsc.sites.list()
    const sites = response.data.siteEntry || []

    const userId = session.user.id
    if (sites.length > 0) {
      const { data: existing } = await supabase
        .from("sites")
        .select("url")
        .eq("user_id", userId)

      const existingUrls = new Set(existing?.map((s: any) => s.url) || [])

      for (const site of sites) {
        if (!existingUrls.has(site.siteUrl!)) {
          await supabase.from("sites").insert({
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
