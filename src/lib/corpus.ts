import { supabaseAdmin } from "@/lib/db"
import { scrapeSerp } from "@/lib/scraper"
import { getMozMetrics } from "@/lib/moz"
import { verifyLinkTarget } from "@/lib/link-verifier"
import pLimit from "p-limit"

const SERP_TTL_DAYS = 30
const DA_TTL_DAYS = 90
const MIN_CACHED_RESULTS = 10
const VERIFIED_MENTION_TTL_DAYS = 60

const LINKABLE_TITLE_RE = /2024|2025|2026|best|top|review|vs|alternative|guide|resources|list|roundup|tools|directory|recommended|ultimate|complete/i

export function buildProspectQuery(keyword: string): string {
  return `"${keyword}" resources OR tools OR sites OR directory OR recommended OR list OR roundup OR "best" OR "top"`
}

export function buildCompetitorBacklinkQuery(competitor: string): string {
  const bare = competitor
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
  return `"${bare}" roundup OR "best of" OR "alternatives to" OR list OR review OR "vs"`
}

function isLikelyCompetitor(domain: string, keyword: string): boolean {
  const bare = keyword.toLowerCase().replace(/\s+/g, "")
  if (bare.length < 4) return false
  return domain.toLowerCase().includes(bare)
}

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

export type SerpQueryKind = "keyword" | "competitor"

async function readCachedSerp(keywordNorm: string, queryKind: SerpQueryKind = "keyword") {
  const { data } = await supabaseAdmin
    .from("prospect_serp_cache")
    .select("*")
    .eq("query_kind", queryKind)
    .eq("keyword_norm", keywordNorm)
    .gt("fetched_at", daysAgo(SERP_TTL_DAYS))
    .order("position", { ascending: true })
  return data || []
}

/**
 * Row count of the fresh SERP cache for a key. Callers use this to skip
 * budget enforcement when a query will be served entirely from cache.
 * `key` must be pre-normalized (keyword: normalizeKeyword; competitor: bare domain).
 */
export async function getCachedSerpRowCount(
  key: string,
  queryKind: SerpQueryKind,
): Promise<number> {
  const rows = await readCachedSerp(key, queryKind)
  return rows.length
}

