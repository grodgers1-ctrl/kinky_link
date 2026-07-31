# Email Provider Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-provider Hunter lookup with a cascade that tries Hunter → Tomba → Apollo → ContactOut in order, moving to the next provider when the current one is missing a key, rate-limited, upstream-errored, or returns no email. Every provider that lands an email caches it into `domain_facts` so subsequent lookups are instant regardless of which provider originally found it. Also push the three new keys (`TOMBA_PUBLIC_KEY` + `TOMBA_SECRET_KEY`, `APOLLO_API_KEY`, `CONTACTOUT_API_KEY`) to Vercel so the cascade works in prod.

**Architecture:** One thin adapter per provider under `src/lib/email-providers/`. Each adapter exports one function with the same shape: `find(domain) => Promise<ProviderResult>` where `ProviderResult` mirrors the extended `HunterResult` (email/confidence/source/error). A new `src/lib/email-finder.ts` orchestrator holds the ordered provider list, iterates them, and returns the first `{email}` result — or a structured summary of every provider's outcome when they all miss. The MCP `find_email` handler and the `/api/prospects/find-email` route both switch to calling `findEmailAcrossProviders(domain)` instead of `hunterFindEmail(domain)` directly.

**Why this order:**
- **Hunter** (first) — most generous free tier (50 req/mo public + trial), reliable `domain-search` endpoint, already integrated and battle-tested in this codebase.
- **Tomba** (second) — direct Hunter equivalent, `POST /v1/domain-search` returns the same shape, 25/day free. Best fallback because the response is trivially adaptable.
- **Apollo** (third) — `POST /api/v1/organizations/enrich` returns a `.primary_domain` object that often includes `.email` for the org; 50 credits/day free. Weaker fit for "any email at domain" than Hunter/Tomba but a decent third option.
- **ContactOut** (last) — best known for finding personal emails from LinkedIn URLs; domain search exists at `POST /v1/domain_search` but requires their Sales plan. Included so the framework is there; will return `not_configured` on the free tier until upgraded. Cheap to leave last-in-line.

**Tech Stack:** Same as prior plans — Next.js 16, Supabase (`supabaseAdmin`), TypeScript strict, ESLint no-any. No new deps. No schema changes. Verification is `npm run build` + `npx eslint` on touched files + one `verify-email-cascade.mts` smoke script + curl-against-MCP for the end-to-end. Vercel env vars via Management API.

**Conventions to preserve:**
- All provider adapters return `{email, confidence, source, error?}` — no throws
- No `any`; use narrow TypeScript interfaces for each provider's raw response shape
- Commit style: `email:` prefix for cascade infra, `providers:` prefix for individual adapter additions
- Every provider adapter early-returns `{error: "not_configured"}` when its env var is missing — the cascade uses this to skip silently

**External prerequisites (already met):**
The user has already added these to `.env.local`:
- `HUNTER_API_KEY` (Task 5 of this plan pushes it if not already on Vercel — already pushed in Tier 3)
- `TOMBA_PUBLIC_KEY`, `TOMBA_SECRET_KEY` (Task 5 pushes both)
- `APOLLO_API_KEY` (Task 5 pushes it)
- `CONTACTOUT_API_KEY` (Task 5 pushes it)

---

## File Structure

```
linklight/
├── src/lib/
│   ├── hunter.ts                                     [Task 1 — refactor to conform to Provider shape]
│   ├── email-providers/
│   │   ├── types.ts                                  [Task 1 — NEW: shared Provider interface]
│   │   ├── tomba.ts                                  [Task 2 — NEW adapter]
│   │   ├── apollo.ts                                 [Task 3 — NEW adapter]
│   │   └── contactout.ts                             [Task 4 — NEW adapter]
│   ├── email-finder.ts                               [Task 5 — NEW cascade orchestrator]
│   └── mcp/handlers.ts                               [Task 6 — swap hunterFindEmail → findEmailAcrossProviders]
├── src/app/api/prospects/find-email/route.ts         [Task 6 — same swap; surface real .source as method]
└── scripts/verify-email-cascade.mts                  [Task 5 — smoke: runs each provider + cascade]
```

