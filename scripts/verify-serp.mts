// scripts/verify-serp.mts
// End-to-end sanity: calls scrapeSerp() against the real search API, prints result count.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-serp.mts
import { scrapeSerp } from "@/lib/scraper"

const keyword = process.argv[2] || "nextjs seo tips"
console.log(`Searching for: "${keyword}"`)

const results = await scrapeSerp(keyword)
console.log(`Got ${results.length} results.`)
results.slice(0, 5).forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.domain}] ${r.title.slice(0, 70)}`)
})

if (results.length === 0) {
  console.error("\nFAIL: 0 results — TAVILY_API_KEY missing or API misconfigured.")
  process.exit(1)
}
console.log("\nSERP PASS")
