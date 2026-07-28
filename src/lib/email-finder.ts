interface EmailResult {
  email: string | null
  confidence: "verified" | "likely" | "pattern_only" | "not_found"
  method: "pattern" | "smtp" | "hunter" | "mx_lookup"
  pattern?: string
}

const PATTERNS = [
  (f: string, d: string) => `${f}@${d}`,
  (f: string, l: string, d: string) => `${f}.${l}@${d}`,
  (f: string, l: string, d: string) => `${f[0]}.${l}@${d}`,
  (f: string, l: string, d: string) => `${f}${l}@${d}`,
  (f: string, l: string, d: string) => `${f[0]}${l}@${d}`,
  (f: string, l: string, d: string) => `${l}${f[0]}@${d}`,
  (f: string, l: string, d: string) => `${f[0]}${l[0]}@${d}`,
  (f: string, l: string, d: string) => `${f}-${l}@${d}`,
  (f: string, l: string, d: string) => `${l}.${f}@${d}`,
  (f: string, l: string, d: string) => `${f}_${l}@${d}`,
]

export function parseName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return { first: "", last: "" }
  if (parts.length === 1) return { first: parts[0], last: "" }
  return { first: parts[0], last: parts.slice(1).join(" ") }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace("www.", "")
  } catch {
    return url.replace("www.", "").split("/")[0]
  }
}

export function generateEmailCandidates(
  domain: string,
  firstName: string,
  lastName: string
): { email: string; pattern: string }[] {
  const domainClean = domain.toLowerCase().replace("www.", "")
  const f = firstName.toLowerCase().trim()
  const l = lastName.toLowerCase().trim()

  if (!f || !domainClean) return []

  const candidates: { email: string; pattern: string }[] = []
  const seen = new Set<string>()

  for (const patternFn of PATTERNS) {
    const email = patternFn(f, l, domainClean).toLowerCase()
    if (!seen.has(email) && email.includes("@") && !email.endsWith("@")) {
      seen.add(email)
      candidates.push({ email, pattern: `first${patternFn.toString().includes(".") ? ".last" : ""}@domain` })
    }
  }

  return candidates
}

export function heuristicVerify(email: string): EmailResult {
  if (!email || !email.includes("@")) {
    return { email: null, confidence: "not_found", method: "pattern" }
  }

  const [local, domain] = email.split("@")

  if (!local || local.length < 2) {
    return { email: null, confidence: "not_found", method: "pattern" }
  }
  if (!domain || !domain.includes(".")) {
    return { email: null, confidence: "not_found", method: "pattern" }
  }

  const disposableDomains = [
    "mailinator.com", "guerrillamail.com", "tempmail.com", "10minutemail.com",
    "throwaway.email", "yopmail.com", "sharklasers.com", "temp-mail.org",
    "fakeinbox.com", "trashmail.com", "mailnator.com", "dispostable.com",
  ]

  if (disposableDomains.includes(domain)) {
    return { email, confidence: "pattern_only", method: "pattern", pattern: "disposable_domain" }
  }

  const isKnownProvider = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com",
    "yahoo.com", "ymail.com", "protonmail.com", "proton.me", "icloud.com", "me.com"].includes(domain)

  if (isKnownProvider) {
    return { email, confidence: "likely", method: "pattern", pattern: "known_provider" }
  }

  const hasDot = local.includes(".")
  const isInitial = local.length <= 3 && !hasDot

  if (isInitial) {
    return { email, confidence: "pattern_only", method: "pattern", pattern: "initial" }
  }

  return { email, confidence: "likely", method: "pattern", pattern: "corporate" }
}

export async function findEmail(
  domain: string,
  firstName?: string,
  lastName?: string
): Promise<EmailResult> {
  const domainClean = extractDomain(domain)

  if (firstName) {
    const candidates = generateEmailCandidates(domainClean, firstName, lastName || "")
    for (const { email } of candidates) {
      const result = heuristicVerify(email)
      if (result.confidence === "likely") return result
    }
    if (candidates.length > 0) {
      return heuristicVerify(candidates[0].email)
    }
  }

  return { email: null, confidence: "not_found", method: "pattern" }
}
