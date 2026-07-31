import type { EmailProvider, ProviderResult } from "./types"

const APOLLO_API_KEY = process.env.APOLLO_API_KEY

interface ApolloOrganization {
  emails?: string[]
  primary_phone?: unknown
  email?: string
}

interface ApolloResponse {
  organization?: ApolloOrganization
}

async function findEmail(domain: string): Promise<ProviderResult> {
  if (!APOLLO_API_KEY) {
    return { email: null, confidence: null, source: null, error: "not_configured" }
  }

  try {
    const response = await fetch(
      "https://api.apollo.io/api/v1/organizations/enrich",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": APOLLO_API_KEY,
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ domain }),
      },
    )

    if (!response.ok) {
      const error = response.status === 429 ? "rate_limited" : "upstream_error"
      return { email: null, confidence: null, source: null, error }
    }

    const data = (await response.json()) as ApolloResponse
    const org = data.organization
    if (!org) {
      return { email: null, confidence: null, source: null, error: "not_found" }
    }

    // Apollo may return one of: .email, .emails[0]. Prefer generic-looking addresses.
    const candidates: string[] = []
    if (Array.isArray(org.emails)) candidates.push(...org.emails.filter((e): e is string => typeof e === "string"))
    if (org.email) candidates.push(org.email)

    const best = candidates[0]
    if (!best) {
      return { email: null, confidence: null, source: null, error: "not_found" }
    }

    return {
      email: best,
      confidence: null,
      source: "apollo",
    }
  } catch (error) {
    console.error("Apollo error:", error)
    return { email: null, confidence: null, source: null, error: "upstream_error" }
  }
}

export const apolloProvider: EmailProvider = {
  name: "apollo",
  find: findEmail,
}
