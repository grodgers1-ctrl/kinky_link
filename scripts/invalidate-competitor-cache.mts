// scripts/invalidate-competitor-cache.mts
// Delete cached competitor SERP rows for the given domains so the next
// find_competitor_backlinks run re-scrapes with the current query builder.
// Run: npx tsx --env-file=.env.local scripts/invalidate-competitor-cache.mts <domain> [domain...]
import { supabaseAdmin } from "@/lib/db"

const domains = process.argv.slice(2).map((d) => d.toLowerCase())
if (domains.length === 0) {
  console.error("usage: invalidate-competitor-cache.mts <domain> [domain...]")
  process.exit(2)
}

const { error, count } = await supabaseAdmin
  .from("prospect_serp_cache")
  .delete({ count: "exact" })
  .eq("query_kind", "competitor")
  .in("keyword_norm", domains)

if (error) {
  console.error("delete failed:", error.message)
  process.exit(1)
}
console.log(`deleted ${count ?? "?"} cached competitor SERP rows for: ${domains.join(", ")}`)
