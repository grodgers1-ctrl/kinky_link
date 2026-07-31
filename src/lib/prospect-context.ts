export interface ProspectContext {
  url: string
  title: string | null
  description: string | null
  snippet: string | null
  source: "live"
}

const FETCH_TIMEOUT_MS = 6000
const MAX_HTML_BYTES = 500_000

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
}

function firstMatch(re: RegExp, source: string): string | null {
  const m = source.match(re)
  if (!m) return null
  const raw = m[1]?.trim()
  if (!raw) return null
  const clean = stripTags(raw)
  return clean || null
}

export async function fetchProspectContext(url: string): Promise<ProspectContext | null> {
  let normalized: string
  try {
    normalized = new URL(url.startsWith("http") ? url : `https://${url}`).toString()
  } catch {
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(normalized, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkLightBot/1.0; +https://lightlinks.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
    })
    if (!response.ok) return null

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("text/html")) return null

    let html = await response.text()
    if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES)

    const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html)
    const description =
      firstMatch(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html) ||
      firstMatch(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i, html)

    let snippet: string | null = null
    const pMatches = html.match(/<p[^>]*>([\s\S]{40,500}?)<\/p>/gi)
    if (pMatches) {
      for (const p of pMatches) {
        const clean = stripTags(p)
        if (clean.length >= 40) {
          snippet = clean.slice(0, 400)
          break
        }
      }
    }

    if (!title && !description && !snippet) return null

    return { url: normalized, title, description, snippet, source: "live" }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
