import * as cheerio from "cheerio"

interface ProspectResult {
  url: string
  title: string
  description: string
  domain: string
}

export async function scrapeSerp(keyword: string): Promise<ProspectResult[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&num=20`

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  })

  const html = await response.text()
  const $ = cheerio.load(html)
  const results: ProspectResult[] = []

  $("div.g").each((_, el) => {
    const titleEl = $(el).find("h3")
    const linkEl = $(el).find("a")
    const snippetEl = $(el).find("div[data-sncf], span.aCOpRe, div.VwiC3b")

    const title = titleEl.text().trim()
    const href = linkEl.attr("href") || ""
    const description = snippetEl.text().trim()

    const urlMatch = href.match(/\/url\?q=([^&]+)/) || href.match(/^https?:\/\/[^&]+/)
    const rawUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : href

    if (rawUrl && title) {
      try {
        const domain = new URL(rawUrl).hostname.replace("www.", "")
        results.push({ url: rawUrl, title, description, domain })
      } catch {
        // skip malformed URLs
      }
    }
  })

  return results
}
