import { auth } from "@/lib/auth"
import { scrapeSerp } from "@/lib/scraper"
import { getMozMetrics } from "@/lib/moz"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get("keyword")
    if (!keyword) {
      return NextResponse.json({ error: "Keyword required" }, { status: 400 })
    }

    if (keyword.length > 200) {
      return NextResponse.json({ error: "Keyword too long" }, { status: 400 })
    }

    const results = await scrapeSerp(keyword)

    const enriched = await Promise.all(
      results.slice(0, 10).map(async (result) => {
        const moz = await getMozMetrics(result.domain)
        return { ...result, domainAuthority: moz.domainAuthority }
      })
    )

    return NextResponse.json({ results: enriched })
  } catch (error) {
    console.error("SERP scrape error:", error)
    return NextResponse.json({ error: "Failed to search prospects" }, { status: 500 })
  }
}
