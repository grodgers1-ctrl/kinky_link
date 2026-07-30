# Tier 3 Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six Tier 3 items from [docs/product/2026-07-30-mcp-first-fixes-spec.md](../../product/2026-07-30-mcp-first-fixes-spec.md) plus three fold-in fixes: (T3.1) reorder the campaign detail page and add bulk actions to the prospect table; (T3.2) wire the daily cron's lost-backlink detection to insert notification rows on health *transitions*, expose a `/api/notifications` GET+PATCH surface, and mount a notifications bell in the top nav; (T3.3) add a server-rendered "Next 3 actions" widget to the dashboard home; (T3.4) build a minimal Sequences UI at `/dashboard/sequences` and restore the sidebar link; (T3.5) join `domain_facts` into `/api/prospects` and render homepage title/description/DA/email fallbacks in the prospect row; (T3.6) render a per-template spam badge in the template list; plus (Fold-in A) hoist the prospect-focused query builder from the search route into `corpus.ts` so MCP `search_prospects` gets the same benefit, (Fold-in B) make `hunterFindEmail` return an explicit `{error: "not_configured"}` when `HUNTER_API_KEY` is missing so `/find_email` MCP calls surface actionable text, and (Fold-in C) clear the pre-existing `react-hooks/set-state-in-effect` lint error in the onboarding wizard.

**Architecture:** Every task is additive. No schema migrations needed — `notifications`, `sequences`, `sequence_steps`, `sequence_progress`, `backlink_history`, and `domain_facts` all already exist. New API routes are session-authed via `await auth()`, all DB access via `supabaseAdmin`. The Sequences page follows the same "server RSC → client editor component" pattern already used by templates. The bulk-actions on campaign prospects becomes a new client component (`campaign-prospects-table.tsx`) so the RSC page can stay a thin shell. The notifications bell is a client component that polls `/api/notifications` every 60s. The Next-3-Actions widget is a server RSC that runs three parallel COUNT queries. Hunter's missing-key branch grows from `{email: null}` to `{email: null, error: "not_configured"}` (additive — existing callers that read `.email` are unaffected); the MCP `find_email` handler surfaces the error string when present.

**Tech Stack:** Same as prior plans — Next.js 16 App Router, Supabase (`supabaseAdmin` from `@/lib/db`), NextAuth v5 (`auth()`), TypeScript strict, Tailwind v4 brand tokens. No test framework; verification is `npm run build` + targeted `npx eslint` on touched files + one-off smoke scripts run through `tsx`. Vercel env vars via Management API + `VERCEL_AUTH_TOKEN` from `.env.local`. No new external services or env vars in this plan.

**Conventions to preserve:**
- API routes: `NextRequest`/`NextResponse`, `await auth()` first
- All DB writes via `supabaseAdmin`
- No `any` (ESLint enforces `@typescript-eslint/no-explicit-any`)
- Async effects use the `let cancelled = false` pattern (see `src/components/keywords/gsc-keywords.tsx:49-68` for the reference implementation)
- Brand tokens (`brand-secondary`, `brand-white`, `brand-primary`, `brand-accent`, `brand-surface`) — grey hex literals like `#575858`, `#DCDDDE`, `#777777` allowed
- Commit style: lowercase prefix (`campaigns:`, `mcp:`, `notifications:`, `sequences:`, `dashboard:`, `prospects:`, `templates:`, `onboarding:`, `corpus:`, `hunter:`), short summary
- Every migration must be mirrored into `supabase-schema.sql` (this plan adds none)

**Non-goals for this plan:**
- Do NOT execute the tiered-pricing plan at `docs/superpowers/plans/2026-07-29-tiered-pricing.md` — strategy is committed to single $12.99
- Do NOT plan Tier 4 (seeded corpus, outcome tracking, rank tracking) — separate future plan

---

## File Structure

```
linklight/
├── src/lib/
│   ├── corpus.ts                                     [Task 1 — new buildProspectQuery + prospect-focused fetch]
│   └── hunter.ts                                     [Task 2 — return {error: "not_configured"} when key missing]
├── src/app/api/
│   ├── prospects/
│   │   ├── search/route.ts                           [Task 1 — call corpus helper instead of inline query build]
│   │   └── route.ts                                  [Task 6 — join domain_facts into list response]
│   ├── notifications/route.ts                        [Task 4 — NEW: GET list + PATCH mark-read]
│   ├── notifications/[id]/route.ts                   [Task 4 — NEW: PATCH single mark-read]
│   ├── cron/daily/route.ts                           [Task 4 — transition-aware notifications]
│   └── mcp/route.ts                                  (unchanged)
├── src/lib/mcp/handlers.ts                           [Task 2 — surface hunter's error string]
├── src/components/
│   ├── onboarding/onboarding-wizard.tsx              [Task 3 — cancellation pattern for fetchSites]
│   ├── dashboard/
│   │   ├── top-nav.tsx                               [Task 4 — mount NotificationsBell]
│   │   ├── notifications-bell.tsx                    [Task 4 — NEW client component]
│   │   ├── next-actions-widget.tsx                   [Task 5 — NEW server RSC]
│   │   └── sidebar.tsx                               [Task 8 — restore Sequences link]
│   ├── prospects/prospect-row.tsx                    [Task 6 — render description tooltip + domain_facts fallbacks]
│   ├── templates/template-library.tsx                [Task 7 — inline SpamScoreBadge per card]
│   ├── sequences/
│   │   ├── sequences-list.tsx                        [Task 8 — NEW client list + create form launcher]
│   │   └── sequence-editor-dialog.tsx                [Task 8 — NEW client editor modal]
│   └── campaigns/
│       └── campaign-prospects-table.tsx              [Task 9 — NEW client table w/ bulk actions]
├── src/app/dashboard/
│   ├── page.tsx                                      [Task 5 — mount NextActionsWidget]
│   ├── campaigns/[id]/page.tsx                       [Task 9 — reorder + swap in client table]
│   └── sequences/page.tsx                            [Task 8 — NEW RSC entry point]
├── src/types/index.ts                                [Task 6 — add EnrichedProspect shape]
└── scripts/
    ├── verify-prospect-query.mts                     [Task 1 — smoke: buildProspectQuery snapshots]
    └── verify-notifications.mts                      [Task 4 — smoke: insert + fetch a notification]
```

