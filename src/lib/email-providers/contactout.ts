import type { EmailProvider, ProviderResult } from "./types"

const CONTACTOUT_API_KEY = process.env.CONTACTOUT_API_KEY

interface ContactOutProfile {
  work_email?: string[]
  personal_email?: string[]
}

interface ContactOutResponse {
  profiles?: Record<string, ContactOutProfile>
  metadata?: { total_results?: number }
}

async function findEmail(domain: string): Promise<ProviderResult> {
  if (!CONTACTOUT_API_KEY) {
    return { email: null, confidence: null, source: null, error: "not_configured" }
  }

  try {
    // ContactOut's people search returns profiles matching a domain, then requires
    // "reveal" credits to expose emails. On the free tier, profiles come back with
    // empty work_email/personal_email arrays even when they exist. We treat that as
    // not_configured so the cascade skips gracefully until the caller upgrades.
    const response = await fetch(
      "https://api.contactout.com/v1/people/search",
      {
        method: "POST",
        headers: {
          token: CONTACTOUT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: [domain], reveal_info: true, page: 1 }),
      },
    )

    if (response.status === 402 || response.status === 403) {
      return { email: null, confidence: null, source: null, error: "not_configured" }
    }
    if (response.status === 429) {
      return { email: null, confidence: null, source: null, error: "rate_limited" }
    }
    if (!response.ok) {
      return { email: null, confidence: null, source: null, error: "upstream_error" }
    }

    const data = (await response.json()) as ContactOutResponse
    const profiles = Object.values(data.profiles || {})

    for (const profile of profiles) {
      const email = profile.work_email?.[0] || profile.personal_email?.[0]
      if (email) {
        return { email, confidence: null, source: "contactout" }
      }
    }

    // Free-tier gating: profiles exist for this domain but no emails were revealed.
    // Distinguish from "domain has no profiles at all".
    const totalResults = data.metadata?.total_results ?? 0
    if (totalResults > 0 && profiles.length > 0) {
      return { email: null, confidence: null, source: null, error: "not_configured" }
    }

    return { email: null, confidence: null, source: null, error: "not_found" }
  } catch (error) {
    console.error("ContactOut error:", error)
    return { email: null, confidence: null, source: null, error: "upstream_error" }
  }
}

export const contactoutProvider: EmailProvider = {
  name: "contactout",
  find: findEmail,
}
