# Competitor Backlinks MCP Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an MCP tool `find_competitor_backlinks(competitor_domain, my_domain?, limit?)` that returns pages linking to (or featuring) a competitor in roundup / list / alternatives / vs. articles — the classic "who could realistically link to me if they link to my competitor" outreach list. When `my_domain` is passed, filter out domains that already link to the caller (using the `backlinks` table) so the output is exclusively **new** opportunities. Under the hood it uses the same Tavily → domain-facts enrichment pipeline that `search_prospects` already uses — no new external APIs, no schema changes.

**Architecture:** One new query builder + fetcher pair in `src/lib/corpus.ts` (mirrors `buildProspectQuery` / `getProspectsForKeyword` from Tier 3). One new `registerTool` block in `src/lib/mcp/handlers.ts`. One extension of the `/docs/mcp` TOOLS list. One smoke script. No dashboard UI in this plan — the tool is agent-facing per the strategy doc; dashboard integration can be a follow-up once we see how agents actually call it.

**Tech Stack:** Same as prior plans — Next.js 16 App Router, Supabase (`supabaseAdmin`), TypeScript strict, no test framework (verification via `npm run build` + `npx eslint` + `tsx` smoke script + curl-against-MCP). Reuses `TAVILY_API_KEY` (already in prod), `getDomainFacts` (already in `corpus.ts`), and `scrapeSerp` from `src/lib/scraper.ts`.

