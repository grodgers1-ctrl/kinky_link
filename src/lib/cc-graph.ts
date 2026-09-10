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

/** Domains known to link to `targetDomain`, from the most recent imported crawl. */
export async function getCcLinkingDomains(targetDomain: string): Promise<CcLinkingDomain[]> {
  const { data, error } = await supabaseAdmin
    .from("cc_link_graph")
    .select("source_domain, crawl_id")
    .eq("target_domain", targetDomain)
    .order("crawl_id", { ascending: false })
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

let cachedIndexId: string | null = null

/** Latest CC crawl index id (e.g. "CC-MAIN-2026-34"), cached per process. */
async function latestCcIndexId(): Promise<string | null> {
  if (cachedIndexId) return cachedIndexId
  try {
    const res = await fetch("https://index.commoncrawl.org/collinfo.json", {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const collinfo = (await res.json()) as { id?: string }[]
    cachedIndexId = collinfo?.[0]?.id ?? null
    return cachedIndexId
  } catch {
    return null
  }
}

/**
 * Candidate page URLs on `domain` (incl. subdomains) from the CC index.
 * Free API, no key. Returns at most `limit` urls, preferring HTML pages.
 */
export async function ccIndexPageUrls(domain: string, limit = 3): Promise<string[]> {
  const indexId = await latestCcIndexId()
  if (!indexId) return []
  try {
    const params = new URLSearchParams({
      url: `*.${domain}/*`,
      output: "json",
      filter: "status:200",
      collapse: "urlkey",
      limit: String(limit * 3), // overfetch; we filter below
    })
    const res = await fetch(`https://index.commoncrawl.org/${indexId}-index?${params}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
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
    return []
  }
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

/**
 * Resolve a linking domain to candidate page URLs to verify: known cached
 * URLs first (zero network), then the CC index API.
 */
export async function resolveCandidateUrls(domain: string, limit = 3): Promise<string[]> {
  const known = await knownUrlsForDomain(domain, limit)
  if (known.length >= limit) return known.slice(0, limit)
  const fromIndex = await ccIndexPageUrls(domain, limit - known.length)
  return [...known, ...fromIndex]
}
