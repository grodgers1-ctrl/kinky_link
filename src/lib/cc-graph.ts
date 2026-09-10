// Common Crawl link-graph tier — the free backlink index.
//
// The quarterly import (scripts/import-cc-graph.mts) extracts edges for
// queried competitor domains from CC's public domain-level web graph into
// cc_link_graph. At query time this module:
//   1. tracks which competitor domains users ask about (cc_targets) — the
//      import only processes these, so storage stays tiny;
//   2. looks up known linking domains for a competitor;
//   3. resolves each linking domain to a concrete page URL — first from our
//      own caches (free), then from the CC index API (free) — so the standard
//      verification pipeline can confirm the exact linking page + anchor.

import { supabaseAdmin } from "@/lib/db"

const USER_AGENT = "linklight-verifier/1.0 (+https://lightlinks.dev)"

export interface CcLinkingDomain {
  source_domain: string
  crawl_id: string
}

/** Record that a user asked about this competitor. Fire-and-forget safe. */
export async function trackCompetitorQuery(targetDomain: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from("cc_targets")
    .upsert(
      { target_domain: targetDomain, last_queried_at: now },
      { onConflict: "target_domain" },
    )
  if (error) console.error("trackCompetitorQuery failed:", error.message)
}

/** Domains known to link to `targetDomain`, most authoritative (CC harmonic centrality) first. */
export async function getCcLinkingDomains(targetDomain: string): Promise<CcLinkingDomain[]> {
  const { data, error } = await supabaseAdmin
    .from("cc_link_graph")
    .select("source_domain, crawl_id")
    .eq("target_domain", targetDomain)
    .order("source_rank", { ascending: false, nullsFirst: false })
    .limit(500)
  if (error) {
    console.error("getCcLinkingDomains failed:", error.message)
    return []
  }
  return data || []
}

// --- Page-URL resolution -----------------------------------------------------

interface CcIndexRecord {
  url?: string
  status?: string
  mime?: string
}

let cachedIndexIds: string[] | null = null

/**
 * Recent CC crawl index ids, newest first (e.g. ["CC-MAIN-2026-34", ...]).
 * Cached per process. Multiple ids matter: the web graph is built from
 * May–Jul crawls while the latest index may be August — a linker crawled in
 * June won't appear in the August index, so resolution must walk back.
 */
async function recentCcIndexIds(n = 4): Promise<string[]> {
  if (cachedIndexIds) return cachedIndexIds.slice(0, n)
  try {
    const res = await fetch("https://index.commoncrawl.org/collinfo.json", {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const collinfo = (await res.json()) as { id?: string }[]
    cachedIndexIds = (collinfo || []).map((c) => c.id).filter((x): x is string => !!x)
    return cachedIndexIds.slice(0, n)
  } catch {
    return []
  }
}

/** One index query with a single retry — the CC index API is intermittently unreliable. */
async function queryIndexOnce(indexId: string, domain: string, limit: number): Promise<string[] | null> {
  try {
    const params = new URLSearchParams({
      url: `*.${domain}/*`,
      output: "json",
      filter: "status:200",
      collapse: "urlkey",
      limit: String(limit * 3), // overfetch; we filter below
    })
    const res = await fetch(`https://index.commoncrawl.org/${indexId}-index?${params}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": USER_AGENT },
    })
    if (res.status === 404) return [] // legitimately no captures in this index
    if (!res.ok) return null // transient — retry/fall through
    const text = await res.text()
    const urls: string[] = []
    for (const line of text.split("\n")) {
      if (!line.trim()) continue
      try {
        const rec = JSON.parse(line) as CcIndexRecord
        if (rec.url && (!rec.mime || rec.mime.includes("html"))) urls.push(rec.url)
      } catch {
        // skip malformed index lines
      }
      if (urls.length >= limit) break
    }
    return urls
  } catch {
    return null
  }
}

// Module-level health flag: after consecutive transient failures the index API
// is treated as down for the rest of this process, so one bad endpoint can't
// multiply latency across every domain in a batch.
let indexConsecutiveFailures = 0
let indexDown = false

/**
 * Candidate page URLs on `domain` (incl. subdomains) from the CC index.
 * Free API, no key. Tries the most recent crawl indexes in turn — older
 * indexes often hold captures of linkers the newest crawl skipped.
 */
export async function ccIndexPageUrls(domain: string, limit = 3): Promise<string[]> {
  if (indexDown) return []
  const indexIds = await recentCcIndexIds(4)
  for (const indexId of indexIds) {
    let urls = await queryIndexOnce(indexId, domain, limit)
    if (urls === null) {
      await new Promise((r) => setTimeout(r, 2_000))
      urls = await queryIndexOnce(indexId, domain, limit)
    }
    if (urls === null) {
      indexConsecutiveFailures++
      if (indexConsecutiveFailures >= 3) {
        indexDown = true
        console.warn("CC index API marked down for this process after repeated transient failures.")
        return []
      }
      continue
    }
    indexConsecutiveFailures = 0
    if (urls.length > 0) return urls
  }
  return []
}

/** URLs we already know for a domain (SERP cache + verifications) — free. */
export async function knownUrlsForDomain(domain: string, limit = 3): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("prospect_serp_cache")
    .select("url")
    .eq("domain", domain)
    .order("fetched_at", { ascending: false })
    .limit(limit)
  if (error) {
    console.error("knownUrlsForDomain failed:", error.message)
    return []
  }
  return (data || []).map((r) => String(r.url))
}

const RESOLUTION_TTL_DAYS = 60
/** Hard ceiling per domain so a slow CC index can't stall the whole query. */
const RESOLUTION_DEADLINE_MS = 25_000

/** Previously resolved page URLs for a domain, while fresh. */
async function cachedDomainPages(domain: string, limit: number): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("cc_domain_pages")
    .select("url")
    .eq("domain", domain)
    .gt("resolved_at", new Date(Date.now() - RESOLUTION_TTL_DAYS * 86_400_000).toISOString())
    .order("resolved_at", { ascending: false })
    .limit(limit)
  if (error) {
    console.error("cachedDomainPages failed:", error.message)
    return []
  }
  return (data || []).map((r) => String(r.url))
}

/**
 * Resolve a linking domain to candidate page URLs to verify. Cheap sources
 * first: our SERP cache → cc_domain_pages resolution cache → live CC index
 * (bounded by a hard deadline; results cached for 60 days). If the index has
 * nothing, fall back to the domain's homepage — badges, partner links and
 * blogrolls live there, and verification will confirm either way.
 */
export async function resolveCandidateUrls(domain: string, limit = 3): Promise<string[]> {
  const known = await knownUrlsForDomain(domain, limit)
  if (known.length >= limit) return known.slice(0, limit)

  const cached = await cachedDomainPages(domain, limit - known.length)
  const found = [...known, ...cached]
  if (found.length >= limit) return found.slice(0, limit)

  const remaining = limit - found.length
  const fromIndex = await Promise.race([
    ccIndexPageUrls(domain, remaining),
    new Promise<string[]>((resolve) => setTimeout(() => resolve([]), RESOLUTION_DEADLINE_MS)),
  ])
  if (fromIndex.length > 0) {
    await supabaseAdmin.from("cc_domain_pages").upsert(
      fromIndex.map((url) => ({ domain, url, resolved_at: new Date().toISOString() })),
      { onConflict: "domain,url" },
    )
  }
  const resolved = [...found, ...fromIndex]
  if (resolved.length === 0) {
    // No cached or indexed page: offer the homepage as the last-resort
    // candidate. Verification decides whether it actually links.
    return [`https://${domain}/`]
  }
  return resolved
}