**Conventions to preserve:**
- API routes: `NextRequest`/`NextResponse`, `await auth()` first (though this task adds no HTTP route)
- All DB reads via `supabaseAdmin` (this tool reads `backlinks` scoped to the caller's `user_id`)
- No `any` — narrow TypeScript interfaces
- Commit style: `corpus:` prefix for the fetcher, `mcp:` for the handler, `docs:` for `/docs/mcp` update

**External prerequisites:** None. `TAVILY_API_KEY` is already on Vercel from Tier 1.

---

## File Structure

```
linklight/
├── src/lib/
│   ├── corpus.ts                             [Task 1 — add buildCompetitorBacklinkQuery + getCompetitorBacklinks]
│   └── mcp/handlers.ts                       [Task 2 — new registerTool for find_competitor_backlinks]
├── src/app/docs/mcp/page.tsx                 [Task 2 — extend TOOLS list]
└── scripts/verify-competitor-backlinks.mts   [Task 1 — smoke]
```

**File responsibilities:**
- `corpus.ts` — grows two exports: `buildCompetitorBacklinkQuery(competitor)` returns the Tavily search string that biases toward roundup / list / alternatives / vs. pages mentioning the competitor. `getCompetitorBacklinks({competitor, excludeDomains?, limit?})` runs the query, drops the competitor's own domain from results, drops any domain in `excludeDomains`, enriches survivors with `getDomainFacts`, returns a typed array.
- `handlers.ts` — new `find_competitor_backlinks` tool. Accepts `competitor_domain` (required), `my_domain` (optional — if provided, look up caller's existing backlink source domains from the `backlinks` table and pass as `excludeDomains`), and `limit` (default 20, max 50). Returns url/title/domain/DA/position, same shape as `search_prospects` for consistency.
- `/docs/mcp/page.tsx` — extends the `TOOLS` list to 14 items (was 13 after Tier 2). New entry describes the "who links to my competitor" prompt.
- `verify-competitor-backlinks.mts` — one-off smoke: runs `getCompetitorBacklinks({ competitor: "ahrefs.com", limit: 5 })`, prints domains + DA. Proves the pipeline works end-to-end without needing an auth cookie or MCP client.

---

## Task 1: Corpus helper + smoke script

**Files:**
- Modify: `linklight/src/lib/corpus.ts` (append two exports)
- Create: `linklight/scripts/verify-competitor-backlinks.mts`

- [ ] **Step 1: Add `buildCompetitorBacklinkQuery` to `corpus.ts`**

Open `src/lib/corpus.ts`. Immediately after the existing `buildProspectQuery` function (which is near the top of the file), add:

```ts
export function buildCompetitorBacklinkQuery(competitor: string): string {
  const bare = competitor.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "")
  return `"${bare}" roundup OR "best of" OR "alternatives to" OR list OR review OR "vs"`
}
```

**Notes:**
- Strips scheme/path/`www.` so callers can pass either `ahrefs.com`, `https://ahrefs.com/`, or `www.ahrefs.com` and get the same query.
- Quotes the bare domain so Tavily matches literal mentions.
- The OR-block biases toward pages that list competitors — the exact shape of "who could realistically link to me if they link to my competitor."

- [ ] **Step 2: Append `getCompetitorBacklinks` to `corpus.ts`**

At the end of `corpus.ts` (after the existing `getProspectsForKeyword` function), append:

```ts
export interface CompetitorBacklink {
  url: string
  title: string
  description: string
  domain: string
  domainAuthority: number | null
  position: number | null
}

/**
 * Find pages linking to (or featuring) a competitor in roundup/list/alternatives
 * articles — the "who could realistically link to me" outreach list. Drops the
 * competitor's own domain and any caller-provided excludeDomains before enriching.
 */
export async function getCompetitorBacklinks(opts: {
  competitor: string
  excludeDomains?: string[]
  limit?: number
}): Promise<CompetitorBacklink[]> {
  const competitorDomain = opts.competitor
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .toLowerCase()

  const query = buildCompetitorBacklinkQuery(competitorDomain)
  const raw = await scrapeSerp(query)
  if (raw.length === 0) return []

  const exclude = new Set(
    [competitorDomain, ...(opts.excludeDomains || [])].map((d) => d.toLowerCase()),
  )

  const filtered = raw.filter((r) => !exclude.has(r.domain.toLowerCase()))
  if (filtered.length === 0) return []

  const limit = Math.min(50, Math.max(1, opts.limit || 20))
  const chosen = filtered.slice(0, limit)

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

**Notes:**
- `scrapeSerp` (already imported at the top of `corpus.ts` from `@/lib/scraper`) is Tavily under the hood — no new API integration.
- `getDomainFacts` (also already in this file) does the Moz DA enrichment + cache write.
- Deduplicating domains before enriching avoids paying Moz twice for the same domain in one call.

- [ ] **Step 3: Write the smoke script**

Create `linklight/scripts/verify-competitor-backlinks.mts`:

```ts
// scripts/verify-competitor-backlinks.mts
// Sanity: prove getCompetitorBacklinks returns real, roundup-flavored results
// for a known-competitive domain. Prints hostnames + DA.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-competitor-backlinks.mts [competitor]
import { getCompetitorBacklinks, buildCompetitorBacklinkQuery } from "@/lib/corpus"

const competitor = process.argv[2] || "ahrefs.com"
console.log(`buildCompetitorBacklinkQuery("${competitor}") =`)
console.log(`  ${buildCompetitorBacklinkQuery(competitor)}`)
console.log()

const results = await getCompetitorBacklinks({ competitor, limit: 8 })
console.log(`Got ${results.length} candidate backlink sources.`)
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.domain}] DA=${r.domainAuthority ?? "?"} ${r.title.slice(0, 60)}`)
})

if (results.length === 0) {
  console.error("\nFAIL: 0 results.")
  process.exit(1)
}
console.log("\nCOMPETITOR BACKLINKS PASS")
```