**File responsibilities:**
- `email-providers/types.ts` — one shared `ProviderResult` interface (email/confidence/source/error) and one `EmailProvider` interface (`{name: string, find: (domain: string) => Promise<ProviderResult>}`). Every adapter conforms.
- `hunter.ts` — light refactor: the existing `hunterFindEmail` already matches the shape; just re-export a `hunterProvider: EmailProvider` object that wraps it. The old `hunterFindEmail` and `hunterVerifyEmail` exports stay for backwards compatibility (nothing outside handlers/find-email route calls them, but leaving them costs nothing).
- `email-providers/tomba.ts` — Tomba adapter. `POST https://api.tomba.io/v1/domain-search?domain=<d>` with `X-Tomba-Key` (secret) + `X-Tomba-User` (public) headers. Response `data.emails[]` shape.
- `email-providers/apollo.ts` — Apollo adapter. `POST https://api.apollo.io/api/v1/organizations/enrich` with `{domain}` body + `X-Api-Key` header. Extract `.organization.primary_domain` or `.organization.emails[0]` if present. Apollo doesn't always expose emails at the free tier — often returns `not_found`. That's fine.
- `email-providers/contactout.ts` — ContactOut adapter. `POST https://api.contactout.com/v1/domain_search` with `token` header (as per their docs). Free tier will likely 402/403 — the adapter maps those to `error: "not_configured"` so the cascade moves on gracefully.
- `email-finder.ts` — exports `findEmailAcrossProviders(domain: string): Promise<CascadeResult>`. Iterates the ordered `[hunterProvider, tombaProvider, apolloProvider, contactoutProvider]` array, returns the first provider that yields an email (with `source` set to that provider's name). If all miss, returns `{email: null, source: null, attempts: [{name, error?}...]}` so the caller can see exactly which providers were skipped/tried.
- `mcp/handlers.ts` — `find_email` handler swaps to the cascade. When email found, `.source` reflects which provider produced it. When all fail, the returned payload includes `attempts` so the agent can tell the operator which key to add next.
- `find-email/route.ts` — same swap. The `method` string returned to the UI becomes the provider name that produced the email (`"hunter"`, `"tomba"`, `"apollo"`, `"contactout"`), or stays `"none"` when all miss.
- `verify-email-cascade.mts` — hits each provider individually against a test domain (e.g. `stripe.com`), prints which succeeded and which errored, then runs the cascade end-to-end and prints the winning provider.

---

## Task 1: Shared provider types + Hunter wrapping

**Files:**
- Create: `linklight/src/lib/email-providers/types.ts`
- Modify: `linklight/src/lib/hunter.ts`

- [ ] **Step 1: Write the shared types**

Create `src/lib/email-providers/types.ts`:

```ts
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
```

- [ ] **Step 2: Wrap `hunterFindEmail` in a `hunterProvider` export**

Open `src/lib/hunter.ts`. Change the top-of-file imports and existing `HunterResult` to reference the shared types. Replace the entire file with:

```ts
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
```

**Notes:**
- The main functional change is Hunter now returns `error: "not_found"` when the domain has zero emails (previously returned `{email: null}` with no error). The cascade needs to distinguish "provider ran cleanly but found nothing" from "provider had a real error" — `"not_found"` is a soft skip vs `"rate_limited"` which the caller might want to retry later.
- Existing MCP handler branches on `not_configured`, `rate_limited`, `upstream_error`; a new `not_found` case just falls through to the `if (res.email)` block returning `email: null` — no handler edits needed for this behavior change.

- [ ] **Step 3: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/hunter.ts src/lib/email-providers/types.ts
```
Expected: clean build; lint exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email-providers/types.ts src/lib/hunter.ts
git commit -m "email: shared ProviderResult type + wrap Hunter as an EmailProvider"
```

---

## Task 2: Tomba adapter

**Files:**
- Create: `linklight/src/lib/email-providers/tomba.ts`

- [ ] **Step 1: Write the adapter**

Create `src/lib/email-providers/tomba.ts`:

```ts
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
      `https://api.tomba.io/v1/domain-search?domain=${encodeURIComponent(domain)}&limit=5`,
      {
        headers: {
          "X-Tomba-Key": TOMBA_SECRET_KEY,
          "X-Tomba-User": TOMBA_PUBLIC_KEY,
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
```

- [ ] **Step 2: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/email-providers/tomba.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email-providers/tomba.ts
git commit -m "providers: add Tomba email adapter"
```

---

## Task 3: Apollo adapter

**Files:**
- Create: `linklight/src/lib/email-providers/apollo.ts`

- [ ] **Step 1: Write the adapter**

Create `src/lib/email-providers/apollo.ts`:

```ts
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
```

**Note on Apollo's shape:** the `organizations/enrich` endpoint's response schema evolves — the adapter deliberately reads defensively (`typeof e === "string"`, `Array.isArray`) rather than trusting the payload. If Apollo starts returning emails under a different key at the free tier, extend the `candidates.push(...)` block.

- [ ] **Step 2: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/email-providers/apollo.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email-providers/apollo.ts
git commit -m "providers: add Apollo email adapter (organization enrich)"
```

---

## Task 4: ContactOut adapter

**Files:**
- Create: `linklight/src/lib/email-providers/contactout.ts`

- [ ] **Step 1: Write the adapter**

Create `src/lib/email-providers/contactout.ts`:

```ts
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
```

- [ ] **Step 2: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/email-providers/contactout.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email-providers/contactout.ts
git commit -m "providers: add ContactOut email adapter (skips silently on free tier)"
```

---

## Task 5: Cascade orchestrator + smoke script + push keys to Vercel

**Files:**
- Create: `linklight/src/lib/email-finder.ts`
- Create: `linklight/scripts/verify-email-cascade.mts`

- [ ] **Step 1: Write the cascade orchestrator**

Create `src/lib/email-finder.ts`:

```ts
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
```

- [ ] **Step 2: Write the smoke script**

Create `linklight/scripts/verify-email-cascade.mts`:

```ts
// scripts/verify-email-cascade.mts
// Runs each provider individually against a well-known domain, then runs the
// cascade. Prints outcomes so it's obvious which providers are configured.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-email-cascade.mts [domain]
import { hunterProvider } from "@/lib/hunter"
import { tombaProvider } from "@/lib/email-providers/tomba"
import { apolloProvider } from "@/lib/email-providers/apollo"
import { contactoutProvider } from "@/lib/email-providers/contactout"
import { findEmailAcrossProviders } from "@/lib/email-finder"

const domain = process.argv[2] || "stripe.com"
console.log(`Testing providers against ${domain}\n`)

for (const p of [hunterProvider, tombaProvider, apolloProvider, contactoutProvider]) {
  const res = await p.find(domain)
  const status = res.email
    ? `OK  ${res.email}`
    : `SKIP ${res.error || "unknown"}`
  console.log(`  ${p.name.padEnd(12)} ${status}`)
}

console.log(`\nCascade:`)
const cascade = await findEmailAcrossProviders(domain)
if (cascade.email) {
  console.log(`  WINNER: ${cascade.source} → ${cascade.email}`)
} else {
  console.log(`  All providers missed. Attempts:`)
  cascade.attempts.forEach((a) => console.log(`    - ${a.name}: ${a.error || "no email"}`))
}
console.log(`\nCASCADE PASS (any-non-crash)`)
```

- [ ] **Step 3: Run it**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-email-cascade.mts stripe.com
```

Expected: `CASCADE PASS` at the end. At least Hunter should return an email for stripe.com. Providers without configured keys will print `SKIP not_configured`.

- [ ] **Step 4: Push the three new keys to Vercel**

```bash
cd linklight
export $(grep -E '^(VERCEL_AUTH_TOKEN|VERCEL_PROJECT_ID|TOMBA_PUBLIC_KEY|TOMBA_SECRET_KEY|APOLLO_API_KEY|CONTACTOUT_API_KEY)=' .env.local | xargs -d '\n')

for KEY_NAME in TOMBA_PUBLIC_KEY TOMBA_SECRET_KEY APOLLO_API_KEY CONTACTOUT_API_KEY; do
  KEY_VALUE=$(eval echo \$$KEY_NAME)
  echo -n "$KEY_NAME: "
  curl -sS -X POST "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?upsert=true" \
    -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"$KEY_NAME\",\"value\":\"$KEY_VALUE\",\"type\":\"encrypted\",\"target\":[\"production\",\"preview\",\"development\"]}" \
    | python -c "import json,sys; d=json.load(sys.stdin); ok=d.get('created') and not d.get('failed'); print('OK' if ok else 'FAILED', d.get('failed', d.get('error','')))"
done
```

Expected: `OK` for all four.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email-finder.ts scripts/verify-email-cascade.mts
git commit -m "email: cascade Hunter → Tomba → Apollo → ContactOut with structured attempts"
```

---

## Task 6: Wire cascade into MCP + prospects find-email route

**Files:**
- Modify: `linklight/src/lib/mcp/handlers.ts`
- Modify: `linklight/src/app/api/prospects/find-email/route.ts`

- [ ] **Step 1: Swap MCP `find_email` handler to use the cascade**

Open `src/lib/mcp/handlers.ts`. At the top, change the hunter import:

```ts
import { findEmailAcrossProviders } from "@/lib/email-finder"
```

(Delete the `import { hunterFindEmail } from "@/lib/hunter"` line — no longer used here.)

Find the `find_email` handler and replace its body (the `handler: async (_userId, args) => { ... }`) with:

```ts
  handler: async (_userId, args) => {
    const domain = String(args.domain || "").trim().toLowerCase()
    if (!domain) return errorResult("domain is required")

    const { data: cached } = await supabaseAdmin
      .from("domain_facts")
      .select("contact_email, email_fetched_at")
      .eq("domain", domain)
      .maybeSingle()
    if (cached?.contact_email) {
      return jsonResult({ domain, email: cached.contact_email, source: "cache" })
    }

    const res = await findEmailAcrossProviders(domain)

    if (res.email) {
      const now = new Date().toISOString()
      await supabaseAdmin.from("domain_facts").upsert(
        {
          domain,
          contact_email: res.email,
          email_fetched_at: now,
          last_seen_at: now,
        },
        { onConflict: "domain" },
      )
      return jsonResult({
        domain,
        email: res.email,
        confidence: res.confidence,
        source: res.source,
        attempts: res.attempts,
      })
    }

    // All providers missed. Report which errored so the caller can act.
    const notConfigured = res.attempts.filter((a) => a.error === "not_configured").map((a) => a.name)
    const rateLimited = res.attempts.filter((a) => a.error === "rate_limited").map((a) => a.name)

    const messageParts: string[] = ["No email found for this domain across configured providers."]
    if (notConfigured.length > 0) {
      messageParts.push(
        `Unconfigured providers (add keys to Vercel to enable): ${notConfigured.join(", ")}.`,
      )
    }
    if (rateLimited.length > 0) {
      messageParts.push(`Rate-limited this cycle: ${rateLimited.join(", ")}.`)
    }

    return jsonResult({
      domain,
      email: null,
      source: null,
      error: "not_found",
      message: messageParts.join(" "),
      attempts: res.attempts,
    })
  },
```

- [ ] **Step 2: Swap `/api/prospects/find-email` route to use the cascade**

Open `src/app/api/prospects/find-email/route.ts`. Change the import:

```ts
import { findEmailAcrossProviders } from "@/lib/email-finder"
```

(Delete the `import { hunterFindEmail } from "@/lib/hunter"` line.)

Then find the block currently doing `const hunterResult = await hunterFindEmail(domain)` (around line 67) and replace the entire `} else { const hunterResult = await hunterFindEmail(domain) ... }` branch with:

```ts
      } else {
        const cascadeResult = await findEmailAcrossProviders(domain)
        if (cascadeResult.email) {
          await supabaseAdmin
            .from("prospects")
            .update({
              email: cascadeResult.email,
              email_verified: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", prospect.id)

          results.push({
            prospectId: prospect.id,
            email: cascadeResult.email,
            confidence: cascadeResult.confidence || "unknown",
            method: cascadeResult.source || "cascade",
          })
        } else {
          results.push({
            prospectId: prospect.id,
            email: null,
            confidence: "not_found",
            method: "none",
          })
        }
      }
```

- [ ] **Step 3: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/mcp/handlers.ts src/app/api/prospects/find-email/route.ts
```
Expected: clean build; lint exits 0.

- [ ] **Step 4: End-to-end via MCP**

Boot dev, then:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts)

# A domain likely uncached in your local domain_facts:
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_email","arguments":{"domain":"vercel.com"}}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print('email:', r.get('email'), 'source:', r.get('source')); print('attempts:', r.get('attempts',[]))"
```

Expected: `email` is populated (Hunter typically has vercel.com), `source` is the provider name (`hunter`, `tomba`, etc.), `attempts` shows each provider's outcome.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/handlers.ts src/app/api/prospects/find-email/route.ts
git commit -m "email: MCP find_email + /api/prospects/find-email use cascade"
```

---

## Task 7: Final verify + push + prod redeploy

**Files:** none.

- [ ] **Step 1: Clean build + lint sweep**

```bash
cd linklight && npm run build 2>&1 | tail -10
cd linklight && npx eslint \
  src/lib/hunter.ts \
  src/lib/email-providers/types.ts \
  src/lib/email-providers/tomba.ts \
  src/lib/email-providers/apollo.ts \
  src/lib/email-providers/contactout.ts \
  src/lib/email-finder.ts \
  src/lib/mcp/handlers.ts \
  src/app/api/prospects/find-email/route.ts \
  2>&1 | tail -10
```
Expected: clean build; 0 lint errors.

- [ ] **Step 2: Cascade smoke locally**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-email-cascade.mts stripe.com
cd linklight && npx tsx --env-file=.env.local scripts/verify-email-cascade.mts vercel.com
```
Expected: `CASCADE PASS` for both. At least one provider produces a real email each time.

- [ ] **Step 3: Push**

```bash
cd linklight && git push origin master
```

- [ ] **Step 4: Trigger prod redeploy (so the new env vars from Task 5 Step 4 bake in)**

```bash
cd linklight
export $(grep -E '^VERCEL_(AUTH_TOKEN|PROJECT_ID)=' .env.local | xargs -d '\n')
LATEST=$(curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1&target=production" -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" | python -c "import json,sys; print(json.load(sys.stdin)['deployments'][0]['uid'])")
curl -sS -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"deploymentId\":\"$LATEST\",\"target\":\"production\",\"name\":\"linklight\"}" \
  | python -c "import json,sys; d=json.load(sys.stdin); print('state:', d.get('readyState'))"
```

- [ ] **Step 5: Poll until READY and eyeball via prod MCP**

```bash
export $(grep -E '^VERCEL_(AUTH_TOKEN|PROJECT_ID)=' .env.local | xargs -d '\n')
for i in 1 2 3 4 5 6 7 8 9 10; do
  STATE=$(curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1&target=production" -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" | python -c "import json,sys; print(json.load(sys.stdin)['deployments'][0]['state'])")
  echo "check $i: $STATE"
  [ "$STATE" = "READY" ] && break
  sleep 15
done
```

Then sign in to https://www.lightlinks.dev, go to `/dashboard/prospects`, click "Find Email" on a prospect whose domain isn't cached — the email should populate, and the `method` returned to the UI should reflect the provider that produced it.

---

## Post-launch backlog

- **Concurrency and cost control.** Right now the cascade runs providers sequentially. That's cheapest — a Hunter hit skips the other three entirely. If Hunter starts consistently returning `not_found` for niche domains, consider running the top-two in parallel and taking the first hit. Wait for evidence before optimizing.
- **Per-provider usage tracking.** A `provider_usage` table with `(provider, day, calls, successes, errors)` would help spot which providers actually earn their keep. Trivial add — a fire-and-forget insert in each adapter.
- **Verify step for non-Hunter emails.** `hunterVerifyEmail` still runs against Hunter regardless of which provider produced the email. Fine for now — email verification is a separate service Hunter is genuinely good at — but if Hunter's verifier starts returning `unknown` on Tomba-produced emails a lot, add a cross-provider verifier.
- **`domain_facts.email_source`.** Add a column recording which provider originally produced each cached email. Useful for audits and for the "verify this email" flow — a Tomba-sourced email might warrant more scrutiny than a Hunter one.
- **Fold ContactOut's LinkedIn-URL lookup into a separate MCP tool.** ContactOut's real strength is `find_email_by_linkedin_url(url)` at the free tier — that's a different shape than the domain cascade. Consider a `find_email_from_linkedin(url)` MCP tool if users start pasting LinkedIn URLs into their agents.
