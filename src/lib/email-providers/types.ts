export type ProviderErrorCode = "not_configured" | "rate_limited" | "upstream_error" | "not_found"

export interface ProviderResult {
  email: string | null
  confidence: string | null
  source: string | null
  error?: ProviderErrorCode
}

export interface EmailProvider {
  name: string
  find: (domain: string) => Promise<ProviderResult>
}