- [ ] **Step 4: Run the smoke**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-competitor-backlinks.mts ahrefs.com
```
Expected: `COMPETITOR BACKLINKS PASS` with 5-8 results. None of the returned domains should be `ahrefs.com` itself.

- [ ] **Step 5: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/corpus.ts
```
Expected: clean build; lint exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/corpus.ts scripts/verify-competitor-backlinks.mts
git commit -m "corpus: buildCompetitorBacklinkQuery + getCompetitorBacklinks fetcher"
```

---

## Task 2: MCP tool + `/docs/mcp` extension

**Files:**
- Modify: `linklight/src/lib/mcp/handlers.ts` (append one tool)
- Modify: `linklight/src/app/docs/mcp/page.tsx` (extend TOOLS)

- [ ] **Step 1: Import the new helper**

Open `src/lib/mcp/handlers.ts`. Change the corpus import at the top to also pull in the new fetcher:

```ts
import { getDomainFacts, getProspectsForKeyword, getCompetitorBacklinks } from "@/lib/corpus"
```

- [ ] **Step 2: Append the `find_competitor_backlinks` tool**

At the end of `src/lib/mcp/handlers.ts` (after the last `registerTool({...})` block from Tier 2/3), append:

```ts
registerTool({
  name: "find_competitor_backlinks",
  description:
    "Return pages that link to or feature a competitor in roundups / lists / alternatives / vs. articles — the classic 'who could realistically link to me if they link to my competitor' list. Optionally excludes domains that already link to my_domain (pass my_domain to get only NEW opportunities). Returns url, title, domain, position, and Moz Domain Authority.",
  inputSchema: {
    type: "object",
    properties: {
      competitor_domain: {
        type: "string",
        description: "The competitor's domain, e.g. 'ahrefs.com'. Scheme and www. prefixes are stripped.",
      },
      my_domain: {
        type: "string",
        description:
          "Optional. If provided, domains that already appear as source_url on the caller's backlinks are filtered out so results are only NEW opportunities.",
      },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
    required: ["competitor_domain"],
  },
  handler: async (userId, args) => {
    const competitor = String(args.competitor_domain || "").trim()
    if (!competitor) return errorResult("competitor_domain is required")

    const limit = Math.min(50, Math.max(1, Number(args.limit) || 20))
    const myDomain = String(args.my_domain || "")
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./, "")
      .toLowerCase()

    let excludeDomains: string[] = []
    if (myDomain) {
      // Look up domains that already link to the caller. We pull source_url from
      // the caller's backlinks table and extract the hostname of each.
      const { data: existing } = await supabaseAdmin
        .from("backlinks")
        .select("source_url")
        .eq("user_id", userId)

      const domains = new Set<string>()
      for (const row of existing || []) {
        if (!row.source_url) continue
        try {
          const host = new URL(row.source_url).hostname.replace(/^www\./, "").toLowerCase()
          if (host) domains.add(host)
        } catch {
          // skip malformed URLs
        }
      }
      excludeDomains = Array.from(domains)
    }

    const results = await getCompetitorBacklinks({
      competitor,
      excludeDomains,
      limit,
    })

    return jsonResult({
      competitor,
      my_domain: myDomain || null,
      excluded_count: excludeDomains.length,
      results,
    })
  },
})
```

**Notes:**
- Returns a wrapper object (`{competitor, my_domain, excluded_count, results}`) rather than a bare array so the agent can see how much filtering was applied. Consistent with `find_email`'s `attempts` field — expose the diagnostic so the agent can explain "I filtered out 43 domains that already link to you."
- `excludeDomains` is computed even when `myDomain === ""` — the code path just skips the DB lookup, so the tool stays cheap for the common "just show me anyone linking to my competitor" call.

- [ ] **Step 3: Extend the `TOOLS` list in `/docs/mcp`**

Open `src/app/docs/mcp/page.tsx`. Find the `TOOLS` const array. Append one entry after the last new-in-Tier-2 tool (`list_lost_backlinks`):

```ts
  { name: "find_competitor_backlinks", description: "Find pages that link to or feature a competitor in roundups / alternatives / vs. articles. Pass my_domain to get only NEW opportunities (domains that don't already link to you)." },
```

- [ ] **Step 4: Build + lint + tool-count smoke via MCP**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/mcp/handlers.ts src/app/docs/mcp/page.tsx
```
Expected: clean build; lint exits 0.

Boot dev, then confirm the tool count went up by one and the new tool responds:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts 2>&1 | tail -1)

# Tool count should be 14 (was 13 after Tier 2)
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); tools=d['result']['tools']; print('tool count:', len(tools)); names=[t['name'] for t in tools]; print('has find_competitor_backlinks:', 'find_competitor_backlinks' in names)"

# Call it against a real competitor
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_competitor_backlinks","arguments":{"competitor_domain":"ahrefs.com","limit":5}}}' \
  --max-time 60 \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print(f'excluded: {r[\"excluded_count\"]} — got {len(r[\"results\"])} candidates'); [print(f'  {i+1}. [{x[\"domain\"]}] DA={x[\"domainAuthority\"]} {x[\"title\"][:55]}') for i,x in enumerate(r['results'])]"
