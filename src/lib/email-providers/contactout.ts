import type { EmailProvider, ProviderResult } from "./types"

const CONTACTOUT_API_KEY = process.env.CONTACTOUT_API_KEY

interface ContactOutProfile {
  work_email?: string[]
  personal_email?: string[]
}

interface ContactOutResponse {
  profiles?: Record<string, ContactOutProfile>
}

async function findEmail(domain: string): Promise<ProviderResult> {
  if (!CONTACTOUT_API_KEY) {
    return { email: null, confidence: null, source: null, error: "not_configured" }
  }

  try {
    // ContactOut's domain search is a Sales-tier feature. On free/starter plans this
    // typically returns 402 Payment Required or 403; map both to not_configured so
    // the cascade skips silently until the caller upgrades.
    const response = await fetch(
      `https://api.contactout.com/v1/domain_search?domain=${encodeURIComponent(domain)}&page=1`,
      {
        headers: {
          token: CONTACTOUT_API_KEY,
          "Content-Type": "application/json",
        },
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
