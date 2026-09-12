import { supabaseAdmin } from "@/lib/db"
import { scrapeSerp } from "@/lib/scraper"
import { getMozMetrics, mozConfigured } from "@/lib/moz"
import { verifyLinkTarget } from "@/lib/link-verifier"
import { trackCompetitorQuery, getCcLinkingDomains, resolveCandidateUrls } from "@/lib/cc-graph"
import { isPlatformDomain } from "@/lib/platform-blocklist"
import pLimit from "p-limit"

const SERP_TTL_DAYS = 30
const DA_TTL_DAYS = 90
const MIN_CACHED_RESULTS = 10
const VERIFIED_MENTION_TTL_DAYS = 60
// Moz free tier is 50 rows/month account-wide; stay under it with headroom.
const MOZ_MONTHLY_ROW_LIMIT = Number(process.env.LL_MOZ_MONTHLY_ROW_LIMIT) || 45
// Max CC linking domains resolved per find_competitor_backlinks call.
const CC_RESOLVE_CAP = 15

const LINKABLE_TITLE_RE = /2024|2025|2026|best|top|review|vs|alternative|guide|resources|list|roundup|tools|directory|recommended|ultimate|complete/i

export function buildProspectQuery(keyword: string): string {
  return `"${keyword}" resources OR tools OR sites OR directory OR recommended OR list OR roundup OR "best" OR "top"`
}

export function buildCompetitorBacklinkQuery(competitor: string): string {
  const bare = competitor
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
  return `"${bare}" review`
}

