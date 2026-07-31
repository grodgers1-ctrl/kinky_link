import type { EmailProvider, ProviderResult } from "./email-providers/types"

const HUNTER_API_KEY = process.env.HUNTER_API_KEY

// Backwards-compatible alias — nothing new should import this; use hunterProvider.
export type HunterResult = ProviderResult

interface HunterEmailRow {
  value?: string
  confidence?: string
  type?: string
}

export async function hunterFindEmail(domain: string): Promise<ProviderResult> {
  if (!HUNTER_API_KEY) {
    return { email: null, confidence: null, source: null, error: "not_configured" }
  }

  try {
    const response = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}`
    )

    if (!response.ok) {
      const error = response.status === 429 ? "rate_limited" : "upstream_error"
      return { email: null, confidence: null, source: null, error }
    }

    const data = await response.json()
    const emails = (data?.data?.emails || []) as HunterEmailRow[]

    if (emails.length === 0) {
      return { email: null, confidence: null, source: null, error: "not_found" }
    }

    const generalEmails = emails.filter((e) => e.type === "generic" || e.type === "unknown")
    const personalEmails = emails.filter((e) => e.type === "personal")
    const best = generalEmails[0] || personalEmails[0] || emails[0]

    if (!best.value) {
      return { email: null, confidence: null, source: null, error: "not_found" }
    }

    return {
      email: best.value,
      confidence: best.confidence || null,
      source: "hunter",
    }
  } catch (error) {
    console.error("Hunter.io error:", error)
    return { email: null, confidence: null, source: null, error: "upstream_error" }
  }
}

export const hunterProvider: EmailProvider = {
  name: "hunter",
  find: hunterFindEmail,
}

export async function hunterVerifyEmail(email: string): Promise<{
  status: "valid" | "invalid" | "unknown"
  score: number
}> {
  if (!HUNTER_API_KEY) return { status: "unknown", score: 0 }

  try {
    const response = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_API_KEY}`
    )
    if (!response.ok) return { status: "unknown", score: 0 }

    const data = await response.json()
    return {
      status: data?.data?.status || "unknown",
      score: data?.data?.score || 0,
    }
  } catch {
    return { status: "unknown", score: 0 }
  }
}
