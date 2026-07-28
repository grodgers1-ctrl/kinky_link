export async function checkUrlIndexedSimple(url: string): Promise<"indexed" | "not_indexed" | "unknown"> {
  try {
    const searchUrl = `https://www.google.com/search?q=site:${encodeURIComponent(url)}`
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    })

    const html = await response.text()

    if (html.includes("did not match any documents") || html.includes("No results found")) {
      return "not_indexed"
    }

    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (new RegExp(escaped, "i").test(html)) {
      return "indexed"
    }

    return "unknown"
  } catch {
    return "unknown"
  }
}