/** Exact match or subdomain of an excluded domain (help.foo.com ⊂ foo.com). */
function isExcludedDomain(domain: string, exclude: Set<string>): boolean {
  const d = domain.toLowerCase()
  for (const ex of exclude) {
    if (d === ex || d.endsWith(`.${ex}`)) return true
  }
  return false
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

  if (needsFetch.length > 0 && mozConfigured()) {
    // Monthly circuit breaker: Moz bills 1 row per url_metrics call and the
    // free tier is 50 rows/month account-wide. Never exceed the cap; degrade
    // to domain_authority: null instead of failing.
    const month = new Date().toISOString().slice(0, 7)
    const { data: usageRow } = await supabaseAdmin
      .from("provider_usage")
      .select("rows")
      .eq("provider", "moz")
      .eq("month", month)
      .maybeSingle()
    const usedRows = usageRow?.rows ?? 0
    const remaining = Math.max(0, MOZ_MONTHLY_ROW_LIMIT - usedRows)
    if (remaining === 0) {
      console.warn(`Moz monthly circuit breaker hit (${usedRows}/${MOZ_MONTHLY_ROW_LIMIT} rows in ${month}) — DA lookups skipped.`)
    }
    const toFetch = needsFetch.slice(0, remaining)

    if (toFetch.length > 0) {
      const fetched = await Promise.all(
        toFetch.map(async (domain) => {
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
      await supabaseAdmin.rpc("bump_provider_usage", {
        p_provider: "moz",
        p_month: month,
        p_rows: toFetch.length,
      })
      for (const f of fetched) {
        byDomain[f.domain] = { domain_authority: f.domain_authority, da_fetched_at: now }
      }
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
    /** Domains the Common Crawl graph knows link to the competitor (pre-exclusion filter). */
    ccLinkingDomains: number
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
  page_title: string | null
  unverifiable: boolean
  verified_at: string
}

interface CandidateRow {
  url: string
  title: string | null
  description: string | null
  domain: string
  position: number | null
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
 *   0. Common Crawl domain link graph (real link data, free) — domains known
 *      to link to the competitor are resolved to page URLs via our caches or
 *      the free CC index API.
 *   1. SERP candidates from the shared cache (query_kind='competitor');
 *      Tavily only when both the cache and the CC graph have little to say.
 *   2. verified_mentions cache answers "does this page link to X?" for repeats.
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
    stats: { serpSource: "none", ccLinkingDomains: 0, verificationCacheHits: 0, pagesFetched: 0 },
  }

  // Track the query so the quarterly CC import knows which targets to extract.
  await trackCompetitorQuery(competitorDomain)

  const exclude = new Set(
    [competitorDomain, ...(opts.excludeDomains || [])].map((d) => d.toLowerCase()),
  )

  // --- Tier 0: Common Crawl domain link graph (free, real link data) -------
  let ccCandidates: CandidateRow[] = []
  let ccLinkingDomains = 0
  try {
    const linking = await getCcLinkingDomains(competitorDomain)
    const freshSources = linking.filter(
      (l) => !isExcludedDomain(l.source_domain, exclude) && !isPlatformDomain(l.source_domain),
    )
    ccLinkingDomains = freshSources.length
    const ccLimiter = pLimit(4)
    const resolved = await Promise.all(
      freshSources.slice(0, CC_RESOLVE_CAP).map((l) =>
        ccLimiter(async () => {
          const urls = await resolveCandidateUrls(l.source_domain, 2)
          return urls.map(
            (url): CandidateRow => ({
              url,
              title: null,
              description: null,
              domain: l.source_domain,
              position: null,
            }),
          )
        }),
      ),
    )
    ccCandidates = resolved.flat()
  } catch (error) {
    console.error("CC graph tier failed (continuing with SERP tier):", error)
  }

  // --- Tier 1: SERP candidates, cache-first -------------------------------
  // Skip the paid-quota Tavily call when the CC graph already has plenty to
  // say — real link data beats mention-search anyway.
  let rows = await readCachedSerp(competitorDomain, "competitor")
  let serpSource: CompetitorBacklinksResult["stats"]["serpSource"] = "cache"
  if (rows.length === 0) {
    if (ccCandidates.length >= 5) {
      serpSource = "none"
    } else {
      const scraped = await scrapeSerp(buildCompetitorBacklinkQuery(competitorDomain))
      if (scraped.length > 0) {
        await writeSerpCache(competitorDomain, scraped, "competitor")
        rows = await readCachedSerp(competitorDomain, "competitor")
        serpSource = "tavily"
      } else {
        serpSource = "none"
      }
    }
  }

  const serpCandidates = (rows as CandidateRow[]).filter(
    (r) => !isExcludedDomain(String(r.domain), exclude) && !isPlatformDomain(String(r.domain)),
  )
  // CC candidates first: verified real linkers take precedence in dedupe.
  // Backfill title/description from SERP rows so CC rows aren't title-less.
  const serpMeta = new Map(
    serpCandidates.map((r) => [normalizeUrlForDedupe(r.url), r] as const),
  )
  for (const cc of ccCandidates) {
    const meta = serpMeta.get(normalizeUrlForDedupe(cc.url))
    if (meta) {
      cc.title = cc.title || meta.title
      cc.description = cc.description || meta.description
      cc.position = cc.position ?? meta.position
    }
  }
  const candidates = dedupeByUrl([...ccCandidates, ...serpCandidates])
  if (candidates.length === 0) {
    return { ...empty, stats: { ...empty.stats, serpSource, ccLinkingDomains } }
  }

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
        page_title: v.pageTitle,
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
        page_title: v.pageTitle,
        unverifiable: v.unverifiable,
        verified_at: now,
      })
    }
  }

  // --- Split by verdict ----------------------------------------------------
  const keep: { row: CandidateRow; verdict: VerifiedMentionRow }[] = []
  let droppedNoLink = 0
  for (const row of candidates) {
    const verdict = verdictByUrl.get(row.url)
    if (!verdict) continue
    if (!verdict.links_to_target && !verdict.unverifiable) {
      droppedNoLink++
      continue
    }
    keep.push({ row, verdict })
  }
  if (keep.length === 0) {
    return { ...empty, droppedNoLink, stats: { serpSource, ccLinkingDomains, verificationCacheHits: cacheHits, pagesFetched: fresh.length } }
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
    title: row.title || verdict.page_title || "",
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
    stats: { serpSource, ccLinkingDomains, verificationCacheHits: cacheHits, pagesFetched: fresh.length },
  }
}
