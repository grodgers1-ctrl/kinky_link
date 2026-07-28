const HUNTER_API_KEY = process.env.HUNTER_API_KEY

interface HunterResult {
  email: string | null
  confidence: string | null
  source: string | null
}

export async function hunterFindEmail(domain: string): Promise<HunterResult> {
  if (!HUNTER_API_KEY) return { email: null, confidence: null, source: null }

  try {
    const response = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}`
    )

    if (!response.ok) {
      if (response.status === 429) return { email: null, confidence: null, source: null }
      return { email: null, confidence: null, source: null }
    }

    const data = await response.json()
    const emails = data?.data?.emails || []

    if (emails.length === 0) return { email: null, confidence: null, source: null }

    const generalEmails = emails.filter((e: any) =>
      e.type === "generic" || e.type === "unknown"
    )
    const personalEmails = emails.filter((e: any) =>
      e.type === "personal"
    )

    const best = generalEmails[0] || personalEmails[0] || emails[0]

    return {
      email: best.value || null,
      confidence: best.confidence || null,
      source: "hunter",
    }
  } catch (error) {
    console.error("Hunter.io error:", error)
    return { email: null, confidence: null, source: null }
  }
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
