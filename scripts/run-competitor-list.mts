// scripts/run-competitor-list.mts
// Produce a competitor-backlink prospect list for one domain, printing
// verified linkers (dofollow first) plus run stats. Never exits non-zero on
// empty results — an empty list is a valid answer (wrong domain / no data).
// Run: cd linklight && npx tsx --env-file=.env.local scripts/run-competitor-list.mts <domain> [limit]
import { getCompetitorBacklinks } from "@/lib/corpus"

const competitor = process.argv[2]
if (!competitor) {
  console.error("usage: run-competitor-list.mts <domain> [limit]")
  process.exit(2)
}
const limit = Number(process.argv[3] || 20)

const res = await getCompetitorBacklinks({ competitor, limit })

console.log(`# ${competitor}`)
console.log(
  `stats: serp=${res.stats.serpSource} ccLinkingDomains=${res.stats.ccLinkingDomains} ` +
    `verificationCacheHits=${res.stats.verificationCacheHits} pagesFetched=${res.stats.pagesFetched} ` +
    `droppedNoLink=${res.droppedNoLink}`,
)
console.log(`verified=${res.verified.length} unverified=${res.unverified.length}`)
console.log()
res.verified.forEach((r, i) => {
  console.log(
    `${i + 1}. ${r.domain} | DA=${r.domainAuthority ?? "?"} | ${r.rel ?? "?"} | ` +
      `anchor="${(r.anchorText || "").slice(0, 60)}"`,
  )
  console.log(`   page: ${r.url}`)
  console.log(`   title: ${r.title.slice(0, 90)}`)
  console.log(`   link: ${r.linkUrl ?? "?"}`)
})
if (res.unverified.length > 0) {
  console.log()
  console.log(`unverifiable (fetch blocked/timeout — status unknown):`)
  res.unverified.forEach((r) => console.log(`  - ${r.domain} ${r.url}`))
}
