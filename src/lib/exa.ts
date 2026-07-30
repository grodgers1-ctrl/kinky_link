// Exa.ai — https://docs.exa.ai/
// We use two endpoints:
//   POST /search        — neural + keyword search
//   POST /findSimilar   — given a URL, return semantically similar URLs

const EXA_API_KEY = process.env.EXA_API_KEY

export interface ExaResult {
  url: string
  title: string
  score: number | null
  publishedDate: string | null
}

interface ExaRawResult {
  id?: string
  url?: string
  title?: string
  score?: number
  publishedDate?: string
}

interface ExaResponse {
  results?: ExaRawResult[]
  requestId?: string
}

function normalize(items: ExaRawResult[]): ExaResult[] {
  const out: ExaResult[] = []
  for (const it of items) {
    const url = it.url || it.id
    const title = it.title?.trim() || ""
    if (!url || !title) continue
    out.push({
      url,
      title,
      score: typeof it.score === "number" ? it.score : null,
      publishedDate: it.publishedDate || null,
    })
  }
  return out
}

export async function exaSearch(
  query: string,
  opts: { numResults?: number; type?: "neural" | "keyword" | "auto" } = {},
): Promise<ExaResult[]> {
  if (!EXA_API_KEY) {
    console.warn("exaSearch: EXA_API_KEY not configured — returning [].")
    return []
  }
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": EXA_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        type: opts.type || "auto",
        numResults: Math.min(50, Math.max(1, opts.numResults || 10)),
      }),
    })
    if (!res.ok) {
      console.error("Exa /search failed:", res.status, (await res.text()).slice(0, 300))
      return []
    }
    const data = (await res.json()) as ExaResponse
    return normalize(data.results || [])
  } catch (error) {
    console.error("Exa /search error:", error)
    return []
  }
}

export async function exaFindSimilar(
  url: string,
  opts: { numResults?: number; excludeSourceDomain?: boolean } = {},
): Promise<ExaResult[]> {
  if (!EXA_API_KEY) {
    console.warn("exaFindSimilar: EXA_API_KEY not configured — returning [].")
    return []
  }
  try {
    const res = await fetch("https://api.exa.ai/findSimilar", {
      method: "POST",
      headers: { "x-api-key": EXA_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        numResults: Math.min(50, Math.max(1, opts.numResults || 10)),
        excludeSourceDomain: opts.excludeSourceDomain ?? true,
      }),
    })
    if (!res.ok) {
      console.error("Exa /findSimilar failed:", res.status, (await res.text()).slice(0, 300))
      return []
    }
    const data = (await res.json()) as ExaResponse
    return normalize(data.results || [])
  } catch (error) {
    console.error("Exa /findSimilar error:", error)
    return []
  }
}
