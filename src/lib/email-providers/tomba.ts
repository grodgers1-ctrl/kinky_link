import type { EmailProvider, ProviderResult } from "./types"

const TOMBA_PUBLIC_KEY = process.env.TOMBA_PUBLIC_KEY
const TOMBA_SECRET_KEY = process.env.TOMBA_SECRET_KEY

interface TombaEmailRow {
  email?: string
  type?: string
  confidence?: number
}

async function findEmail(domain: string): Promise<ProviderResult> {
  if (!TOMBA_PUBLIC_KEY || !TOMBA_SECRET_KEY) {
    return { email: null, confidence: null, source: null, error: "not_configured" }
  }

  try {
    const response = await fetch(
      `https://api.tomba.io/v1/domain-search?domain=${encodeURIComponent(domain)}&limit=10`,
      {
        headers: {
          "X-Tomba-Key": TOMBA_PUBLIC_KEY,
          "X-Tomba-Secret": TOMBA_SECRET_KEY,
        },
      },
    )

    if (!response.ok) {
      const error = response.status === 429 ? "rate_limited" : "upstream_error"
      return { email: null, confidence: null, source: null, error }
    }

    const data = await response.json()
    const emails = (data?.data?.emails || []) as TombaEmailRow[]

    if (emails.length === 0) {
      return { email: null, confidence: null, source: null, error: "not_found" }
    }

    const generalEmails = emails.filter((e) => e.type === "generic" || e.type === "unknown")
    const personalEmails = emails.filter((e) => e.type === "personal")
    const best = generalEmails[0] || personalEmails[0] || emails[0]

    if (!best.email) {
      return { email: null, confidence: null, source: null, error: "not_found" }
    }

    return {
      email: best.email,
      confidence: best.confidence != null ? String(best.confidence) : null,
      source: "tomba",
    }
  } catch (error) {
    console.error("Tomba error:", error)
    return { email: null, confidence: null, source: null, error: "upstream_error" }
  }
}

export const tombaProvider: EmailProvider = {
  name: "tomba",
  find: findEmail,
}
