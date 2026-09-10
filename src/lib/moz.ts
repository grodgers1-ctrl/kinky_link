import * as crypto from "crypto"

// Two supported auth styles:
//  1. MOZ_API_KEY — current Moz API token, sent as the `x-moz-token` header.
//  2. MOZ_ACCESS_ID + MOZ_SECRET_KEY — legacy HMAC-signed Links API credentials.
// Every url_metrics call bills 1 row per target URL; the caller
// (corpus.getDomainFacts) enforces the monthly circuit breaker.

const MOZ_API_KEY = process.env.MOZ_API_KEY
const MOZ_ACCESS_ID = process.env.MOZ_ACCESS_ID!
const MOZ_SECRET_KEY = process.env.MOZ_SECRET_KEY!

interface MozResult {
  domainAuthority: number | null
  linkingDomains: number | null
}

function mozHeaders(): Record<string, string> {
  if (MOZ_API_KEY) {
    return { "Content-Type": "application/json", "x-moz-token": MOZ_API_KEY }
  }
  const expiresAt = Math.floor(Date.now() / 1000) + 300
  const stringToSign = `${MOZ_ACCESS_ID}\n${expiresAt}`
  const signature = crypto
    .createHmac("sha1", MOZ_SECRET_KEY)
    .update(stringToSign)
    .digest("base64")
  return {
    "Content-Type": "application/json",
    "x-moz-access-id": MOZ_ACCESS_ID,
    "x-moz-expires": expiresAt.toString(),
    "x-moz-signature": signature,
  }
}

export function mozConfigured(): boolean {
  return Boolean(MOZ_API_KEY || (MOZ_ACCESS_ID && MOZ_SECRET_KEY))
}

export async function getMozMetrics(domain: string): Promise<MozResult> {
  if (!mozConfigured()) {
    return { domainAuthority: null, linkingDomains: null }
  }

  try {
    // Token auth uses the current request shape ({targets: [...]}) and
    // {results: [...]} response; legacy HMAC uses {target, scope} and a flat
    // response. See scripts/debug-moz.mts for a live probe.
    const tokenMode = Boolean(MOZ_API_KEY)
    const response = await fetch("https://lsapi.seomoz.com/v2/url_metrics", {
      method: "POST",
      headers: mozHeaders(),
      body: JSON.stringify(
        tokenMode ? { targets: [domain] } : { target: domain, scope: "all", limit: 1 },
      ),
    })

    if (!response.ok) return { domainAuthority: null, linkingDomains: null }

    const data = await response.json()
    const result = Array.isArray(data?.results) ? data.results[0] : data
    return {
      domainAuthority: result?.domain_authority ?? result?.da ?? null,
      linkingDomains: result?.root_domains_to_root_domain ?? result?.ueid ?? null,
    }
  } catch {
    return { domainAuthority: null, linkingDomains: null }
  }
}
