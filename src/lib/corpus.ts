import { supabaseAdmin } from "@/lib/db"
import { scrapeSerp } from "@/lib/scraper"
import { getMozMetrics } from "@/lib/moz"

const SERP_TTL_DAYS = 30
const DA_TTL_DAYS = 90
const MIN_CACHED_RESULTS = 10

export interface CorpusProspect {
  url: string
  title: string | null
  description: string | null
  domain: string
  position: number | null
  domainAuthority: number | null
}

export function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().trim().replace(/\s+/g, " ")
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

async function readCachedSerp(keywordNorm: string) {
  const { data } = await supabaseAdmin
    .from("prospect_serp_cache")
    .select("*")
    .eq("keyword_norm", keywordNorm)
    .gt("fetched_at", daysAgo(SERP_TTL_DAYS))
    .order("position", { ascending: true })
  return data || []
}

async function writeSerpCache(
  keywordNorm: string,
  results: { url: string; title: string; description: string; domain: string }[],
) {
  if (results.length === 0) return
  const rows = results.map((r, i) => ({
    keyword_norm: keywordNorm,
    url: r.url,
    domain: r.domain,
    title: r.title || null,
    description: r.description || null,
    position: i,
    fetched_at: new Date().toISOString(),
  }))
  await supabaseAdmin.from("prospect_serp_cache").upsert(rows, {
    onConflict: "keyword_norm,url",
  })
}

export async function getSerpForKeyword(keyword: string): Promise<CorpusProspect[]> {
  const kw = normalizeKeyword(keyword)

  let rows = await readCachedSerp(kw)

  if (rows.length < MIN_CACHED_RESULTS) {
    const scraped = await scrapeSerp(keyword)
    if (scraped.length > 0) {
      await writeSerpCache(kw, scraped)
      rows = await readCachedSerp(kw)
    }
  }

  const domains = Array.from(new Set(rows.map((r) => r.domain)))
  const facts = await getDomainFacts(domains)

  return rows.map((r) => ({
    url: r.url,
    title: r.title,
    description: r.description,
    domain: r.domain,
    position: r.position,
    domainAuthority: facts[r.domain]?.domain_authority ?? null,
  }))
}

async function readDomainFacts(domains: string[]) {
  if (domains.length === 0) return []
  const { data } = await supabaseAdmin
    .from("domain_facts")
    .select("*")
    .in("domain", domains)
  return data || []
}

export async function getDomainFacts(
  domains: string[],
): Promise<Record<string, { domain_authority: number | null }>> {
  if (domains.length === 0) return {}

  const existing = await readDomainFacts(domains)
  const byDomain: Record<string, { domain_authority: number | null; da_fetched_at: string | null }> = {}
  for (const row of existing) {
    byDomain[row.domain] = {
      domain_authority: row.domain_authority ?? null,
      da_fetched_at: row.da_fetched_at ?? null,
    }
  }

  const staleThreshold = daysAgo(DA_TTL_DAYS)
  const needsFetch = domains.filter((d) => {
    const row = byDomain[d]
    if (!row) return true
    if (row.domain_authority == null) return true
    if (!row.da_fetched_at) return true
    return row.da_fetched_at < staleThreshold
  })

  if (needsFetch.length > 0) {
    const fetched = await Promise.all(
      needsFetch.map(async (domain) => {
        try {
          const moz = await getMozMetrics(domain)
          return { domain, domain_authority: moz.domainAuthority ?? null }
        } catch {
          return { domain, domain_authority: null }
        }
      }),
    )
    const now = new Date().toISOString()
    const upserts = fetched.map((f) => ({
      domain: f.domain,
      domain_authority: f.domain_authority,
      da_fetched_at: now,
      last_seen_at: now,
    }))
    await supabaseAdmin.from("domain_facts").upsert(upserts, { onConflict: "domain" })
    for (const f of fetched) {
      byDomain[f.domain] = { domain_authority: f.domain_authority, da_fetched_at: now }
    }
  }

  await bumpSeenCount(domains)

  const out: Record<string, { domain_authority: number | null }> = {}
  for (const d of domains) {
    out[d] = { domain_authority: byDomain[d]?.domain_authority ?? null }
  }
  return out
}

async function bumpSeenCount(domains: string[]) {
  if (domains.length === 0) return
  const now = new Date().toISOString()
  const rows = domains.map((domain) => ({
    domain,
    last_seen_at: now,
  }))
  // Best-effort: only updates last_seen_at on existing rows; seen_count increments
  // are handled by a Postgres function if present, otherwise skip silently.
  await supabaseAdmin.from("domain_facts").upsert(rows, {
    onConflict: "domain",
    ignoreDuplicates: false,
  })
}
