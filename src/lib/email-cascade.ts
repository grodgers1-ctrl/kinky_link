import type { EmailProvider, ProviderResult, ProviderErrorCode } from "./email-providers/types"
import { hunterProvider } from "./hunter"
import { tombaProvider } from "./email-providers/tomba"
import { apolloProvider } from "./email-providers/apollo"
import { contactoutProvider } from "./email-providers/contactout"

// Ordered list. Hunter first (most reliable, generous quota), Tomba next
// (direct Hunter equivalent), Apollo third (org-enrich sometimes exposes emails),
// ContactOut last (Sales-tier feature; usually skipped on free plans).
const PROVIDERS: EmailProvider[] = [
  hunterProvider,
  tombaProvider,
  apolloProvider,
  contactoutProvider,
]

export interface CascadeAttempt {
  name: string
  error?: ProviderErrorCode
}

export interface CascadeResult extends ProviderResult {
  attempts: CascadeAttempt[]
}

export async function findEmailAcrossProviders(domain: string): Promise<CascadeResult> {
  const attempts: CascadeAttempt[] = []

  for (const provider of PROVIDERS) {
    const result = await provider.find(domain)
    attempts.push({ name: provider.name, error: result.error })

    if (result.email) {
      return {
        email: result.email,
        confidence: result.confidence,
        source: result.source || provider.name,
        attempts,
      }
    }
  }

  return {
    email: null,
    confidence: null,
    source: null,
    error: "not_found",
    attempts,
  }
}
