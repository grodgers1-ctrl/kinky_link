// scripts/verify-competitor-backlinks.mts
// Sanity: prove getCompetitorBacklinks returns only pages fetch-VERIFIED to
// link to the competitor, and that a repeat run is served entirely from cache
// (zero Tavily calls, zero page fetches).
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-competitor-backlinks.mts [competitor]
import { getCompetitorBacklinks, buildCompetitorBacklinkQuery } from "@/lib/corpus"

const competitor = process.argv[2] || "ahrefs.com"
console.log(`buildCompetitorBacklinkQuery("${competitor}") =`)
console.log(`  ${buildCompetitorBacklinkQuery(competitor)}`)
console.log()

const first = await getCompetitorBacklinks({ competitor, limit: 8 })
console.log(`Run 1: ${first.verified.length} verified, ${first.unverified.length} unverifiable, ${first.droppedNoLink} dropped (no link).`)
console.log(`  stats: serp=${first.stats.serpSource} verificationCacheHits=${first.stats.verificationCacheHits} pagesFetched=${first.stats.pagesFetched}`)
first.verified.forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.domain}] DA=${r.domainAuthority ?? "?"} rel=${r.rel ?? "?"} anchor="${(r.anchorText || "").slice(0, 40)}" ${r.title.slice(0, 60)}`)
})
if (first.unverified.length > 0) {
  console.log(`  unverifiable: ${first.unverified.map((r) => r.domain).join(", ")}`)
}

let failed = false
for (const r of first.verified) {
  if (!r.verified || !r.linkUrl) {
    console.error(`FAIL: "${r.url}" returned as verified without a confirmed link.`)
    failed = true
  }
}

console.log()
const second = await getCompetitorBacklinks({ competitor, limit: 8 })
console.log(`Run 2 (cache check): serp=${second.stats.serpSource} verificationCacheHits=${second.stats.verificationCacheHits} pagesFetched=${second.stats.pagesFetched}`)
if (second.stats.serpSource !== "cache" || second.stats.pagesFetched !== 0) {
  console.error("FAIL: second run should be fully cache-served (serp=cache, pagesFetched=0).")
  failed = true
}

if (first.verified.length === 0) {
  console.error("FAIL: 0 verified results.")
  failed = true
}

if (failed) process.exit(1)
console.log("\nCOMPETITOR BACKLINKS PASS (verified + cache-served)")