**File responsibilities:**
- `corpus.ts` — grows one exported helper `buildProspectQuery(keyword)` that returns the boolean-heavy query string, plus one new fetcher `getProspectsForKeyword(keyword)` that calls the enhanced query and post-filters roundup/list-y titles. Both `/api/prospects/search` and MCP `search_prospects` route through the new fetcher — one code path.
- `hunter.ts` — `HunterResult` grows one optional `error` field. When `HUNTER_API_KEY` is missing, return `{email:null, confidence:null, source:null, error:"not_configured"}`. When 429 / non-200, add `error:"rate_limited"` / `error:"upstream_error"`. Callers reading `.email` still work — the error field is diagnostic.
- `handlers.ts` — `find_email` MCP tool checks `res.error` and returns a structured payload that includes the diagnostic when set (agent then displays "Hunter isn't configured — ask the operator to add HUNTER_API_KEY to Vercel").
- `notifications/route.ts` — GET returns latest 50 notifications for the caller, sorted `created_at DESC`. PATCH accepts `{ids: string[]}` and marks them read.
- `notifications/[id]/route.ts` — PATCH single row `read = true`. Kept separate for the bell UI's per-click behavior.
- `cron/daily/route.ts` — the health-check loop grows a prior-status check. Only inserts a notification when `bl.health_status` (pre-update) was NOT already in the bad set — i.e., a transition happened. Fires for all three bad states (`broken`, `unreachable`, `redirected`), not just `broken`.
- `notifications-bell.tsx` — client component. Reads `/api/notifications`, badges unread count, polls every 60s, expands to a popover list with per-item click-to-mark-read.
- `top-nav.tsx` — renders `<NotificationsBell />` left of the email + Sign Out.
- `next-actions-widget.tsx` — server RSC. Runs three parallel counts (quick-win keywords, unresponded replies, backlinks lost 7d) and renders three linked cards.
- `dashboard/page.tsx` — mounts `<NextActionsWidget />` between the site header row and the existing Backlinks widget, only when `sites.length > 0 && campaignCount > 0`.
- `prospects/route.ts` — after fetching prospects, fetches `domain_facts` for their distinct domains and merges: prefers prospect column when set, else falls back to `domain_facts` column. Response shape adds `homepageTitle`, `homepageDescription`, `resolvedEmail`, `resolvedDA` (never overrides raw prospect fields — additive keys only).
- `prospect-row.tsx` — title cell shows `prospect.title || homepageTitle`; when `homepageDescription` exists, hovering the title reveals a tooltip. DA badge and email cells use the resolved values as fallbacks.
- `template-library.tsx` — each card computes `scoreEmail({subject, bodyHtml, bodyText})` and renders a `<SpamScoreBadge />` below the category.
- `sequences/page.tsx` — RSC; loads sequences + step counts, hands to client `<SequencesList>`.
- `sequences-list.tsx` — table of sequences with name/step count/enrolled count/status, "New sequence" button opens editor dialog.
- `sequence-editor-dialog.tsx` — modal with add/remove steps (subject, body, delay days). Submits `POST /api/sequences`.
- `campaign-prospects-table.tsx` — replaces the inline `<table>` in `campaigns/[id]/page.tsx`. Adds checkbox column, selects state, and a bulk-action bar: **Delete**, **Tag**, **Add to sequence** (dropdown of the user's sequences → hits `POST /api/sequences/[id]/enroll`).
- `campaigns/[id]/page.tsx` — restructured order: campaign header → prospect table (bulk actions) → email performance → email finder (last).
- `onboarding-wizard.tsx` — `useEffect(step === 3)` is refactored to the async-with-cancellation pattern.

---

## Task 1: Hoist prospect-focused query into `corpus.ts`

**Files:**
- Modify: `linklight/src/lib/corpus.ts`
- Modify: `linklight/src/app/api/prospects/search/route.ts`
- Modify: `linklight/src/lib/mcp/handlers.ts` (route `search_prospects` through the new fetcher)
- Create: `linklight/scripts/verify-prospect-query.mts`

- [ ] **Step 1: Add `buildProspectQuery` and `getProspectsForKeyword` to `corpus.ts`**

Open `src/lib/corpus.ts`. At the top, right after the imports and constants, add:

```ts
const LINKABLE_TITLE_RE = /2024|2025|2026|best|top|review|vs|alternative|guide|resources|list|roundup|tools|directory|recommended|ultimate|complete/i

export function buildProspectQuery(keyword: string): string {
  return `"${keyword}" resources OR tools OR sites OR directory OR recommended OR list OR roundup OR "best" OR "top"`
}

function isLikelyCompetitor(domain: string, keyword: string): boolean {
  const bare = keyword.toLowerCase().replace(/\s+/g, "")
  if (bare.length < 4) return false
  return domain.toLowerCase().includes(bare)
}
```

Then, at the end of the file, append:

```ts
export interface ProspectForKeyword {
  url: string
  title: string
  description: string
  domain: string
  domainAuthority: number | null
  position: number | null
}

/**
 * Fetch prospects for a keyword using the roundup/list-focused query.
 * Prefers linkable pages (roundups, guides, resource pages) over direct
 * competitor product pages. Cache-first: uses corpus for the plain keyword,
 * falls back to a live Tavily call with the enhanced query on miss.
 */
export async function getProspectsForKeyword(
  keyword: string,
): Promise<ProspectForKeyword[]> {
  const enhancedQuery = buildProspectQuery(keyword)
  let raw = await scrapeSerp(enhancedQuery)

  if (raw.length === 0) {
    const cached = await getSerpForKeyword(keyword)
    raw = cached.map((r) => ({
      url: r.url,
      title: r.title || "",
      description: r.description || "",
      domain: r.domain,
    }))
  }

  const linkable = raw.filter((r) => {
    const looksLinkable = LINKABLE_TITLE_RE.test(r.title)
    const looksCompetitor = isLikelyCompetitor(r.domain, keyword)
    return looksLinkable || !looksCompetitor
  })

  const chosen = linkable.length > 0 ? linkable : raw

  const domains = Array.from(new Set(chosen.map((r) => r.domain)))
  const facts = await getDomainFacts(domains)

  return chosen.map((r, i) => ({
    url: r.url,
    title: r.title,
    description: r.description,
    domain: r.domain,
    domainAuthority: facts[r.domain]?.domain_authority ?? null,
    position: i,
  }))
}
```

- [ ] **Step 2: Rewrite `/api/prospects/search` to call the new helper**

Overwrite `src/app/api/prospects/search/route.ts` with:

```ts
import { auth } from "@/lib/auth"
import { getProspectsForKeyword } from "@/lib/corpus"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get("keyword")
    if (!keyword) {
      return NextResponse.json({ error: "Keyword required" }, { status: 400 })
    }
    if (keyword.length > 200) {
      return NextResponse.json({ error: "Keyword too long" }, { status: 400 })
    }

    const results = await getProspectsForKeyword(keyword)
    return NextResponse.json({ results: results.slice(0, 10) })
  } catch (error) {
    console.error("SERP search error:", error)
    return NextResponse.json({ error: "Failed to search prospects" }, { status: 500 })
  }
}
```

- [ ] **Step 3: Route MCP `search_prospects` through the same helper**

Open `src/lib/mcp/handlers.ts`. At the top, change the corpus import to:

```ts
import { getSerpForKeyword, getDomainFacts, getProspectsForKeyword } from "@/lib/corpus"
```

Find the `search_prospects` handler (around line 21) and replace its body with:

```ts
  handler: async (_userId, args) => {
    const keyword = String(args.keyword || "").trim()
    if (!keyword) return errorResult("keyword is required")
    if (keyword.length > 200) return errorResult("keyword too long")
    const limit = Math.min(20, Math.max(1, Number(args.limit) || 10))
    const results = await getProspectsForKeyword(keyword)
    return jsonResult(results.slice(0, limit))
  },
```

Update the tool's `description` to reflect the new behavior. Replace the existing description string with:

```ts
    "Find link-building prospect sites for a keyword. Prefers roundup / list / resource-page targets over direct competitor product pages. Uses the shared SERP cache when fresh; hits Tavily on miss. Returns url, title, domain, position, and Moz Domain Authority.",
```

Verify `getSerpForKeyword` is still imported (it's used elsewhere in the file — leave the import alone).

- [ ] **Step 4: Write the smoke script**

Create `linklight/scripts/verify-prospect-query.mts`:

```ts
// scripts/verify-prospect-query.mts
// Sanity: prove getProspectsForKeyword returns real, linkable-looking results.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-prospect-query.mts
import { getProspectsForKeyword, buildProspectQuery } from "@/lib/corpus"

const keyword = process.argv[2] || "link building tools"
console.log(`buildProspectQuery("${keyword}") =`)
console.log(`  ${buildProspectQuery(keyword)}`)
console.log()

const results = await getProspectsForKeyword(keyword)
console.log(`Got ${results.length} prospects.`)
results.slice(0, 5).forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.domain}] DA=${r.domainAuthority ?? "?"} ${r.title.slice(0, 60)}`)
})

if (results.length === 0) {
  console.error("\nFAIL: 0 results.")
  process.exit(1)
}
console.log("\nPROSPECT QUERY PASS")
```

- [ ] **Step 5: Run it**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-prospect-query.mts
```

Expected final line: `PROSPECT QUERY PASS` with 5+ results, most looking like roundups/guides.

- [ ] **Step 6: Build + smoke via MCP**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: `✓ Compiled successfully`.

Boot dev, then:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts)
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_prospects","arguments":{"keyword":"nextjs seo","limit":5}}}' \
  --max-time 60 \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print(f'got {len(r)} prospects'); [print(f'  {i+1}. [{x[\"domain\"]}] {x[\"title\"][:60]}') for i,x in enumerate(r)]"
```
Expected: 5 prospects, most with linkable-looking titles ("best", "top", "guide", etc.).

- [ ] **Step 7: Commit**

```bash
git add src/lib/corpus.ts src/app/api/prospects/search/route.ts src/lib/mcp/handlers.ts scripts/verify-prospect-query.mts
git commit -m "corpus: hoist prospect-focused query so MCP search_prospects benefits too"
```

---

## Task 2: Hunter no-op → `not_configured` error surface

**Files:**
- Modify: `linklight/src/lib/hunter.ts`
- Modify: `linklight/src/lib/mcp/handlers.ts` (find_email handler surfaces the error)

- [ ] **Step 1: Grow `HunterResult` and add explicit error states**

Overwrite `src/lib/hunter.ts` with:

```ts
const HUNTER_API_KEY = process.env.HUNTER_API_KEY

