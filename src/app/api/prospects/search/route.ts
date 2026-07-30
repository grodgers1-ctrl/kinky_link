import { auth } from "@/lib/auth"
import { getSerpForKeyword } from "@/lib/corpus"
import { scrapeSerp } from "@/lib/scraper"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    let keyword = searchParams.get("keyword")
    if (!keyword) {
      return NextResponse.json({ error: "Keyword required" }, { status: 400 })
    }

    if (keyword.length > 200) {
      return NextResponse.json({ error: "Keyword too long" }, { status: 400 })
    }

    // Build a prospect-focused query that finds sites linking to resources
    // (roundups, "best of" lists, resource pages) rather than direct competitors
    const prospectQuery = `"${keyword}" resources OR tools OR sites OR directory OR recommended OR list OR roundup OR "best" OR "top"`

    // Use the prospect query for fresh search (won't match cached SERP for raw keyword)
    let results = await scrapeSerp(prospectQuery)

    // Fallback: if no results from prospect query, search for the keyword directly
    if (results.length === 0) {
      const serpResults = await getSerpForKeyword(keyword)
      results = serpResults.map(r => ({
        url: r.url,
        title: r.title || "",
        description: r.description || "",
        domain: r.domain,
      }))
    }

    // Prefer pages that look like roundups, lists, guides, or resource pages
    // over direct competitor product pages
    const keywordLower = keyword.toLowerCase()
    const filtered = results.filter(r => {
      const title = r.title.toLowerCase()
      const domain = r.domain.toLowerCase()
      const isLinkable = /2024|2025|2026|best|top|review|vs|alternative|guide|resources|list|roundup|tools|directory|recommended|ultimate|complete/.test(title)
      const isCompetitor = domain.includes(keywordLower.replace(/\s+/g, ""))
      return isLinkable || !isCompetitor
    })

    return NextResponse.json({ results: (filtered.length > 0 ? filtered : results).slice(0, 10) })
  } catch (error) {
    console.error("SERP search error:", error)
    return NextResponse.json({ error: "Failed to search prospects" }, { status: 500 })
  }
}
