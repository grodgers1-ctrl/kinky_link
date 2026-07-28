import { google } from "googleapis"
import * as cheerio from "cheerio"

export async function fetchGscKeywords(
  siteUrl: string,
  accessToken: string
) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  )
  oauth2Client.setCredentials({
    access_token: accessToken,
  })

  const webmasters = google.webmasters({ version: "v3", auth: oauth2Client })

  const response = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: getDateString(90),
      endDate: getDateString(0),
      dimensions: ["query"],
      rowLimit: 50,
    },
  })

  return (response.data.rows || []).map((row: any) => ({
    keyword: row.keys?.[0] || "",
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    avgPosition: row.position || 0,
  }))
}

export async function fetchGoogleSuggest(seedKeyword: string): Promise<string[]> {
  try {
    const url = `http://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seedKeyword)}`
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
      },
    })

    if (!response.ok) return []

    const text = await response.text()
    const data = JSON.parse(text)
    return data[1] || []
  } catch (error) {
    console.error("Google Suggest error:", error)
    return []
  }
}

export async function fetchPeopleAlsoAsk(keyword: string): Promise<string[]> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    })

    const html = await response.text()
    const $ = cheerio.load(html)
    const questions: string[] = []

    $("div.related-question-pair, div[data-hveid] > div > span").each((_, el) => {
      const text = $(el).text().trim()
      if (text.endsWith("?") && text.length > 10 && text.length < 200) {
        questions.push(text)
      }
    })

    return [...new Set(questions)].slice(0, 10)
  } catch (error) {
    console.error("PAA scrape error:", error)
    return []
  }
}

export async function estimateKeywordDifficulty(keyword: string): Promise<{
  totalResults: number
  difficulty: "low" | "medium" | "high"
}> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(`"${keyword}"`)}`
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    const html = await response.text()
    const $ = cheerio.load(html)

    const resultText = $("div#result-stats").text()
    const match = resultText.match(/([\d,]+)/)
    const totalResults = match ? parseInt(match[1].replace(/,/g, "")) : 0

    let difficulty: "low" | "medium" | "high" = "low"
    if (totalResults > 1000000) difficulty = "high"
    else if (totalResults > 100000) difficulty = "medium"

    return { totalResults, difficulty }
  } catch {
    return { totalResults: 0, difficulty: "low" }
  }
}

function getDateString(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split("T")[0]
}