export interface HunterResult {
  email: string | null
  confidence: string | null
  source: string | null
  error?: "not_configured" | "rate_limited" | "upstream_error"
}

interface HunterEmailRow {
  value?: string
  confidence?: string
  type?: string
}

export async function hunterFindEmail(domain: string): Promise<HunterResult> {
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

    if (emails.length === 0) return { email: null, confidence: null, source: null }

    const generalEmails = emails.filter((e) => e.type === "generic" || e.type === "unknown")
    const personalEmails = emails.filter((e) => e.type === "personal")
    const best = generalEmails[0] || personalEmails[0] || emails[0]

    return {
      email: best.value || null,
      confidence: best.confidence || null,
      source: "hunter",
    }
  } catch (error) {
    console.error("Hunter.io error:", error)
    return { email: null, confidence: null, source: null, error: "upstream_error" }
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
```

**Notes:**
- The `HunterEmailRow` typing replaces the previous `any` casts on `.filter`. ESLint's `no-explicit-any` is enforced.
- The `error` field is additive — every existing caller that only reads `.email`, `.confidence`, or `.source` still works exactly as before.

- [ ] **Step 2: Surface the error in the MCP `find_email` handler**

Open `src/lib/mcp/handlers.ts`. Find the `find_email` handler (around line 158). Replace its handler body (the whole `handler: async (_userId, args) => { ... }`) with:

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

    const res = await hunterFindEmail(domain)

    if (res.error === "not_configured") {
      return jsonResult({
        domain,
        email: null,
        source: null,
        error: "not_configured",
        message:
          "Hunter is not configured on this deployment. Ask the operator to add HUNTER_API_KEY to Vercel — sign up at https://hunter.io then push the key via the Vercel Management API.",
      })
    }
    if (res.error === "rate_limited") {
      return jsonResult({
        domain,
        email: null,
        source: null,
        error: "rate_limited",
        message: "Hunter free-tier monthly quota exhausted. Try again next cycle or upgrade the plan.",
      })
    }
    if (res.error === "upstream_error") {
      return jsonResult({
        domain,
        email: null,
        source: null,
        error: "upstream_error",
        message: "Hunter returned an error. Retry in a minute.",
      })
    }

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
    }
    return jsonResult({
      domain,
      email: res.email,
      confidence: res.confidence,
      source: res.source || "live",
    })
  },
```

- [ ] **Step 3: Build + lint the touched files**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
cd linklight && npx eslint src/lib/hunter.ts src/lib/mcp/handlers.ts
```
Expected: clean build; lint exits 0.

- [ ] **Step 4: Smoke via MCP (proves the error surface)**

Boot dev. In another terminal:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts)
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_email","arguments":{"domain":"example-uncached-domain-abc.com"}}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print(r)"
```

If `HUNTER_API_KEY` is unset in `.env.local` (the current prod state), expected: `{'domain': 'example-uncached-domain-abc.com', 'email': None, 'source': None, 'error': 'not_configured', 'message': '...'}`.

If `HUNTER_API_KEY` is set, expected: `{'domain': 'example-uncached-domain-abc.com', 'email': None, 'source': 'live'}` (or a real email).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hunter.ts src/lib/mcp/handlers.ts
git commit -m "hunter: surface not_configured/rate_limited/upstream_error to MCP find_email"
```

---

## Task 3: Fix onboarding wizard's `react-hooks/set-state-in-effect` lint error

**Files:**
- Modify: `linklight/src/components/onboarding/onboarding-wizard.tsx`

- [ ] **Step 1: Refactor `fetchSites` to the cancellation pattern**

Open `src/components/onboarding/onboarding-wizard.tsx`. Find `fetchSites` (around lines 30-42) and its `useEffect` (lines 44-46). Replace both blocks (from the `const fetchSites = useCallback(async () => {` line through the `}, [step, fetchSites])` closing line) with:

```tsx
  useEffect(() => {
    if (step !== 3) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/sites")
        const data = await res.json()
        const list = (data.sites || []).map(
          (s: { siteUrl?: string; url?: string }) => ({
            url: s.siteUrl || s.url || "",
          }),
        )
        if (cancelled) return
        setSites(list)
        if (list.length > 0) setSelectedSiteUrl(list[0].url)
      } catch {
        if (!cancelled) setError("Failed to load sites")
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [step])
```

Also delete the `useCallback` import from the top of the file if it's no longer used elsewhere in this component (grep for other `useCallback` uses first — the current file only uses it for `fetchSites`, so it's safe to drop).

Top-of-file import change:
```tsx
import { useState, useEffect } from "react"
```

- [ ] **Step 2: Lint the file**

```bash
cd linklight && npx eslint src/components/onboarding/onboarding-wizard.tsx
```
Expected: 0 errors. (Pre-existing `<img>` warnings elsewhere are fine — the specific rule that was failing is `react-hooks/set-state-in-effect`.)

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/onboarding-wizard.tsx
git commit -m "onboarding: cancellation pattern for fetchSites effect (fixes lint error)"
```

---

## Task 4: Notifications — transition-aware cron, `/api/notifications` surface, bell in top nav

**Files:**
- Modify: `linklight/src/app/api/cron/daily/route.ts`
- Create: `linklight/src/app/api/notifications/route.ts`
- Create: `linklight/src/app/api/notifications/[id]/route.ts`
- Create: `linklight/src/components/dashboard/notifications-bell.tsx`
- Modify: `linklight/src/components/dashboard/top-nav.tsx`
- Create: `linklight/scripts/verify-notifications.mts`

- [ ] **Step 1: Update the cron to notify on health *transitions* for all bad states**

Open `src/app/api/cron/daily/route.ts`. Find the Part 3 block (starts around line 163: `// --- PART 3: HEALTH CHECK STALE BACKLINKS ---`). Replace it entirely (up to but not including `// --- PART 4:`) with:

```ts
  // --- PART 3: HEALTH CHECK STALE BACKLINKS ---
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    const { data: staleBacklinks } = await supabaseAdmin
      .from("backlinks")
      .select("id, source_url, user_id, health_status")
      .or(`last_health_check.is.null,last_health_check.lte.${sevenDaysAgo}`)
      .limit(200)

    if (staleBacklinks && staleBacklinks.length > 0) {
      const badStatuses = new Set(["broken", "unreachable", "redirected"])
      let broken = 0
      let unreachable = 0
      let redirected = 0
      let healthy = 0
      let notified = 0

      for (const bl of staleBacklinks) {
        try {
          const result = await checkSingleUrl(bl.source_url)
          const healthStatus = determineHealth(result)

          const priorStatus = bl.health_status || "pending"
          const isTransitionToBad =
            badStatuses.has(healthStatus) && !badStatuses.has(priorStatus)

          await supabaseAdmin
            .from("backlinks")
            .update({
              health_status: healthStatus,
              last_health_check: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", bl.id)

          await supabaseAdmin.from("backlink_history").insert({
            backlink_id: bl.id,
            health_status: healthStatus,
          })

          if (healthStatus === "broken") broken++
          else if (healthStatus === "unreachable") unreachable++
          else if (healthStatus === "redirected") redirected++
          else if (healthStatus === "healthy") healthy++

          if (isTransitionToBad) {
            notified++
            const titleByStatus: Record<string, string> = {
              broken: "Backlink broken",
              unreachable: "Backlink unreachable",
              redirected: "Backlink redirected",
            }
            await supabaseAdmin.from("notifications").insert({
              user_id: bl.user_id,
              type: "warning",
              title: titleByStatus[healthStatus] || "Backlink lost",
              body: `${bl.source_url} is ${healthStatus}`,
              link: `/dashboard/backlinks/${bl.id}`,
            })
          }
        } catch {
          // individual failure shouldn't block the batch
        }
      }

      results.healthCheck = {
        checked: staleBacklinks.length,
        broken,
        unreachable,
        redirected,
        healthy,
        notified,
      }
    } else {
      results.healthCheck = { checked: 0 }
    }
  } catch (err) {
    console.error("Health check cron error:", err)
    results.healthCheck = { error: "Failed" }
  }
```

**Notes:**
- The pre-existing code only fired for `broken` and did so *every* time the backlink was rechecked (so a persistently broken link produced a fresh notification each cron run). The new `isTransitionToBad` check only fires on a genuine healthy→bad transition.
- We now also select `health_status` in the initial query — this is the only schema-level addition.

- [ ] **Step 2: Write `GET /api/notifications` + bulk PATCH**

Create `src/app/api/notifications/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id, type, title, body, link, read, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const unreadCount = (data || []).filter((n) => !n.read).length
  return NextResponse.json({ notifications: data || [], unreadCount })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : []

    if (ids.length === 0) {
      // Mark ALL as read for this user
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ read: true })
        .eq("user_id", session.user.id)
        .eq("read", false)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ read: true })
        .eq("user_id", session.user.id)
        .in("id", ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Notifications PATCH error:", error)
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 })
  }
}
```

- [ ] **Step 3: Write single-notification PATCH**

Create `src/app/api/notifications/[id]/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("user_id", session.user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Write the `NotificationsBell` client component**

Create `src/components/dashboard/notifications-bell.tsx`:

```tsx
"use client"
import { useEffect, useState } from "react"
import Link from "next/link"

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

const POLL_MS = 60000

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/notifications")
        const data = await res.json()
        if (cancelled) return
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      } catch {
        // ignore transient failures
      }
    }
    load()
    const interval = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const markOneRead = async (id: string) => {
    setNotifications((cur) => cur.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" })
    } catch {
      // optimistic update stays
    }
  }

  const markAllRead = async () => {
    setNotifications((cur) => cur.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      })
    } catch {
      // optimistic
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications, ${unreadCount} unread`}
        className="relative rounded-lg border border-[#CCCCCD] bg-brand-white p-2 text-[#575858] hover:bg-brand-surface"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-accent px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-lg border border-[#DCDDDE] bg-brand-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#DCDDDE] px-4 py-2">
              <span className="text-sm font-medium text-brand-secondary">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-brand-accent hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[#777777]">
                  No notifications yet.
                </p>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`border-b border-[#DCDDDE] last:border-0 ${n.read ? "" : "bg-brand-primary/50"}`}
                    >
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={() => {
                            if (!n.read) markOneRead(n.id)
                            setOpen(false)
                          }}
                          className="block px-4 py-3 hover:bg-brand-surface"
                        >
                          <p className="text-sm font-medium text-brand-secondary">
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 truncate text-xs text-[#575858]">{n.body}</p>
                          )}
                        </Link>
                      ) : (
                        <div className="px-4 py-3">
                          <p className="text-sm font-medium text-brand-secondary">{n.title}</p>
                          {n.body && (
                            <p className="mt-0.5 truncate text-xs text-[#575858]">{n.body}</p>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Mount the bell in `TopNav`**

Overwrite `src/components/dashboard/top-nav.tsx` with:

```tsx
"use client"
import { signOut } from "next-auth/react"
import { NotificationsBell } from "./notifications-bell"

export function TopNav({ user }: { user: { name?: string | null; email?: string | null } }) {
  return (
    <header className="flex h-16 items-center justify-end border-b border-[#DCDDDE] bg-brand-white px-6">
      <div className="flex items-center gap-4">
        <NotificationsBell />
        <span className="text-sm text-[#575858]">{user?.email}</span>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-[#CCCCCD] bg-brand-white px-4 py-1.5 text-sm font-medium text-[#575858] hover:bg-brand-surface"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 6: Write the smoke script**

Create `linklight/scripts/verify-notifications.mts`:

```ts
// scripts/verify-notifications.mts
// End-to-end sanity: insert a notification for the first user in the DB,
// then read it back via the same table the API reads. Prints unread count.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-notifications.mts
import { supabaseAdmin } from "@/lib/db"

const { data: user } = await supabaseAdmin
  .from("users")
  .select("id, email")
  .limit(1)
  .maybeSingle()

if (!user) {
  console.error("FAIL: no user in DB. Sign in at least once, then re-run.")
  process.exit(1)
}
console.log(`Using user ${user.email} (${user.id})`)

const { data: inserted, error: insertError } = await supabaseAdmin
  .from("notifications")
  .insert({
    user_id: user.id,
    type: "info",
    title: "Verify script smoke",
    body: `Inserted at ${new Date().toISOString()} — safe to delete.`,
    link: null,
  })
  .select()
  .single()

if (insertError) {
  console.error("FAIL: insert:", insertError.message)
  process.exit(1)
}
console.log(`Inserted notification ${inserted.id}`)

const { data: recent } = await supabaseAdmin
  .from("notifications")
  .select("id, title, read, created_at")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(5)

console.log(`Latest 5 notifications for this user:`)
;(recent || []).forEach((n, i) => {
  console.log(`  ${i + 1}. [${n.read ? "read" : "unread"}] ${n.title}`)
})

const unread = (recent || []).filter((n) => !n.read).length
console.log(`\nUnread count: ${unread}`)

// Clean up the test row
await supabaseAdmin.from("notifications").delete().eq("id", inserted.id)
console.log(`Cleaned up test notification ${inserted.id}`)
console.log("\nNOTIFICATIONS PASS")
```

- [ ] **Step 7: Run it**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-notifications.mts
```
Expected final line: `NOTIFICATIONS PASS`.

- [ ] **Step 8: Build + eyeball**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error|/api/notifications" | head -10
```
Expected: `✓ Compiled successfully`, `/api/notifications` and `/api/notifications/[id]` present in the route list.

Boot dev, visit any `/dashboard/*` page. Confirm:
- The bell icon is left of the email in the top nav
- Clicking the bell opens a popover reading "No notifications yet." (or listing existing ones)
- If notifications exist, unread ones have a light background; clicking a linked one navigates and marks it read
- The badge disappears when all are read

- [ ] **Step 9: Commit**

```bash
git add src/app/api/cron/daily/route.ts src/app/api/notifications src/components/dashboard/notifications-bell.tsx src/components/dashboard/top-nav.tsx scripts/verify-notifications.mts
git commit -m "notifications: transition-aware backlink loss alerts + bell UI"
```

---

## Task 5: Dashboard "Next 3 actions" widget

**Files:**
- Create: `linklight/src/components/dashboard/next-actions-widget.tsx`
- Modify: `linklight/src/app/dashboard/page.tsx`

- [ ] **Step 1: Write the server-side widget**

Create `src/components/dashboard/next-actions-widget.tsx`:

```tsx
import { supabaseAdmin } from "@/lib/db"
import Link from "next/link"

interface Site {
  id: string
}

async function countQuickWinKeywords(userId: string, siteIds: string[]): Promise<number> {
  if (siteIds.length === 0) return 0
  const { data } = await supabaseAdmin
    .from("keywords")
    .select("impressions, avg_position")
    .eq("user_id", userId)
    .in("site_id", siteIds)
    .eq("source", "gsc")
    .gte("avg_position", 11)
    .lte("avg_position", 30)
    .gt("impressions", 0)
  return data?.length || 0
}

async function countUnrespondedReplies(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "replied")
  return count || 0
}

async function countBacklinksLostThisWeek(userId: string): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { count } = await supabaseAdmin
    .from("backlinks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("health_status", ["broken", "unreachable", "redirected"])
    .gt("last_health_check", sevenDaysAgo)
  return count || 0
}

export async function NextActionsWidget({
  userId,
  sites,
}: {
  userId: string
  sites: Site[]
}) {
  const siteIds = sites.map((s) => s.id)

  const [quickWins, unresponded, lost] = await Promise.all([
    countQuickWinKeywords(userId, siteIds),
    countUnrespondedReplies(userId),
    countBacklinksLostThisWeek(userId),
  ])

  const cards = [
    {
      key: "quick-wins",
      label: "Quick-win keywords",
      count: quickWins,
      hint: "Keywords on GSC pages 2-3 with impressions",
      href: "/dashboard/keywords",
      cta: "Review",
      empty: "No quick wins right now",
    },
    {
      key: "replies",
      label: "Prospects who replied",
      count: unresponded,
      hint: "Reply back before they cool off",
      href: "/dashboard/prospects?status=replied",
      cta: "Respond",
      empty: "No pending replies",
    },
    {
      key: "lost",
      label: "Backlinks lost this week",
      count: lost,
      hint: "Broken, unreachable, or redirected — check what happened",
      href: "/dashboard/backlinks?filter=lost",
      cta: "Investigate",
      empty: "No losses this week",
    },
  ]

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-h3 font-semibold text-brand-secondary">Next actions</h2>
        <p className="text-xs text-[#777777]">Your three highest-leverage jobs right now</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            className="rounded-xl border border-[#DCDDDE] bg-brand-white p-4 transition-colors hover:border-brand-accent"
          >
            <p className="text-xs uppercase tracking-wider text-[#777777]">{c.label}</p>
            <p className="mt-2 text-3xl font-bold text-brand-secondary">{c.count}</p>
            <p className="mt-1 text-xs text-[#575858]">
              {c.count > 0 ? c.hint : c.empty}
            </p>
            {c.count > 0 && (
              <p className="mt-3 text-xs font-medium text-brand-accent">{c.cta} &rarr;</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Mount the widget in the dashboard home**

Open `src/app/dashboard/page.tsx`. Add an import at the top of the file, alongside the other component imports:

```tsx
import { NextActionsWidget } from "@/components/dashboard/next-actions-widget"
```

Then, in the final `return (...)` block (the one that runs when `sites.length > 0 && campaignCount > 0`, around lines 65-92), insert `<NextActionsWidget />` **immediately after the `<h1>` and before the `{sites.map(...)}` block**:

```tsx
  return (
    <div className="space-y-6">
      <h1 className="text-h2 font-bold text-brand-secondary">Dashboard</h1>

      <NextActionsWidget userId={session.user.id} sites={sites} />

      {sites.map((site) => (
        <div key={site.id} className="space-y-2">
          <h2 className="text-h3 font-semibold text-brand-secondary">{site.url}</h2>
          <GscSummary siteId={site.id} />
        </div>
      ))}

      <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-brand-secondary">Backlinks</h2>
          <Link href="/dashboard/backlinks" className="text-sm text-brand-accent hover:underline">View all</Link>
        </div>
        <BacklinksWidget />
      </div>

      <section>
        <h2 className="text-h3 font-bold text-brand-secondary">Email Performance</h2>
        <div className="mt-3">
          <EmailStats />
        </div>
      </section>
    </div>
  )
```

- [ ] **Step 3: Build + eyeball**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

Boot dev, visit `/dashboard`. Confirm three cards render with counts (or "No X" text when zero). Clicking each card navigates to the expected page.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/next-actions-widget.tsx src/app/dashboard/page.tsx
git commit -m "dashboard: Next actions widget — quick-wins, replies, backlinks lost this week"
```

---

## Task 6: Prospect enrichment display (`domain_facts` fallbacks)

**Files:**
- Modify: `linklight/src/types/index.ts`
- Modify: `linklight/src/app/api/prospects/route.ts`
- Modify: `linklight/src/components/prospects/prospect-row.tsx`

- [ ] **Step 1: Extend the `Prospect` type with enrichment fields**

Open `src/types/index.ts`. Replace the existing `Prospect` interface with:

```ts
export interface Prospect {
  id: string
  user_id: string
  campaign_id?: string | null
  url: string
  domain?: string | null
  title?: string | null
  description?: string | null
  domain_authority?: number | null
  email?: string | null
  email_verified: boolean
  name?: string | null
  notes?: string | null
  tags: string[]
  status: "prospect" | "contacted" | "replied" | "live_link" | "declined" | "archived"
  pipeline_order: number
  created_at: string
  updated_at: string
  // Enrichment from domain_facts (populated by GET /api/prospects; may be absent on
  // other endpoints)
  homepageTitle?: string | null
  homepageDescription?: string | null
  resolvedEmail?: string | null
  resolvedDA?: number | null
}
```

- [ ] **Step 2: Join `domain_facts` in `GET /api/prospects`**

Open `src/app/api/prospects/route.ts`. Replace the `GET` handler (lines 5-36) with:

```ts
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get("campaignId")
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    let query = supabaseAdmin
      .from("prospects")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })

    if (campaignId) query = query.eq("campaign_id", campaignId)
    if (status) query = query.eq("status", status)
    if (search) query = query.ilike("title", `%${search}%`)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const prospects = data || []
    const domains = Array.from(
      new Set(prospects.map((p) => p.domain).filter((d): d is string => !!d)),
    )

    const factsByDomain: Record<
      string,
      { title: string | null; description: string | null; contact_email: string | null; domain_authority: number | null }
    > = {}
    if (domains.length > 0) {
      const { data: facts } = await supabaseAdmin
        .from("domain_facts")
        .select("domain, title, description, contact_email, domain_authority")
        .in("domain", domains)
      for (const f of facts || []) {
        factsByDomain[f.domain] = {
          title: f.title,
          description: f.description,
          contact_email: f.contact_email,
          domain_authority: f.domain_authority,
        }
      }
    }

    const enriched = prospects.map((p) => {
      const facts = p.domain ? factsByDomain[p.domain] : undefined
      return {
        ...p,
        homepageTitle: facts?.title ?? null,
        homepageDescription: facts?.description ?? null,
        resolvedEmail: p.email ?? facts?.contact_email ?? null,
        resolvedDA: p.domain_authority ?? facts?.domain_authority ?? null,
      }
    })

    return NextResponse.json({ prospects: enriched })
  } catch (error) {
    console.error("Prospects list error:", error)
    return NextResponse.json({ error: "Failed to load prospects" }, { status: 500 })
  }
}
```

Leave `PATCH` and `DELETE` untouched.

- [ ] **Step 3: Render fallbacks + description tooltip in `prospect-row.tsx`**

Open `src/components/prospects/prospect-row.tsx`. Replace the `DABadge` component (lines 14-18) with:

```tsx
function DABadge({ da, isFallback }: { da: number | null | undefined; isFallback: boolean }) {
  if (da == null) return <span className="text-xs text-[#999999]">—</span>
  const color = da > 30 ? "bg-green-100 text-green-700" : da > 20 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
      title={isFallback ? "Derived from domain_facts cache" : undefined}
    >
      {da}
      {isFallback && <span className="ml-1 opacity-60">·</span>}
    </span>
  )
}
```

Then, in the `ProspectRow` return block, change the **Title** cell (lines 97-112) to show the homepage title fallback and a description tooltip. Replace that entire `<td>` with:

```tsx
      <td className="max-w-xs truncate px-4 py-3">
        {editing ? (
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => { save({ title: editTitle }); setEditing(false) }}
            onKeyDown={(e) => e.key === "Enter" && (document.activeElement as HTMLElement)?.blur()}
            className="w-full rounded border border-[#CCCCCD] px-2 py-1 text-sm"
            autoFocus
          />
        ) : (
          <span
            onClick={() => !saving && setEditing(true)}
            title={prospect.homepageDescription || undefined}
            className="cursor-pointer hover:text-brand-accent"
          >
            {prospect.title || prospect.homepageTitle || "—"}
            {!prospect.title && prospect.homepageTitle && (
              <span className="ml-1 text-[10px] uppercase tracking-wider text-[#999999]">cache</span>
            )}
          </span>
        )}
      </td>
```

Change the **DA** cell (line 113) to use the resolved DA:

```tsx
      <td className="px-4 py-3">
        <DABadge
          da={prospect.resolvedDA ?? prospect.domain_authority}
          isFallback={prospect.domain_authority == null && prospect.resolvedDA != null}
        />
      </td>
```

Change the **Email** cell (lines 114-139) to prefer resolved email as a fallback (display-only — writes still target `prospect.email`). Replace the entire email `<td>` with:

```tsx
      <td className="px-4 py-3">
        {(prospect.email || prospect.resolvedEmail) ? (
          <span className="flex items-center gap-1">
            <span className="truncate text-sm">
              {prospect.email || prospect.resolvedEmail}
            </span>
            {!prospect.email && prospect.resolvedEmail && (
              <span className="rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] text-brand-secondary" title="Shared cache — click Find Email to persist on this prospect">
                cache
              </span>
            )}
            {prospect.email_verified ? (
              <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">&#10003;</span>
            ) : prospect.email ? (
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="shrink-0 text-xs text-yellow-600 hover:underline disabled:opacity-50"
              >
                {verifying ? "..." : "Verify"}
              </button>
            ) : null}
          </span>
        ) : (
          <button
            onClick={handleFindEmail}
            disabled={findingEmail}
            className="text-xs text-brand-accent hover:underline disabled:opacity-50"
          >
            {findingEmail ? "Searching..." : "Find Email"}
          </button>
        )}
      </td>
```

- [ ] **Step 4: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
cd linklight && npx eslint src/types/index.ts src/app/api/prospects/route.ts src/components/prospects/prospect-row.tsx
```
Expected: clean build; lint exits 0.

- [ ] **Step 5: Eyeball**

Boot dev, visit `/dashboard/prospects`. Confirm:
- Prospects with a null local `title` but populated `domain_facts.title` show the cache title + a `cache` badge
- Hovering the title reveals the description as a browser tooltip
- Prospects with no local `email` but populated `domain_facts.contact_email` show the cache email with a `cache` chip
- DA badges appear even when the prospect row itself has a null `domain_authority`

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/app/api/prospects/route.ts src/components/prospects/prospect-row.tsx
git commit -m "prospects: enrich list via domain_facts fallbacks (title/desc/email/DA)"
```

---

## Task 7: Spam score badge in template list view

**Files:**
- Modify: `linklight/src/components/templates/template-library.tsx`

- [ ] **Step 1: Compute per-card spam score and render the badge**

Open `src/components/templates/template-library.tsx`. Add these two imports at the top of the file, alongside the existing ones:

```tsx
import { useMemo } from "react"
import { scoreEmail } from "@/lib/spam-score"
import { SpamScoreBadge } from "@/components/ui/spam-score-badge"
```

Also add a `body_text` field to the template shape in the props (the API already returns it — the local shape just doesn't list it). Update the `TemplateLibrary` prop type:

```tsx
export function TemplateLibrary({
  templates,
}: {
  templates: {
    id: string
    name: string
    category: string
    subject: string
    body_html: string
    body_text?: string
    is_seed: boolean
  }[]
}) {
```

Then, inside the `filtered.map((t) => ...)` block (currently lines 66-97), replace the entire `<div key={t.id} ...>` card block with:

```tsx
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onSelect={() => setSelectedId(t.id)}
              onRemove={() => remove(t.id)}
              removing={deleting === t.id}
            />
          ))}
```

Then, ABOVE the `UseTemplateDialog` function definition (which starts around line 112), add:

```tsx
function TemplateCard({
  template,
  onSelect,
  onRemove,
  removing,
}: {
  template: {
    id: string
    name: string
    category: string
    subject: string
    body_html: string
    body_text?: string
    is_seed: boolean
  }
  onSelect: () => void
  onRemove: () => void
  removing: boolean
}) {
  const spamScore = useMemo(
    () =>
      scoreEmail({
        subject: template.subject,
        bodyHtml: template.body_html,
        bodyText: template.body_text || "",
      }),
    [template.subject, template.body_html, template.body_text],
  )

  return (
    <div className="flex flex-col rounded-xl border border-[#DCDDDE] bg-brand-white p-4">
      <div className="flex items-start justify-between">
        <h3 className="font-medium text-brand-secondary">{template.name}</h3>
        {template.is_seed && (
          <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] text-brand-secondary">
            Seed
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-[#777777]">{template.category}</p>
      <div className="mt-2">
        <SpamScoreBadge result={spamScore} />
      </div>
      <p className="mt-3 truncate text-sm text-[#575858]">{template.subject}</p>
      <p className="mt-1 line-clamp-2 text-xs text-[#999999]">
        {template.body_html.replace(/<[^>]+>/g, "").slice(0, 120)}...
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onSelect}
          className="rounded bg-brand-secondary px-3 py-1 text-xs font-medium text-brand-white"
        >
          Use
        </button>
        <button
          onClick={onRemove}
          disabled={removing}
          className="rounded border border-[#CCCCCD] px-3 py-1 text-xs text-[#575858] hover:bg-brand-surface disabled:opacity-50"
        >
          {removing ? "..." : "Delete"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
cd linklight && npx eslint src/components/templates/template-library.tsx
```
Expected: clean build; lint exits 0.

- [ ] **Step 3: Eyeball**

Boot dev, visit `/dashboard/templates`. Confirm each template card renders a colored spam badge (A/B/C/D/F grade) between the category and the subject line. Clicking the badge toggles its issue list.

- [ ] **Step 4: Commit**

```bash
git add src/components/templates/template-library.tsx
git commit -m "templates: render spam-score badge on each list card"
```

---

## Task 8: Sequences UI + sidebar link restored

**Files:**
- Create: `linklight/src/app/dashboard/sequences/page.tsx`
- Create: `linklight/src/components/sequences/sequences-list.tsx`
- Create: `linklight/src/components/sequences/sequence-editor-dialog.tsx`
- Modify: `linklight/src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Restore the sidebar link**

Open `src/components/dashboard/sidebar.tsx`. In the `navItems` array (around lines 7-16), insert this entry between `Templates` and `Backlinks`:

```tsx
  { href: "/dashboard/sequences", label: "Sequences", icon: "GitBranch" },
```

The final array should read:

```tsx
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: "Megaphone" },
  { href: "/dashboard/prospects", label: "Prospects", icon: "Users" },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: "Kanban" },
  { href: "/dashboard/templates", label: "Templates", icon: "FileText" },
  { href: "/dashboard/sequences", label: "Sequences", icon: "GitBranch" },
  { href: "/dashboard/backlinks", label: "Backlinks", icon: "Link" },
  { href: "/dashboard/keywords", label: "Keywords", icon: "Search" },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings" },
]
```

- [ ] **Step 2: Write the RSC entry point**

Create `src/app/dashboard/sequences/page.tsx`:

```tsx
import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { redirect } from "next/navigation"
import { SequencesList } from "@/components/sequences/sequences-list"

export default async function SequencesPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: sequences } = await supabaseAdmin
    .from("sequences")
    .select("id, name, campaign_id, created_at, sequence_steps(id, step_order, delay_days, subject)")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  const { data: campaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id, name")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  const enrichedSequences = await Promise.all(
    (sequences || []).map(async (s) => {
      const { count: enrolledCount } = await supabaseAdmin
        .from("sequence_progress")
        .select("*", { count: "exact", head: true })
        .eq("sequence_id", s.id)
      return { ...s, enrolledCount: enrolledCount || 0 }
    }),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-brand-secondary">Sequences</h1>
        <p className="mt-1 text-body text-[#575858]">
          Multi-step outreach with delays between sends. Enrolled prospects get each
          step sent by the daily cron.
        </p>
      </div>
      <SequencesList sequences={enrichedSequences} campaigns={campaigns || []} />
    </div>
  )
}
```

- [ ] **Step 3: Write the client list component**

Create `src/components/sequences/sequences-list.tsx`:

```tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { SequenceEditorDialog } from "./sequence-editor-dialog"

interface SequenceStep {
  id: string
  step_order: number
  delay_days: number
  subject: string
}

interface Sequence {
  id: string
  name: string
  campaign_id: string | null
  created_at: string
  sequence_steps: SequenceStep[]
  enrolledCount: number
}

export function SequencesList({
  sequences,
  campaigns,
}: {
  sequences: Sequence[]
  campaigns: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [editorOpen, setEditorOpen] = useState(false)

  const campaignName = (id: string | null) =>
    campaigns.find((c) => c.id === id)?.name || (id ? "Unknown" : "—")

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditorOpen(true)}
          className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white hover:bg-[#1f0066]"
        >
          + New sequence
        </button>
      </div>

      {sequences.length === 0 ? (
        <div className="rounded-xl border border-[#DCDDDE] bg-brand-white p-8 text-center">
          <p className="text-body text-[#575858]">No sequences yet.</p>
          <p className="mt-1 text-sm text-[#999999]">
            Create your first multi-step outreach sequence to auto-follow-up on non-responders.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#DCDDDE] bg-brand-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#DCDDDE] text-[#777777]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Steps</th>
                <th className="px-4 py-3 font-medium">Enrolled</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[#DCDDDE] text-brand-secondary last:border-0 hover:bg-brand-surface"
                >
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-[#575858]">{campaignName(s.campaign_id)}</td>
                  <td className="px-4 py-3 text-[#575858]">
                    {(s.sequence_steps || []).length}
                  </td>
                  <td className="px-4 py-3 text-[#575858]">{s.enrolledCount}</td>
                  <td className="px-4 py-3 text-[#575858]">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editorOpen && (
        <SequenceEditorDialog
          campaigns={campaigns}
          onClose={() => setEditorOpen(false)}
          onCreated={() => {
            setEditorOpen(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Write the editor dialog**

Create `src/components/sequences/sequence-editor-dialog.tsx`:

```tsx
"use client"
import { useState } from "react"

interface StepDraft {
  delayDays: number
  subject: string
  bodyHtml: string
  bodyText: string
}

const EMPTY_STEP: StepDraft = { delayDays: 3, subject: "", bodyHtml: "", bodyText: "" }

export function SequenceEditorDialog({
  campaigns,
  onClose,
  onCreated,
}: {
  campaigns: { id: string; name: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [campaignId, setCampaignId] = useState("")
  const [steps, setSteps] = useState<StepDraft[]>([{ ...EMPTY_STEP, delayDays: 0 }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const addStep = () => setSteps((cur) => [...cur, { ...EMPTY_STEP }])
  const removeStep = (i: number) => setSteps((cur) => cur.filter((_, idx) => idx !== i))
  const updateStep = (i: number, patch: Partial<StepDraft>) =>
    setSteps((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const submit = async () => {
    setError("")
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    if (steps.length === 0 || steps.some((s) => !s.subject.trim() || !s.bodyHtml.trim())) {
      setError("Each step needs a subject and body")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          campaignId: campaignId || null,
          steps,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to create sequence")
        setSaving(false)
        return
      }
      onCreated()
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-brand-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#DCDDDE] px-6 py-4">
          <h2 className="text-h3 font-bold text-brand-secondary">New sequence</h2>
          <button
            onClick={onClose}
            className="text-sm text-[#777777] hover:text-brand-secondary"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <label className="text-sm font-medium text-[#575858]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 follow-up"
              className="mt-1 w-full rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm text-brand-secondary"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[#575858]">Campaign (optional)</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm text-brand-secondary"
            >
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            {steps.map((s, i) => (
              <div
                key={i}
                className="rounded-lg border border-[#DCDDDE] bg-brand-surface p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-brand-secondary">
                    Step {i + 1}
                  </p>
                  {steps.length > 1 && (
                    <button
                      onClick={() => removeStep(i)}
                      className="text-xs text-brand-accent hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-3">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[#777777]">
                      Wait days after previous step
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={s.delayDays}
                      onChange={(e) =>
                        updateStep(i, { delayDays: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="mt-1 w-24 rounded border border-[#CCCCCD] px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[#777777]">
                      Subject
                    </label>
                    <input
                      value={s.subject}
                      onChange={(e) => updateStep(i, { subject: e.target.value })}
                      className="mt-1 w-full rounded border border-[#CCCCCD] px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[#777777]">
                      Body (HTML)
                    </label>
                    <textarea
                      value={s.bodyHtml}
                      onChange={(e) => updateStep(i, { bodyHtml: e.target.value, bodyText: e.target.value.replace(/<[^>]+>/g, "") })}
                      className="mt-1 min-h-[100px] w-full rounded border border-[#CCCCCD] p-2 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addStep}
              className="w-full rounded-lg border border-dashed border-[#CCCCCD] py-2 text-sm text-[#575858] hover:border-brand-accent hover:text-brand-accent"
            >
              + Add step
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-3 text-sm text-brand-accent">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#DCDDDE] px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#CCCCCD] px-4 py-2 text-sm text-[#575858] hover:bg-brand-surface"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white hover:bg-[#1f0066] disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create sequence"}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Build + lint + eyeball**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error|/dashboard/sequences" | head -10
cd linklight && npx eslint src/app/dashboard/sequences/page.tsx src/components/sequences/sequences-list.tsx src/components/sequences/sequence-editor-dialog.tsx src/components/dashboard/sidebar.tsx
```
Expected: clean build with `/dashboard/sequences` in the route list; lint exits 0.

Boot dev. Confirm:
- Sidebar shows "Sequences" between Templates and Backlinks
- `/dashboard/sequences` renders "No sequences yet" empty state, or a table if any exist
- Clicking "+ New sequence" opens the editor
- Filling name + one step and clicking Create creates a sequence (verify via `psql` or a follow-up eyeball) and closes the dialog

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/sequences src/components/sequences src/components/dashboard/sidebar.tsx
git commit -m "sequences: minimal list + editor page, restore sidebar link"
```

---

## Task 9: Campaign detail reorder + bulk actions on prospect table

**Files:**
- Create: `linklight/src/components/campaigns/campaign-prospects-table.tsx`
- Modify: `linklight/src/app/dashboard/campaigns/[id]/page.tsx`

- [ ] **Step 1: Write the client table with bulk actions**

Create `src/components/campaigns/campaign-prospects-table.tsx`:

```tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

interface CampaignProspect {
  id: string
  url: string
  domain: string | null
  title: string | null
  status: string
  email: string | null
  tags: string[]
}

interface SequenceOption {
  id: string
  name: string
}

export function CampaignProspectsTable({
  prospects,
  sequences,
}: {
  prospects: CampaignProspect[]
  sequences: SequenceOption[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tagInput, setTagInput] = useState("")
  const [sequenceId, setSequenceId] = useState("")
  const [busy, setBusy] = useState<null | "delete" | "tag" | "enroll">(null)
  const [error, setError] = useState("")

  const toggle = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === prospects.length) setSelected(new Set())
    else setSelected(new Set(prospects.map((p) => p.id)))
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} prospect(s)?`)) return
    setBusy("delete")
    setError("")
    try {
      for (const id of selected) {
        await fetch(`/api/prospects?id=${id}`, { method: "DELETE" })
      }
      setSelected(new Set())
      router.refresh()
    } catch {
      setError("Delete failed")
    } finally {
      setBusy(null)
    }
  }

  const tagSelected = async () => {
    if (selected.size === 0 || !tagInput.trim()) return
    setBusy("tag")
    setError("")
    try {
      for (const id of selected) {
        const p = prospects.find((p) => p.id === id)
        const tags = [...(p?.tags || []), tagInput.trim()]
        await fetch("/api/prospects", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, tags }),
        })
      }
      setTagInput("")
      setSelected(new Set())
      router.refresh()
    } catch {
      setError("Tag failed")
    } finally {
      setBusy(null)
    }
  }

  const enrollSelected = async () => {
    if (selected.size === 0 || !sequenceId) return
    setBusy("enroll")
    setError("")
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: Array.from(selected) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Enroll failed")
        return
      }
      setSelected(new Set())
      setSequenceId("")
      router.refresh()
    } catch {
      setError("Enroll failed")
    } finally {
      setBusy(null)
    }
  }

  if (prospects.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-[#DCDDDE] bg-brand-white p-6 text-center text-sm text-[#575858]">
        No prospects in this campaign.
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-primary px-4 py-2">
          <span className="text-sm font-medium text-brand-secondary">
            {selected.size} selected
          </span>

          <div className="flex items-center gap-2">
            <input
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tagSelected()}
              className="rounded border border-[#CCCCCD] bg-white px-2 py-1 text-sm"
            />
            <button
              onClick={tagSelected}
              disabled={busy === "tag" || !tagInput.trim()}
              className="rounded bg-brand-secondary px-3 py-1 text-xs font-medium text-brand-white disabled:opacity-50"
            >
              {busy === "tag" ? "…" : "Apply tag"}
            </button>
          </div>

          {sequences.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={sequenceId}
                onChange={(e) => setSequenceId(e.target.value)}
                className="rounded border border-[#CCCCCD] bg-white px-2 py-1 text-sm"
              >
                <option value="">Sequence…</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={enrollSelected}
                disabled={busy === "enroll" || !sequenceId}
                className="rounded bg-brand-secondary px-3 py-1 text-xs font-medium text-brand-white disabled:opacity-50"
              >
                {busy === "enroll" ? "…" : "Enroll"}
              </button>
            </div>
          )}

          <button
            onClick={deleteSelected}
            disabled={busy === "delete"}
            className="ml-auto rounded border border-brand-accent px-3 py-1 text-xs font-medium text-brand-accent hover:bg-[#FFF0F2] disabled:opacity-50"
          >
            {busy === "delete" ? "…" : `Delete ${selected.size}`}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-3 text-sm text-brand-accent">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#DCDDDE] bg-brand-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#DCDDDE] text-[#777777]">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === prospects.length && prospects.length > 0}
                  onChange={toggleAll}
                  className="accent-brand-secondary"
                />
              </th>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => (
              <tr
                key={p.id}
                className="border-b border-[#DCDDDE] text-brand-secondary last:border-0"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-brand-secondary"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{p.domain || p.url}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs text-brand-secondary">
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#575858]">{p.email || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Reorder `campaigns/[id]/page.tsx` and swap in the new table**

Overwrite `src/app/dashboard/campaigns/[id]/page.tsx` with:

```tsx
import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { redirect } from "next/navigation"
import { CampaignEmailStats } from "@/components/campaigns/campaign-email-stats"
import { CampaignEmailActions } from "@/components/campaigns/campaign-email-actions"
import { CampaignProspectsTable } from "@/components/campaigns/campaign-prospects-table"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("*, sites(url)")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .single()

  if (!campaign) return <div className="p-6 text-[#575858]">Campaign not found.</div>

  const { data: prospects } = await supabaseAdmin
    .from("prospects")
    .select("id, url, domain, title, status, email, tags")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })

  const { data: sequences } = await supabaseAdmin
    .from("sequences")
    .select("id, name")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-brand-secondary">{campaign.name}</h1>
        <p className="mt-1 text-sm text-[#575858]">
          {campaign.sites?.url || "No site"} &middot; {campaign.status}
        </p>
      </div>

      <section>
        <h2 className="text-h3 font-bold text-brand-secondary">
          Prospects ({prospects?.length || 0})
        </h2>
        <CampaignProspectsTable
          prospects={prospects || []}
          sequences={sequences || []}
        />
      </section>

      <section>
        <h2 className="text-h3 font-bold text-brand-secondary">Email Performance</h2>
        <div className="mt-3">
          <CampaignEmailStats campaignId={id} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-bold text-brand-secondary">Email Finder</h2>
          <CampaignEmailActions campaignId={id} />
        </div>
      </section>
    </div>
  )
}
```

**Notes on the reorder:**
- Order is now: **campaign header → Prospects (with bulk actions) → Email Performance → Email Finder**. Email Finder was previously at the top; per T3.1 it moves last.
- Selecting only the columns we need for the bulk-actions table (`id, url, domain, title, status, email, tags`) — dropping `select("*")` to keep the RSC payload lean.

- [ ] **Step 3: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
cd linklight && npx eslint src/components/campaigns/campaign-prospects-table.tsx src/app/dashboard/campaigns/[id]/page.tsx
```
Expected: clean build; lint exits 0.

- [ ] **Step 4: Eyeball**

Boot dev, open any existing campaign at `/dashboard/campaigns/<some-id>`. Confirm:
- Page order is header → Prospects table → Email Performance → Email Finder
- Selecting one or more prospects reveals the bulk-actions bar
- **Delete** removes the selected rows (after confirm)
- **Apply tag** adds the typed tag to each selected prospect
- **Enroll** (if any sequences exist) enrolls the selected prospects and clears the selection
- The table shows the empty state when the campaign has no prospects

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/campaign-prospects-table.tsx src/app/dashboard/campaigns/[id]/page.tsx
git commit -m "campaigns: reorder detail + bulk actions on prospect table (delete/tag/enroll)"
```

---

## Task 10: Final verify + push + prod redeploy

**Files:** none.

- [ ] **Step 1: Clean build**

```bash
cd linklight && npm run build 2>&1 | tail -15
```
Expected: `✓ Compiled successfully`, route list includes `/api/notifications`, `/api/notifications/[id]`, `/dashboard/sequences`.

- [ ] **Step 2: Lint every touched file**

```bash
cd linklight && npx eslint \
  src/lib/corpus.ts \
  src/lib/hunter.ts \
  src/lib/mcp/handlers.ts \
  src/app/api/prospects/search/route.ts \
  src/app/api/prospects/route.ts \
  src/app/api/notifications/route.ts \
  src/app/api/notifications/[id]/route.ts \
  src/app/api/cron/daily/route.ts \
  src/app/dashboard/page.tsx \
  src/app/dashboard/campaigns/[id]/page.tsx \
  src/app/dashboard/sequences/page.tsx \
  src/components/onboarding/onboarding-wizard.tsx \
  src/components/dashboard/top-nav.tsx \
  src/components/dashboard/notifications-bell.tsx \
  src/components/dashboard/next-actions-widget.tsx \
  src/components/dashboard/sidebar.tsx \
  src/components/prospects/prospect-row.tsx \
  src/components/templates/template-library.tsx \
  src/components/sequences/sequences-list.tsx \
  src/components/sequences/sequence-editor-dialog.tsx \
  src/components/campaigns/campaign-prospects-table.tsx \
  src/types/index.ts \
  2>&1 | tail -20
```
Expected: 0 errors. Pre-existing `<img>` warnings elsewhere are fine.

- [ ] **Step 3: End-to-end smoke via MCP (search_prospects with the new corpus helper)**

Boot dev in one terminal (`cd linklight && npm run dev`), then in another:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts)

curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_prospects","arguments":{"keyword":"link building tools","limit":5}}}' \
  --max-time 60 \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print(f'got {len(r)} prospects'); [print(f'  {i+1}. [{x[\"domain\"]}] {x[\"title\"][:60]}') for i,x in enumerate(r)]"

curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_email","arguments":{"domain":"probably-uncached-domain-xyz-42.com"}}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print('find_email keys:', sorted(r.keys()))"
```

Expected:
- First call: 5 prospects with roundup/list-flavored titles
- Second call: `find_email keys: ['domain', 'email', ...]`. If `HUNTER_API_KEY` is unset, the keys include `error` and `message`.

- [ ] **Step 4: Notifications smoke via `/api/notifications` (dev, session-authed)**

You need a session cookie for this — either log into the dev server in a browser and copy the `authjs.session-token`, or skip the HTTP-level check and inspect the DB directly:

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-notifications.mts
```
Expected: `NOTIFICATIONS PASS` (this re-runs Task 4 Step 7's smoke; safe to re-run).

- [ ] **Step 5: Push**

```bash
cd linklight && git push origin master
```

- [ ] **Step 6: Trigger prod redeploy (safe even if env vars are unchanged)**

```bash
cd linklight
export $(grep -E '^VERCEL_(AUTH_TOKEN|PROJECT_ID)=' .env.local | xargs -d '\n')
LATEST=$(curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1&target=production" -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" | python -c "import json,sys; print(json.load(sys.stdin)['deployments'][0]['uid'])")
echo "redeploying $LATEST"
curl -sS -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"deploymentId\":\"$LATEST\",\"target\":\"production\",\"name\":\"linklight\"}" \
  | python -c "import json,sys; d=json.load(sys.stdin); print('state:', d.get('readyState'), 'url:', d.get('url'))"
```

- [ ] **Step 7: Poll for READY and eyeball prod**

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  STATE=$(curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1&target=production" -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" | python -c "import json,sys; print(json.load(sys.stdin)['deployments'][0]['state'])")
  echo "check $i: $STATE"
  [ "$STATE" = "READY" ] && break
  sleep 15
done
```

Then, signed in to https://www.lightlinks.dev:
- `/dashboard` — Next actions widget renders three cards with counts (or empty states)
- `/dashboard` — Bell icon in top nav; click reveals empty popover or existing notifications
- `/dashboard/sequences` — page loads, empty state or table renders, "+ New sequence" creates a sequence
- `/dashboard/templates` — each template card shows a spam-score badge below its category
- `/dashboard/prospects` — prospects with cached domain_facts render a `cache` chip on title/email columns
- `/dashboard/campaigns/<id>` — page order is Prospects (top) → Email Performance → Email Finder (bottom); selecting prospects reveals the bulk-actions bar

---

## Post-launch backlog

Not blockers, come back to these once Tier 3 is stable:

- **Hunter key push to Vercel.** Task 2 changes the surface, not the config. To actually enable `find_email` in prod: sign up at hunter.io, add `HUNTER_API_KEY=…` to `.env.local`, then push via Vercel Management API (same pattern used for `TAVILY_API_KEY` in [2026-07-30-tier1-blocker-fixes.md](./2026-07-30-tier1-blocker-fixes.md#task-2-verify-script--push-tavily-key-to-vercel) — `curl POST /v10/projects/$VERCEL_PROJECT_ID/env`). Then redeploy.
- **Notifications badge auth loop.** The bell polls `/api/notifications` every 60s. If the user logs out in another tab, the poll starts 401ing silently. Trivial cost today; if this shows up in logs, add a `res.status === 401 && signOut()` branch.
- **Sequence editor: templates picker.** The editor currently only takes free-text subject + body. A picker that loads a template into the current step would be a natural next iteration.
- **Bulk "add to campaign" and "move to campaign".** T3.1 shipped delete/tag/enroll. A "move to campaign" bulk action would round out the trio.
- **Prospect enrichment on the main prospects table (`/dashboard/prospects`) already ships via `/api/prospects` — the same enrichment naturally flows into the prospect view because `ProspectRow` reads the fallback fields. If the campaign detail page ever swaps its RSC-driven table for the same client component, the enrichment shows there too. Consider consolidating.**
- **Cron notification digest.** If a user gets 5+ backlink-loss notifications in one cron run, roll them into a single "5 backlinks lost this morning" notification instead of five separate rows.
- **MCP tool: `list_notifications`.** An MCP-callable "what's new for me" endpoint. Small addition to `handlers.ts`; agent prompt becomes "what happened overnight?"
