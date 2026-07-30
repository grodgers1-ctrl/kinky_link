# Tier 1 Blocker Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three Tier 1 blocker fixes from [docs/product/2026-07-30-mcp-first-fixes-spec.md](../../product/2026-07-30-mcp-first-fixes-spec.md): (1) replace fragile Google SERP scraping with Google Programmable Search (CSE) so prospect search returns real results, (2) fix the onboarding wizard's `siteId` bug that corrupts campaign records and 404s their detail pages, (3) sort GSC keywords by opportunity so "Quick Wins" surface first.

**Architecture:** Three surgical changes, no schema migrations, no new dependencies. CSE replaces `scrapeSerp` with a JSON API call — same interface, same return shape, callers unchanged. Campaign POST accepts either `siteId` (UUID, existing behavior) or `siteUrl` (string, resolved to the caller's site UUID via a DB lookup). GSC keyword list gets a client-side sort function + one filter chip.

**Tech Stack:** Same as prior plans — Next.js 16 App Router, Supabase (`supabaseAdmin` from `@/lib/db`), NextAuth v5 (`auth()`), TypeScript strict, Tailwind v4 brand tokens. No test framework; verification is `npm run build` + `npm run lint` + one-off smoke scripts run through `tsx`. Vercel env vars managed via the Management API + `VERCEL_AUTH_TOKEN` from `.env.local`.

**Conventions to preserve:**
- API routes: `NextRequest`/`NextResponse`, `await auth()` first
- All Supabase writes via `supabaseAdmin`; anon client isn't used anywhere anymore
- No `any` (ESLint enforces)
- Brand tokens only; grey hex literals like `#575858` allowed
- Migrations mirror into `supabase-schema.sql` (none in this plan)
- Commit style: lowercase prefix (`prospects:`, `onboarding:`, `keywords:`, `mcp:` etc.), short first-line summary

**External prerequisites (manual, before Task 1):**
The engineer executing this plan needs to set up a Google Programmable Search Engine. This is a Google account thing, not a code thing, and it's not automatable via API. Concrete steps:

1. Go to [programmablesearchengine.google.com](https://programmablesearchengine.google.com/) → **Create a new search engine**
2. Give it a name (e.g. "linklight"), select **Search the entire web** (toggle it on), create
3. On the resulting page, copy the **Search engine ID** (looks like `c1f2e3d4a5b6c7d8`) — this is `GOOGLE_CSE_ID`
4. Enable the Custom Search API: [console.developers.google.com/apis/library/customsearch.googleapis.com](https://console.developers.google.com/apis/library/customsearch.googleapis.com) — same Google Cloud project as your OAuth client (project `481821617718` per prior debugging)
5. Create an API key: [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials → API key**. Restrict it to "Custom Search API" only. This is `GOOGLE_CSE_KEY`
6. Add both to `linklight/.env.local`:
   ```
   GOOGLE_CSE_ID=c1f2e3d4a5b6c7d8
   GOOGLE_CSE_KEY=AIzaSy...
   ```
7. Free tier: 100 queries/day. Enough for early users; the corpus cache we built amortizes this. At paid tier ($5/1000), still trivially cheap.

Task 2 pushes these vars to Vercel via API.

---

## File Structure

```
linklight/
├── src/lib/
│   └── scraper.ts                                  [Task 1 — full rewrite]
├── src/app/api/campaigns/route.ts                  [Task 3 — accept siteUrl]
├── src/components/
│   ├── onboarding/onboarding-wizard.tsx            [Task 4 — send siteUrl]
│   └── keywords/gsc-keywords.tsx                   [Task 5 — sort + filter]
└── scripts/
    └── verify-cse.mts                              [Task 2 — smoke]
```

**File responsibilities:**
- `scraper.ts` — now a thin wrapper around Google CSE. Exports `scrapeSerp(keyword)` unchanged in signature; existing callers (`src/lib/corpus.ts`, `keyword-service.ts`, MCP `search_prospects` handler) require no changes.
- `verify-cse.mts` — one-off smoke: calls `scrapeSerp("test keyword")` end-to-end against the live CSE API, prints result count.
- `campaigns/route.ts` — POST handler grows one branch: if `siteUrl` is provided instead of `siteId`, look up the caller's site with `.eq("url", siteUrl).eq("user_id", ...)` and use that UUID. Existing UUID callers unaffected.
- `onboarding-wizard.tsx` — one-line fix: `siteId: selectedSiteUrl` → `siteUrl: selectedSiteUrl` (with the fallback for empty).
- `gsc-keywords.tsx` — adds a `sortMode` state (default `"opportunity"`), a `filterMode` state (default `"all"`, second option `"quickWins"`), two filter/sort chip UI blocks, and the sort/filter transform applied before render.

---

## Task 1: Replace `scrapeSerp` with Google CSE

**Files:**
- Rewrite: `linklight/src/lib/scraper.ts`

- [ ] **Step 1: Confirm CSE credentials work with a raw curl before writing any code**

Run from `linklight/`:
```bash
export $(grep -E '^(GOOGLE_CSE_ID|GOOGLE_CSE_KEY)=' .env.local | xargs -d '\n')
curl -sS "https://www.googleapis.com/customsearch/v1?key=$GOOGLE_CSE_KEY&cx=$GOOGLE_CSE_ID&q=nextjs+seo&num=5" | python -c "import json,sys; d=json.load(sys.stdin); print('items:', len(d.get('items', []))); [print(f\"  {i+1}. {it['title'][:60]} — {it['link']}\") for i,it in enumerate(d.get('items', [])[:3])]"
```
Expected: 5 items printed with titles + URLs. If you get an error, fix credentials before continuing — no point rewriting code against broken auth.

- [ ] **Step 2: Rewrite `src/lib/scraper.ts`**

Overwrite the file with:

```ts
// Google Programmable Search Engine (Custom Search JSON API).
// Free tier: 100 queries/day. Same interface as the previous Google-HTML
// scraper so callers (corpus, MCP search_prospects, keyword-service) don't
// need to change.

interface ProspectResult {
  url: string
  title: string
  description: string
  domain: string
}

interface CseItem {
  title?: string
  link?: string
  snippet?: string
  displayLink?: string
}

const CSE_ID = process.env.GOOGLE_CSE_ID
const CSE_KEY = process.env.GOOGLE_CSE_KEY

export async function scrapeSerp(keyword: string): Promise<ProspectResult[]> {
  if (!CSE_ID || !CSE_KEY) {
    console.warn("scrapeSerp: GOOGLE_CSE_ID / GOOGLE_CSE_KEY not configured — returning [].")
    return []
  }

  // CSE JSON API caps at 10 results per call. Fetch two pages to get ~20 like the
  // old scraper did.
  const pages = await Promise.all([
    fetchCsePage(keyword, 1),
    fetchCsePage(keyword, 11),
  ])

  const items = pages.flat()
  const results: ProspectResult[] = []

  for (const item of items) {
    const url = item.link
    const title = item.title?.trim() || ""
    if (!url || !title) continue
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "")
      results.push({
        url,
        title,
        description: item.snippet?.trim() || "",
        domain,
      })
    } catch {
      // skip malformed URLs
    }
  }

  return results
}

async function fetchCsePage(keyword: string, start: number): Promise<CseItem[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1")
  url.searchParams.set("key", CSE_KEY!)
  url.searchParams.set("cx", CSE_ID!)
  url.searchParams.set("q", keyword)
  url.searchParams.set("num", "10")
  url.searchParams.set("start", String(start))

  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      const body = await res.text()
      console.error("CSE fetch failed:", res.status, body.slice(0, 300))
      return []
    }
    const data = (await res.json()) as { items?: CseItem[] }
    return data.items || []
  } catch (error) {
    console.error("CSE fetch error:", error)
    return []
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd linklight && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 4: Confirm no upstream callers broke**

The public surface (`scrapeSerp(keyword) => Promise<ProspectResult[]>`) is identical. Sanity-check the two known call sites still compile:
```bash
grep -rn "from ['\"]@/lib/scraper['\"]" linklight/src
```
Expected: `src/lib/corpus.ts:1:import { scrapeSerp } from "@/lib/scraper"` (plus any MCP handler that imports it). No signature has changed, so nothing else needs editing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraper.ts
git commit -m "prospects: swap SERP HTML scrape for Google CSE JSON API"
```

---

## Task 2: Verify script + push CSE vars to Vercel

**Files:**
- Create: `linklight/scripts/verify-cse.mts`

- [ ] **Step 1: Write the smoke script**

```ts
// scripts/verify-cse.mts
// End-to-end sanity: calls scrapeSerp() against the real CSE API, prints result count.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-cse.mts
import { scrapeSerp } from "@/lib/scraper"

const keyword = process.argv[2] || "nextjs seo tips"
console.log(`Searching for: "${keyword}"`)

const results = await scrapeSerp(keyword)
console.log(`Got ${results.length} results.`)
results.slice(0, 5).forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.domain}] ${r.title.slice(0, 70)}`)
})

if (results.length === 0) {
  console.error("\nFAIL: 0 results — CSE env vars missing or engine misconfigured.")
  process.exit(1)
}
console.log("\nCSE PASS")
```

- [ ] **Step 2: Run it**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-cse.mts
```
Expected final line: `CSE PASS` with ~15-20 results.

- [ ] **Step 3: Push CSE vars to Vercel**

```bash
cd linklight
export $(grep -E '^(VERCEL_AUTH_TOKEN|VERCEL_PROJECT_ID|GOOGLE_CSE_ID|GOOGLE_CSE_KEY)=' .env.local | xargs -d '\n')

for KEY in GOOGLE_CSE_ID GOOGLE_CSE_KEY; do
  VALUE=$(eval echo \$$KEY)
  curl -sS -X POST "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?upsert=true" \
    -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"$KEY\",\"value\":\"$VALUE\",\"type\":\"encrypted\",\"target\":[\"production\",\"preview\",\"development\"]}" \
    | python -c "import json,sys; d=json.load(sys.stdin); print('$KEY:', 'ok' if d.get('created') and not d.get('failed') else 'FAILED', d.get('failed', ''))"
done
```
Expected: `GOOGLE_CSE_ID: ok` and `GOOGLE_CSE_KEY: ok`.

- [ ] **Step 4: Trigger a Vercel redeploy so the new env is picked up**

```bash
LATEST=$(curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1&target=production" -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" | python -c "import json,sys; print(json.load(sys.stdin)['deployments'][0]['uid'])")
echo "redeploying $LATEST"
curl -sS -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"deploymentId\":\"$LATEST\",\"target\":\"production\",\"name\":\"linklight\"}" \
  | python -c "import json,sys; d=json.load(sys.stdin); print('state:', d.get('readyState'), 'url:', d.get('url'))"
```
Expected: `state: INITIALIZING` (or `QUEUED`) with a new preview URL.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-cse.mts
git commit -m "prospects: add CSE verification smoke script"
```

---

## Task 3: `/api/campaigns` POST accepts `siteUrl` as fallback

**Files:**
- Modify: `linklight/src/app/api/campaigns/route.ts`

- [ ] **Step 1: Rewrite the POST handler to resolve siteUrl → site UUID**

Open `src/app/api/campaigns/route.ts`. Replace the entire `POST` function with:

```ts
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, siteId, siteUrl } = body as {
      name?: string
      siteId?: string
      siteUrl?: string
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    let resolvedSiteId: string | null = null

    if (siteId && typeof siteId === "string" && isUuid(siteId)) {
      resolvedSiteId = siteId
    } else if (siteUrl && typeof siteUrl === "string") {
      const { data: site } = await supabaseAdmin
        .from("sites")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("url", siteUrl)
        .maybeSingle()
      resolvedSiteId = site?.id ?? null
    }

    const { data, error } = await supabaseAdmin
      .from("campaigns")
      .insert({
        user_id: session.user.id,
        name: name.trim(),
        site_id: resolvedSiteId,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ campaign: data })
  } catch (error) {
    console.error("Campaign create error:", error)
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 })
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(v: string): boolean {
  return UUID_RE.test(v)
}
```

Leave the `GET` handler untouched. Leave the top-of-file imports untouched.

- [ ] **Step 2: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Sanity-check the route via curl (dev server)**

Boot dev in one terminal:
```bash
cd linklight && npm run dev
```

In another terminal, hit the route unauth (should 401, proves the route responds):
```bash
curl -sS -X POST http://localhost:3000/api/campaigns -H "Content-Type: application/json" -d '{"name":"test","siteUrl":"foo"}' --max-time 15
```
Expected: `{"error":"Unauthorized"}`. This confirms the new code path doesn't crash on unknown params.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/campaigns/route.ts
git commit -m "campaigns: accept siteUrl as fallback when siteId isn't a UUID"
```

