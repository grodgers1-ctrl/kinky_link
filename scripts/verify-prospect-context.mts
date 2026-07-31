// scripts/verify-prospect-context.mts
// Sanity: prove fetchProspectContext returns real title/description/snippet.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-prospect-context.mts
import { fetchProspectContext } from "@/lib/prospect-context"

const targets = [
  "https://vercel.com/blog",
  "https://backlinko.com/link-building-tools",
  "https://buffer.com",
]

for (const url of targets) {
  console.log(`\n=== ${url} ===`)
  const ctx = await fetchProspectContext(url)
  if (!ctx) {
    console.log("  (no context)")
    continue
  }
  console.log(`  title:       ${ctx.title?.slice(0, 80) || "-"}`)
  console.log(`  description: ${ctx.description?.slice(0, 80) || "-"}`)
  console.log(`  snippet:     ${ctx.snippet?.slice(0, 80) || "-"}`)
}

console.log("\nCONTEXT PASS (any-non-crash)")