async function writeSerpCache(
  keywordNorm: string,
  results: { url: string; title: string; description: string; domain: string }[],
  queryKind: SerpQueryKind = "keyword",
) {
  if (results.length === 0) return
  const rows = results.map((r, i) => ({
    query_kind: queryKind,
    keyword_norm: keywordNorm,
    url: r.url,
    domain: r.domain,
    title: r.title || null,
    description: r.description || null,
    position: i,
    fetched_at: new Date().toISOString(),
  }))
  await supabaseAdmin.from("prospect_serp_cache").upsert(rows, {
    onConflict: "query_kind,keyword_norm,url",
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

export interface ProspectForKeyword {
  url: string
  title: string
  description: string
  domain: string
  domainAuthority: number | null
  position: number | null
}

/**
 * Fetch prospects for a keyword using the roundup/list-focused query.
 * Prefers linkable pages (roundups, guides, resource pages) over direct
 * competitor product pages.
 *
 * Cache-first (zero-cost mission): the shared SERP cache is consulted before
 * any Tavily call, and fresh scrapes are written back so repeat searches for
 * the same keyword are $0. NOTE: this function previously scraped Tavily on
 * every call despite the docstring claiming cache-first — fixed in Phase 2.
 */
export interface ProspectSearchResult {
  results: ProspectForKeyword[]
  /** "cache" = no external API was called; "tavily" = one paid-quota search happened. */
  source: "cache" | "tavily" | "none"
}

export async function searchProspects(keyword: string): Promise<ProspectSearchResult> {
  const kw = normalizeKeyword(keyword)

  let rows = await readCachedSerp(kw)
  let source: ProspectSearchResult["source"] = "cache"

  if (rows.length < MIN_CACHED_RESULTS) {
    const scraped = await scrapeSerp(buildProspectQuery(kw))
    if (scraped.length > 0) {
      await writeSerpCache(kw, scraped)
      rows = await readCachedSerp(kw)
      source = "tavily"
    } else {
      source = "none"
    }
  }

  const raw = rows.map((r) => ({
    url: String(r.url),
    title: r.title || "",
    description: r.description || "",
    domain: String(r.domain),
  }))

  const linkable = raw.filter((r) => {
    const looksLinkable = LINKABLE_TITLE_RE.test(r.title)
    const looksCompetitor = isLikelyCompetitor(r.domain, kw)
    return looksLinkable || !looksCompetitor
  })

  const chosen = linkable.length > 0 ? linkable : raw

  const domains = Array.from(new Set(chosen.map((r) => r.domain)))
  const facts = await getDomainFacts(domains)

  return {
    source,
    results: chosen.map((r, i) => ({
      url: r.url,
      title: r.title,
      description: r.description,
      domain: r.domain,
      domainAuthority: facts[r.domain]?.domain_authority ?? null,
      position: i,
    })),
  }
}

export async function getProspectsForKeyword(
  keyword: string,
): Promise<ProspectForKeyword[]> {
  return (await searchProspects(keyword)).results
}

export interface CompetitorBacklink {
  url: string
  title: string
  description: string
  domain: string
  domainAuthority: number | null
  position: number | null
  /** True only when the page was fetched and confirmed to hyperlink to the competitor. */
  verified: boolean
  anchorText: string | null
  rel: "dofollow" | "nofollow" | null
  linkUrl: string | null
}

export interface CompetitorBacklinksResult {
  /** Pages fetch-verified to contain a live link to the competitor. Dofollow first. */
  verified: CompetitorBacklink[]
  /** Pages that could not be fetched (403/429/timeout) — status unknown, clearly separated. */
  unverified: CompetitorBacklink[]
  /** Pages fetched successfully that contain NO link to the competitor (dropped). */
  droppedNoLink: number
  stats: {
    serpSource: "cache" | "tavily" | "none"
    verificationCacheHits: number
    pagesFetched: number
  }
}

interface VerifiedMentionRow {
  url: string
  target_domain: string
  links_to_target: boolean
  anchor_text: string | null
  rel: "dofollow" | "nofollow" | null
  link_url: string | null
  http_status: number | null
  unverifiable: boolean
  verified_at: string
}

/** Normalize for dedupe: lowercase host, strip www. and trailing slash. */
function normalizeUrlForDedupe(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    const path = u.pathname.replace(/\/+$/, "") || "/"
    return `${host}${path}${u.search}`
  } catch {
    return url.toLowerCase()
  }
}

/** Drop http/https and www. duplicates of the same page; keep the best-positioned row. */
function dedupeByUrl<T extends { url: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const key = normalizeUrlForDedupe(String(r.url))
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Find pages that actually link to a competitor — fetch-verified, never just
 * mention-matched. Flow (each tier cheaper than the next):
 *   1. SERP candidates from the shared cache (query_kind='competitor'), Tavily on miss.
 *   2. verified_mentions cache answers "does this page link to X?" for repeat queries.
 *   3. Only cache misses are fetched live (concurrency-capped, one attempt).
 * Pages confirmed to have no link are dropped; unfetchable pages are returned
 * separately as unverified rather than silently mixed in.
 */
export async function getCompetitorBacklinks(opts: {
  competitor: string
  excludeDomains?: string[]
  limit?: number
}): Promise<CompetitorBacklinksResult> {
  const competitorDomain = opts.competitor
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .toLowerCase()

  const empty: CompetitorBacklinksResult = {
    verified: [],
    unverified: [],
    droppedNoLink: 0,
    stats: { serpSource: "none", verificationCacheHits: 0, pagesFetched: 0 },
  }

  // --- Tier 1: SERP candidates, cache-first -------------------------------
  let rows = await readCachedSerp(competitorDomain, "competitor")
  let serpSource: CompetitorBacklinksResult["stats"]["serpSource"] = "cache"
  if (rows.length === 0) {
    const scraped = await scrapeSerp(buildCompetitorBacklinkQuery(competitorDomain))
    if (scraped.length > 0) {
      await writeSerpCache(competitorDomain, scraped, "competitor")
      rows = await readCachedSerp(competitorDomain, "competitor")
      serpSource = "tavily"
    } else {
      serpSource = "none"
    }
  }
  if (rows.length === 0) return empty

  const exclude = new Set(
    [competitorDomain, ...(opts.excludeDomains || [])].map((d) => d.toLowerCase()),
  )
  const candidates = dedupeByUrl(
    rows.filter((r) => !exclude.has(String(r.domain).toLowerCase())),
  )
  if (candidates.length === 0) return empty

  // --- Tier 2: verification cache -----------------------------------------
  const urls = candidates.map((r) => String(r.url))
  const { data: cachedVerifications } = await supabaseAdmin
    .from("verified_mentions")
    .select("*")
    .eq("target_domain", competitorDomain)
    .in("url", urls)
    .gt("verified_at", daysAgo(VERIFIED_MENTION_TTL_DAYS))

  const verdictByUrl = new Map<string, VerifiedMentionRow>()
  for (const row of (cachedVerifications || []) as VerifiedMentionRow[]) {
    verdictByUrl.set(row.url, row)
  }
  const cacheHits = verdictByUrl.size

  // --- Tier 3: live fetches for cache misses only --------------------------
  const misses = candidates.filter((r) => !verdictByUrl.has(String(r.url)))
  const limiter = pLimit(4)
  const fresh = await Promise.all(
    misses.map((r) => limiter(() => verifyLinkTarget(String(r.url), competitorDomain))),
  )

  if (fresh.length > 0) {
    const now = new Date().toISOString()
    await supabaseAdmin.from("verified_mentions").upsert(
      fresh.map((v) => ({
        url: v.url,
        target_domain: competitorDomain,
        links_to_target: v.linksToTarget,
        anchor_text: v.anchorText,
        rel: v.rel,
        link_url: v.linkUrl,
        http_status: v.httpStatus,
        unverifiable: v.unverifiable,
        verified_at: now,
      })),
      { onConflict: "url,target_domain" },
    )
    for (const v of fresh) {
      verdictByUrl.set(v.url, {
        url: v.url,
        target_domain: competitorDomain,
        links_to_target: v.linksToTarget,
        anchor_text: v.anchorText,
        rel: v.rel,
        link_url: v.linkUrl,
        http_status: v.httpStatus,
        unverifiable: v.unverifiable,
        verified_at: now,
      })
    }
  }

  // --- Split by verdict ----------------------------------------------------
  interface CandidateRow {
    url: string
    title: string | null
    description: string | null
    domain: string
    position: number | null
  }
  const keep: { row: CandidateRow; verdict: VerifiedMentionRow }[] = []
  let droppedNoLink = 0
  for (const row of candidates as CandidateRow[]) {
    const verdict = verdictByUrl.get(row.url)
    if (!verdict) continue
    if (!verdict.links_to_target && !verdict.unverifiable) {
      droppedNoLink++
      continue
    }
    keep.push({ row, verdict })
  }
  if (keep.length === 0) {
    return { ...empty, droppedNoLink, stats: { serpSource, verificationCacheHits: cacheHits, pagesFetched: fresh.length } }
  }

  // DA enrichment only for rows we are about to return — not every candidate.
  const limit = Math.min(50, Math.max(1, opts.limit || 20))
  const verifiedFirst = keep.sort((a, b) => {
    const aScore = a.verdict.links_to_target ? (a.verdict.rel === "dofollow" ? 2 : 1) : 0
    const bScore = b.verdict.links_to_target ? (b.verdict.rel === "dofollow" ? 2 : 1) : 0
    return bScore - aScore
  })

  // One prospect per domain — you pitch a site once, not once per page.
  // A domain with a verified page never appears in `unverified` too.
  const seenDomains = new Set<string>()
  const deduped = verifiedFirst.filter((k) => {
    const d = k.row.domain.toLowerCase()
    if (seenDomains.has(d)) return false
    seenDomains.add(d)
    return true
  })
  const chosen = deduped.slice(0, limit)

  const domains = Array.from(new Set(chosen.map((k) => k.row.domain)))
  const facts = await getDomainFacts(domains)

  const toBacklink = ({ row, verdict }: { row: CandidateRow; verdict: VerifiedMentionRow }): CompetitorBacklink => ({
    url: row.url,
    title: row.title || "",
    description: row.description || "",
    domain: row.domain,
    domainAuthority: facts[row.domain]?.domain_authority ?? null,
    position: row.position,
    verified: verdict.links_to_target,
    anchorText: verdict.anchor_text,
    rel: verdict.rel,
    linkUrl: verdict.link_url,
  })

  const verified = chosen.filter((k) => k.verdict.links_to_target).map(toBacklink)
  const unverified = chosen.filter((k) => !k.verdict.links_to_target).map(toBacklink)

  return {
    verified,
    unverified,
    droppedNoLink,
    stats: { serpSource, verificationCacheHits: cacheHits, pagesFetched: fresh.length },
  }
}
