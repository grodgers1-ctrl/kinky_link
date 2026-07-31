// scripts/verify-competitor-backlinks.mts
// Sanity: prove getCompetitorBacklinks returns real, roundup-flavored results
// for a known-competitive domain. Prints hostnames + DA.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-competitor-backlinks.mts [competitor]
import { getCompetitorBacklinks, buildCompetitorBacklinkQuery } from "@/lib/corpus"

const competitor = process.argv[2] || "ahrefs.com"
console.log(`buildCompetitorBacklinkQuery("${competitor}") =`)
console.log(`  ${buildCompetitorBacklinkQuery(competitor)}`)
console.log()

const results = await getCompetitorBacklinks({ competitor, limit: 8 })
console.log(`Got ${results.length} candidate backlink sources.`)
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.domain}] DA=${r.domainAuthority ?? "?"} ${r.title.slice(0, 60)}`)
})

if (results.length === 0) {
  console.error("\nFAIL: 0 results.")
  process.exit(1)
}
console.log("\nCOMPETITOR BACKLINKS PASS")