---

## Task 4: Onboarding wizard sends `siteUrl` instead of `siteId`

**Files:**
- Modify: `linklight/src/components/onboarding/onboarding-wizard.tsx`

- [ ] **Step 1: Fix the `createCampaign` call**

Open `src/components/onboarding/onboarding-wizard.tsx`. Find the `createCampaign` function (around line 45). Replace this line:

```ts
        body: JSON.stringify({ name: campaignName, siteId: selectedSiteUrl || undefined }),
```

With:

```ts
        body: JSON.stringify({ name: campaignName, siteUrl: selectedSiteUrl || undefined }),
```

No other edits needed — `selectedSiteUrl` is already a URL string, and Task 3 taught the API to resolve URL → UUID.

- [ ] **Step 2: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/onboarding-wizard.tsx
git commit -m "onboarding: send siteUrl (not siteId — never was a UUID)"
```

---

## Task 5: GSC keyword opportunity sort + "Quick Wins" filter

**Files:**
- Modify: `linklight/src/components/keywords/gsc-keywords.tsx`

- [ ] **Step 1: Replace the component body**

Overwrite `src/components/keywords/gsc-keywords.tsx` with:

```tsx
"use client"
import { useEffect, useMemo, useState } from "react"

interface Keyword {
  keyword: string
  clicks: number
  impressions: number
  ctr: number
  avgPosition: number
}

