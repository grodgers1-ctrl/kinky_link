// Link verifier — fetch a candidate page and confirm it actually hyperlinks
// to a target domain. This is what turns "pages that mention X" (garbage)
// into "pages that link to X" (actionable outreach list).
//
// Cost notes (zero-cost mission):
// - A verification is a single plain HTTP GET — no paid API involved.
// - Results are cached in the verified_mentions table (see corpus.ts) with a
//   TTL, so repeat queries for the same (url, target) pair are $0.
// - Politeness: concurrency is capped by the caller (p-limit), one attempt
//   only, 403/429 are recorded as "unverifiable" and never retried in-band.

import * as cheerio from "cheerio"

const FETCH_TIMEOUT_MS = 8_000
const MAX_BODY_BYTES = 2 * 1024 * 1024
const USER_AGENT = "linklight-verifier/1.0 (+https://lightlinks.dev)"

export type RelKind = "dofollow" | "nofollow"

export interface LinkVerification {
  url: string
  /** The page contains at least one <a href> to the target domain. */
  linksToTarget: boolean
  /** Anchor text of the first matching link, trimmed. */
  anchorText: string | null
  /** rel classification of the first matching link. nofollow/sponsored/ugc → "nofollow". */
  rel: RelKind | null
  /** The actual href on the page that points at the target. */
  linkUrl: string | null
  /** HTTP status of the fetch, when a response was received. */
  httpStatus: number | null
  /** True when the page could not be fetched/parsed (403, 429, timeout, network). */
  unverifiable: boolean
}

/** Does `href` point at `targetDomain` (or a subdomain of it)? */
function hrefMatchesDomain(href: string, targetDomain: string, pageUrl: string): boolean {
  try {
    const resolved = new URL(href, pageUrl)
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return false
    const host = resolved.hostname.toLowerCase().replace(/^www\./, "")
    return host === targetDomain || host.endsWith(`.${targetDomain}`)
  } catch {
    return false
  }
}

function classifyRel(relAttr: string | undefined): RelKind {
  const rel = (relAttr || "").toLowerCase()
  return /\b(nofollow|sponsored|ugc)\b/.test(rel) ? "nofollow" : "dofollow"
}

/** Read a response body with a hard byte cap; returns null if it overflows. */
async function readBodyCapped(res: Response): Promise<string | null> {
  if (!res.body) return ""
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf)
}

/**
 * Fetch `url` and check whether the rendered HTML links to `targetDomain`.
 * Never throws — all failure modes return { unverifiable: true }.
 */
export async function verifyLinkTarget(
  url: string,
  targetDomain: string,
): Promise<LinkVerification> {
  const base: LinkVerification = {
    url,
    linksToTarget: false,
    anchorText: null,
    rel: null,
    linkUrl: null,
    httpStatus: null,
    unverifiable: true,
  }

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return base // DNS failure, timeout, TLS error, etc.
  }

  base.httpStatus = res.status
  if (!res.ok) return base // includes 403/429 — recorded, never retried

  const contentType = res.headers.get("content-type") || ""
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) return base

  let html: string | null
  try {
    html = await readBodyCapped(res)
  } catch {
    return base
  }
  if (html == null || html.length === 0) return base

  try {
    const $ = cheerio.load(html)

    for (const el of $("a[href]").toArray()) {
      const href = $(el).attr("href") || ""
      if (!hrefMatchesDomain(href, targetDomain, url)) continue
      return {
        ...base,
        linksToTarget: true,
        anchorText: $(el).text().replace(/\s+/g, " ").trim() || null,
        rel: classifyRel($(el).attr("rel")),
        linkUrl: href,
        unverifiable: false,
      }
    }
    // Fetched and parsed fine, but no link to the target: definitively not a backlink.
    return { ...base, unverifiable: false }
  } catch {
    return base
  }
}
