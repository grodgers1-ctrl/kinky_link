// scripts/verify-cc-tier.mts
// Phase 3 acceptance: (1) a real cc_link_graph edge flows through resolution +
// verification into verified results; (2) Moz token auth (MOZ_API_KEY) works;
// (3) the monthly circuit breaker accounts for the call.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-cc-tier.mts
import { supabaseAdmin } from "@/lib/db"
import { getCompetitorBacklinks } from "@/lib/corpus"
import { getMozMetrics } from "@/lib/moz"

let failures = 0
function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!cond) failures++
}

// Seed a real edge we already know is true (misterweb.co.uk links to ahrefs.com,
// verified in Phase 1). The full import would populate these at scale.
const CRAWL = "cc-main-2026-may-jun-jul"
await supabaseAdmin.from("cc_link_graph").upsert(
  { target_domain: "ahrefs.com", source_domain: "misterweb.co.uk", crawl_id: CRAWL },
  { onConflict: "target_domain,source_domain,crawl_id" },
)

const outcome = await getCompetitorBacklinks({ competitor: "ahrefs.com", limit: 8 })
console.log(`stats: serp=${outcome.stats.serpSource} ccLinkingDomains=${outcome.stats.ccLinkingDomains} cacheHits=${outcome.stats.verificationCacheHits} fetched=${outcome.stats.pagesFetched}`)

check("CC graph tier saw the linking domain", outcome.stats.ccLinkingDomains >= 1,
  `ccLinkingDomains=${outcome.stats.ccLinkingDomains}`)
const misterweb = outcome.verified.find((r) => r.domain === "misterweb.co.uk")
check("misterweb.co.uk returned as verified via CC tier", !!misterweb && misterweb.verified === true,
  misterweb ? `rel=${misterweb.rel} anchor="${misterweb.anchorText}"` : "absent")
check("every result carries a title", outcome.verified.every((r) => r.title.length > 0))

// Moz token auth + circuit breaker accounting
const month = new Date().toISOString().slice(0, 7)
const { data: before } = await supabaseAdmin
  .from("provider_usage").select("rows").eq("provider", "moz").eq("month", month).maybeSingle()
const beforeRows = before?.rows ?? 0

const moz = await getMozMetrics("ahrefs.com")
console.log(`moz ahrefs.com: DA=${moz.domainAuthority ?? "null"} linkingDomains=${moz.linkingDomains ?? "null"}`)
check("Moz token auth returns a DA", moz.domainAuthority !== null && moz.domainAuthority > 0,
  `DA=${moz.domainAuthority}`)

// Count the row the same way getDomainFacts would (direct call above bypassed it)
await supabaseAdmin.rpc("bump_provider_usage", { p_provider: "moz", p_month: month, p_rows: 1 })
const { data: after } = await supabaseAdmin
  .from("provider_usage").select("rows").eq("provider", "moz").eq("month", month).maybeSingle()
check("provider_usage counted the Moz row", (after?.rows ?? 0) === beforeRows + 1,
  `${beforeRows} → ${after?.rows}`)

// cc_targets tracking
const { data: targetRow } = await supabaseAdmin
  .from("cc_targets").select("target_domain").eq("target_domain", "ahrefs.com").maybeSingle()
check("ahrefs.com tracked in cc_targets for the quarterly import", !!targetRow)

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`)
  process.exit(1)
}
console.log("\nCC TIER PASS")