```
Expected: `tool count: 14`, `has find_competitor_backlinks: True`, then 5 candidate domains, none of them `ahrefs.com`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/handlers.ts src/app/docs/mcp/page.tsx
git commit -m "mcp: add find_competitor_backlinks tool (Tavily-backed, DA-enriched)"
```

---

## Task 3: Final verify + push + prod redeploy

**Files:** none.

- [ ] **Step 1: Full lint + build sweep**

```bash
cd linklight && npm run build 2>&1 | tail -10
cd linklight && npx eslint \
  src/lib/corpus.ts \
  src/lib/mcp/handlers.ts \
  src/app/docs/mcp/page.tsx \
  2>&1 | tail -10
```
Expected: clean build; 0 lint errors.

- [ ] **Step 2: End-to-end via prod MCP (uses `TAVILY_API_KEY` already deployed)**

Push first so the code is live:
```bash
cd linklight && git push origin master
```

Wait ~2 minutes for Vercel to auto-build. Then verify the tool count on prod and run one live call:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts 2>&1 | tail -1)

curl -sS -X POST https://www.lightlinks.dev/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); tools=[t['name'] for t in d['result']['tools']]; print('tools:', len(tools)); print('has find_competitor_backlinks:', 'find_competitor_backlinks' in tools)"

# Real competitor call against prod
curl -sS -X POST https://www.lightlinks.dev/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_competitor_backlinks","arguments":{"competitor_domain":"buffer.com","limit":5}}}' \
  --max-time 60 \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print(f'excluded: {r[\"excluded_count\"]} — got {len(r[\"results\"])} candidates'); [print(f'  {i+1}. [{x[\"domain\"]}] DA={x[\"domainAuthority\"]} {x[\"title\"][:55]}') for i,x in enumerate(r['results'])]"
```
Expected: `tools: 14`, `has find_competitor_backlinks: True`, 5 candidate domains for buffer.com, none of them buffer.com itself.

- [ ] **Step 3: Poll prod deployment for READY (in case auto-deploy is slow)**

```bash
cd linklight
export $(grep -E '^VERCEL_(AUTH_TOKEN|PROJECT_ID)=' .env.local | xargs -d '\n')
curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=2&target=production" \
  -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" \
  | python -c "import json,sys; [print(f'{x[\"state\"]:12} {x[\"uid\"]} {x.get(\"meta\",{}).get(\"githubCommitMessage\",\"?\")[:60]}') for x in json.load(sys.stdin)['deployments']]"
```
Expected: latest deployment shows the `mcp: add find_competitor_backlinks tool` commit message in `READY` state. If not READY, wait 60s and re-check.

---

## Post-launch backlog

- **Dashboard UI for competitor backlinks.** A new `/dashboard/competitors` page that takes a competitor URL, calls the tool, renders the DA-sorted table, and offers a bulk "Add all to campaign" button. Enables the screencast to show the human-side of the workflow alongside the agent side.
- **Multi-competitor support.** Accept `competitor_domains: string[]` and dedupe results across the union. A common indie-SEO prompt is "find everyone linking to Ahrefs, Semrush, or Moz." One-line change to the `getCompetitorBacklinks` signature.
- **Score by exclusivity.** Right now results are sorted by SERP position. A better sort is: domains that link to *many* competitors but not to `my_domain` — those are the highest-value gaps. Requires calling the tool once per competitor and intersecting sets.
- **Cache competitor queries.** Right now every call hits Tavily fresh. `getProspectsForKeyword` writes to `prospect_serp_cache`; the competitor query could reuse the same cache with a key like `competitor:<domain>`. Trivial add — pass `normalizeKeyword(query)` through the existing cache path in `corpus.ts`.
- **"Broken link on competitor domain" flavor.** A variant that finds pages linking to *dead* URLs on the competitor's site — the classic broken-link outreach. Needs a live health check on each link (health-checker infra already exists from Tier 3). Higher effort, huge outreach quality.
