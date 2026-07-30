// Tavily Search API — https://docs.tavily.com/
// Free tier: 1,000 searches/month. Same interface as the previous Google-HTML
// scraper so callers (corpus, MCP search_prospects, keyword-service) don't
// need to change.

interface ProspectResult {
  url: string
  title: string
  description: string
  domain: string
}

interface TavilyResult {
  url: string
  title: string
  content?: string
  score?: number
  raw_content?: string | null
}

interface TavilyResponse {
  results?: TavilyResult[]
  answer?: string | null
  query?: string
  response_time?: number
}

const TAVILY_API_KEY = process.env.TAVILY_API_KEY

export async function scrapeSerp(keyword: string): Promise<ProspectResult[]> {
  if (!TAVILY_API_KEY) {
    console.warn("scrapeSerp: TAVILY_API_KEY not configured — returning [].")
    return []
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: keyword,
        max_results: 20,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error("Tavily fetch failed:", res.status, body.slice(0, 300))
      return []
    }

    const data = (await res.json()) as TavilyResponse
    const items = data.results || []
    const results: ProspectResult[] = []

    for (const item of items) {
      const url = item.url
      const title = item.title?.trim() || ""
      if (!url || !title) continue
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "")
        results.push({
          url,
          title,
          description: item.content?.trim() || "",
          domain,
        })
      } catch {
        // skip malformed URLs
      }
    }

    return results
  } catch (error) {
    console.error("Tavily fetch error:", error)
    return []
  }
}
