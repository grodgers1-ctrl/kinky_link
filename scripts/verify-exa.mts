// scripts/verify-exa.mts
// End-to-end sanity for exa.ts. Prints result counts from both endpoints.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-exa.mts
import { exaSearch, exaFindSimilar } from "@/lib/exa"

const search = await exaSearch("link building tools", { numResults: 5 })
console.log(`exaSearch: ${search.length} results`)
search.slice(0, 3).forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score?.toFixed(2)}] ${r.title.slice(0, 60)}`)
})

const similar = await exaFindSimilar("https://ahrefs.com", { numResults: 5 })
console.log(`\nexaFindSimilar: ${similar.length} results`)
similar.slice(0, 3).forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score?.toFixed(2)}] ${new URL(r.url).hostname}`)
})

if (search.length === 0 || similar.length === 0) {
  console.error("\nFAIL: one endpoint returned 0")
  process.exit(1)
}
console.log("\nEXA PASS")