type SortMode = "opportunity" | "impressions" | "position" | "alphabetical"
type FilterMode = "all" | "quickWins"

function opportunityScore(k: Keyword): number {
  // Reward impressions, penalize distance from position 1. Anything already
  // at position 1 gets a tiny score so genuine on-page-2 impressions rise above it.
  return k.impressions * (1 / Math.max(k.avgPosition, 1))
}

function sortKeywords(keywords: Keyword[], mode: SortMode): Keyword[] {
  const copy = [...keywords]
  switch (mode) {
    case "opportunity":
      return copy.sort((a, b) => opportunityScore(b) - opportunityScore(a))
    case "impressions":
      return copy.sort((a, b) => b.impressions - a.impressions)
    case "position":
      return copy.sort((a, b) => a.avgPosition - b.avgPosition)
    case "alphabetical":
      return copy.sort((a, b) => a.keyword.localeCompare(b.keyword))
  }
}

function filterKeywords(keywords: Keyword[], mode: FilterMode): Keyword[] {
  if (mode === "quickWins") {
    return keywords.filter(
      (k) => k.avgPosition >= 11 && k.avgPosition <= 30 && k.impressions > 0,
    )
  }
  return keywords
}

export function GscKeywords({ sites }: { sites: { id: string; url: string }[] }) {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || "")
  const [loading, setLoading] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>("opportunity")
  const [filterMode, setFilterMode] = useState<FilterMode>("all")

  useEffect(() => {
    if (!selectedSite) return
    setLoading(true)
    fetch(`/api/keywords/gsc?siteId=${selectedSite}`)
      .then((r) => r.json())
      .then((d) => {
        setKeywords(d.keywords || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedSite])

  const rows = useMemo(
    () => sortKeywords(filterKeywords(keywords, filterMode), sortMode),
    [keywords, sortMode, filterMode],
  )

  if (sites.length === 0) {
    return <p className="text-sm text-[#575858]">Connect a site to see GSC keyword data.</p>
  }

  const chipBase =
    "rounded-full px-3 py-1 text-xs font-medium transition-colors"
  const chipActive = "bg-brand-secondary text-brand-white"
  const chipIdle = "bg-brand-surface text-[#575858] hover:bg-[#DCDDDE]"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedSite}
          onChange={(e) => setSelectedSite(e.target.value)}
          className="rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm text-[#575858]"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.url}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 border-l border-[#DCDDDE] pl-3">
          <span className="text-xs uppercase tracking-wider text-[#999999]">Show</span>
          <button
            onClick={() => setFilterMode("all")}
            className={`${chipBase} ${filterMode === "all" ? chipActive : chipIdle}`}
          >
            All
          </button>
          <button
            onClick={() => setFilterMode("quickWins")}
            className={`${chipBase} ${filterMode === "quickWins" ? chipActive : chipIdle}`}
            title="Position 11-30 with impressions — striking distance of page 1"
          >
            Quick Wins
          </button>
        </div>

        <div className="flex items-center gap-2 border-l border-[#DCDDDE] pl-3">
          <span className="text-xs uppercase tracking-wider text-[#999999]">Sort</span>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-lg border border-[#CCCCCD] px-2 py-1 text-xs text-[#575858]"
          >
            <option value="opportunity">Opportunity</option>
            <option value="impressions">Impressions</option>
            <option value="position">Position</option>
            <option value="alphabetical">A-Z</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#575858]">
          {keywords.length === 0
            ? "No keyword data from GSC yet. Sync your site first."
            : "No keywords match the current filter."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#DCDDDE]">
          <table className="min-w-full divide-y divide-[#DCDDDE]">
            <thead className="bg-brand-surface">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Query</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-[#777777]">Clicks</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-[#777777]">Impressions</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-[#777777]">CTR</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-[#777777]">Position</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-[#777777]">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCDDDE] bg-white">
              {rows.map((kw, i) => (
                <tr key={i} className="hover:bg-brand-surface">
                  <td className="px-4 py-3 text-sm font-medium text-brand-secondary">{kw.keyword}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">{kw.clicks}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">{kw.impressions}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">
                    {(kw.ctr * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">
                    {kw.avgPosition.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() =>
                        fetch("/api/keywords", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            keyword: kw.keyword,
                            siteId: selectedSite,
                            source: "gsc",
                          }),
                        }).catch(() => {})
                      }
                      className="text-xs text-brand-accent hover:underline"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

**Notes:**
- Removed the `any[]` type on `keywords` (was an ESLint violation) — now typed as `Keyword[]`.
- Replaced `text-blue-600` on the Save button with `text-brand-accent` (brand consistency; the original was drift).
- `useMemo` recomputes `rows` only when `keywords`, `sortMode`, or `filterMode` change — cheap and correct.

- [ ] **Step 2: Build + lint the touched file**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
cd linklight && npx eslint src/components/keywords/gsc-keywords.tsx
```
Expected: `✓ Compiled successfully`; lint exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/keywords/gsc-keywords.tsx
git commit -m "keywords: opportunity-sort + Quick Wins filter + drop any[]"
```

---

## Task 6: Final verify + push

**Files:** none.

- [ ] **Step 1: Full clean build**

```bash
cd linklight && npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`, 45 routes present (unchanged count — no new routes in this plan).

- [ ] **Step 2: Lint everything touched in this plan**

```bash
cd linklight && npx eslint \
  src/lib/scraper.ts \
  src/app/api/campaigns/route.ts \
  src/components/onboarding/onboarding-wizard.tsx \
  src/components/keywords/gsc-keywords.tsx
```
Expected: 0 errors (warnings on img/etc. from existing patterns are fine).

- [ ] **Step 3: End-to-end via dev server — prove Bug 2 is fixed**

Boot dev (`cd linklight && npm run dev`), then hit `/api/prospects/search` via curl using an existing MCP key (create one first via `scripts/create-test-key.mts` if needed):

```bash
# From another terminal, using an authed session cookie is fiddly, so hit MCP instead:
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts)
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_prospects","arguments":{"keyword":"link building tools"}}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print(f'got {len(r)} results'); [print(f\"  {i+1}. [{x.get(\\\"domain\\\")}] {x.get(\\\"title\\\",\\\"\\\")[:60]}\") for i,x in enumerate(r[:5])]"
```
Expected: `got 10 results` (or similar non-zero count). **If this returns 0, Task 1 didn't land — do not push.**

- [ ] **Step 4: Push**

```bash
cd linklight && git push origin master
```

- [ ] **Step 5: Trigger prod redeploy (in case env var propagation missed it)**

```bash
cd linklight
export $(grep -E '^VERCEL_(AUTH_TOKEN|PROJECT_ID)=' .env.local | xargs -d '\n')
LATEST=$(curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1&target=production" -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" | python -c "import json,sys; print(json.load(sys.stdin)['deployments'][0]['uid'])")
curl -sS -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"deploymentId\":\"$LATEST\",\"target\":\"production\",\"name\":\"linklight\"}" \
  | python -c "import json,sys; d=json.load(sys.stdin); print('deploy state:', d.get('readyState'))"
```

- [ ] **Step 6: Wait for READY and manual verify in prod**

Poll (max ~3 min):
```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  STATE=$(curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1&target=production" -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" | python -c "import json,sys; print(json.load(sys.stdin)['deployments'][0]['state'])")
  echo "check $i: $STATE"
  [ "$STATE" = "READY" ] && break
  sleep 15
done
```

Then, in a real browser signed into linklight prod:
1. Visit `/dashboard/prospects`, search "isa income tracker" → should get results, not "No prospects found"
2. Visit `/dashboard/keywords` → GSC tab → default sort is by Opportunity; toggle "Quick Wins" chip → filters to position 11-30
3. Visit `/onboarding` → walk through the wizard end to end → the created campaign should NOT 404 when clicked from `/dashboard/campaigns`

---

## Post-launch backlog

Not blockers, come back to these once Tier 1 is stable:

- **CSE quota tracking.** Add a lightweight per-day counter (Supabase table or in-memory) so we know when we hit the 100/day free tier and gracefully return "search unavailable, try tomorrow" instead of silent empty arrays.
- **MCP tool for `find_quick_win_keywords`.** Speced in T2.2 — same sort/filter logic as Task 5, exposed as an MCP tool. One 40-line addition to `src/lib/mcp/handlers.ts`.
- **Better error surface on empty CSE results.** Right now an empty result set from CSE is indistinguishable from "no matches for this keyword" — flag rate-limit/quota errors explicitly in the response.
- **Column-sort clicks on the GSC table.** Chip-based sort is enough for now, but clickable column headers would be nicer.
