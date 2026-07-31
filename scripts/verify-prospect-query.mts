// scripts/verify-prospect-query.mts
// Sanity: prove getProspectsForKeyword returns real, linkable-looking results.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-prospect-query.mts
import { getProspectsForKeyword, buildProspectQuery } from "@/lib/corpus"

const keyword = process.argv[2] || "link building tools"
console.log(`buildProspectQuery("${keyword}") =`)
console.log(`  ${buildProspectQuery(keyword)}`)
console.log()

const results = await getProspectsForKeyword(keyword)
console.log(`Got ${results.length} prospects.`)
results.slice(0, 5).forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.domain}] DA=${r.domainAuthority ?? "?"} ${r.title.slice(0, 60)}`)
})

if (results.length === 0) {
  console.error("\nFAIL: 0 results.")
  process.exit(1)
}
console.log("\nPROSPECT QUERY PASS")
