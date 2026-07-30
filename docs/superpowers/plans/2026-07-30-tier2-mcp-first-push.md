# Tier 2 MCP-First Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five Tier 2 items from [docs/product/2026-07-30-mcp-first-fixes-spec.md](../../product/2026-07-30-mcp-first-fixes-spec.md) plus one Exa.ai addition: (T2.1) reframe the landing page around agent prompts; (T2.2) add three MCP tools that mirror dashboard opportunity signals — `find_quick_win_keywords`, `find_prospect_gaps`, `list_lost_backlinks`; (Exa-add) add a fourth new tool `find_similar_prospects(url)` powered by Exa.ai's `/findSimilar` endpoint; (T2.3) add a "test connection" button to the API access settings page; (T2.4) add a dev-first branch to the onboarding wizard that skips site/campaign setup; (T2.5) rewrite the README and polish `/docs/mcp` with example prompts + "What linklight won't do" section.

**Architecture:** Every task is additive. No schema migrations, no breaking API changes. Landing keeps the sign-in card but leads with an animated agent-prompt terminal. New MCP tools are new `registerTool` blocks in `src/lib/mcp/handlers.ts`. Exa gets its own thin lib file (`src/lib/exa.ts`) mirroring the pattern in `src/lib/hunter.ts`. The test-connection button hits a new session-authed endpoint that validates the user's most recent active key against the tool registry without an HTTP round trip. Dev-first onboarding is a new step ID inserted after "Welcome" — the existing 6-step flow remains for humans who pick the site+campaign branch.

**Tech Stack:** Same as prior plans — Next.js 16 App Router, Supabase (`supabaseAdmin` from `@/lib/db`), NextAuth v5 (`auth()`), TypeScript strict, Tailwind v4 brand tokens. No test framework; verification is `npm run build` + targeted `npx eslint` + one-off smoke scripts run through `tsx`. Vercel env vars via Management API + `VERCEL_AUTH_TOKEN`.

**Conventions to preserve (recap):**
- API routes use `NextRequest`/`NextResponse` + `await auth()` first
- All Supabase writes via `supabaseAdmin`
- No `any` (ESLint enforces)
- Brand tokens (`brand-secondary`, `brand-white`, etc.); grey hex literals allowed
- Commit style: lowercase prefix (`landing:`, `mcp:`, `exa:`, `onboarding:`, `docs:`), short summary

**External prerequisites (already met):**
- `TAVILY_API_KEY` in `.env.local` and on Vercel (from Tier 1)
- `EXA_API_KEY` in `.env.local` (Task 2 pushes it to Vercel)
- No new signups required

---

## File Structure

```
linklight/
├── src/lib/
│   ├── exa.ts                                        [Task 2 — new]
│   └── mcp/handlers.ts                               [Tasks 2 & 3 — extend]
├── src/app/
│   ├── page.tsx                                      [Task 1 — hero rework]
│   ├── docs/mcp/page.tsx                             [Tasks 3 & 6 — extend tools + prompts]
│   └── api/mcp/test/route.ts                         [Task 4 — new]
├── src/components/
│   ├── settings/api-key-manager.tsx                  [Task 4 — add Test button]
│   └── onboarding/onboarding-wizard.tsx              [Task 5 — dev-first branch]
├── README.md                                         [Task 6 — rewrite]
└── scripts/
    └── verify-exa.mts                                [Task 2 — smoke]
```

**File responsibilities:**
- `exa.ts` — two exported functions: `exaSearch(query, opts)` and `exaFindSimilar(url, opts)`. Same shape/style as `src/lib/hunter.ts`.
- `verify-exa.mts` — one-off smoke: calls both Exa functions end-to-end, prints result counts.
- `handlers.ts` — four new `registerTool` blocks (total tool count goes 9 → 13).
- `page.tsx` (landing) — hero left column swaps to eyebrow + headline + terminal-style prompt block; sign-in card unchanged; features grid reorders "Works with your AI agent" to first position; nav grows a "Docs" link (already present) + prominent link to `/docs/mcp`.
- `docs/mcp/page.tsx` — extends `TOOLS` list to 13 items, adds three more example prompt blocks, adds a "What linklight will NOT do" section.
- `api/mcp/test/route.ts` — POST, session-authed. Reads user's newest non-revoked API key from DB, validates it via `verifyKey`, returns `{ ok, tools: [{name}], keyPrefix }` or `{ error }`.
- `api-key-manager.tsx` — adds a "Test connection" button per key row that hits `/api/mcp/test`; renders green tick + tool count on success, red text on failure.
- `onboarding-wizard.tsx` — inserts a new step `"path"` after `"welcome"`. If user picks "AI agent", jumps straight to a generated-key + snippets step and ends. Human path stays as-is.
- `README.md` — full rewrite. One-line pitch, 30-second setup, tool list, links to hosted app + docs.

---

## Task 1: Landing page reframe

**Files:**
- Modify: `linklight/src/app/page.tsx`

- [ ] **Step 1: Reframe the hero left column**

Open `src/app/page.tsx`. Find the hero left column (the `<div>` immediately inside the two-col grid that starts with the `LINK BUILDING FOR INDIE OPERATORS` eyebrow). Replace that entire left `<div>` (up to but not including the `<div id="signin" className="mx-auto w-full max-w-md">` opening tag) with:

```tsx
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-brand-accent">
              The MCP server for SEO
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-brand-secondary sm:text-5xl">
              Give your AI agent backlink superpowers.
            </h1>
            <p className="mt-4 text-lg text-[#575858]">
              Plug linklight into Claude Desktop, Claude Code, or Cursor. Your agent
              finds prospects, drafts outreach, and monitors backlinks — you approve
              and send. Dashboard included, but the agent is the point.
            </p>

            <div className="mt-6 overflow-hidden rounded-xl border border-[#DCDDDE] bg-brand-secondary p-4 font-mono text-sm text-brand-white shadow-sm">
              <div className="flex items-center gap-2 pb-3 text-xs text-[#8B8FBB]">
                <span className="inline-block h-2 w-2 rounded-full bg-brand-accent" />
                <span>Claude</span>
              </div>
              <p><span className="text-[#8B8FBB]">&gt;</span> Find 20 SaaS directories for indie tools</p>
              <p className="mt-1 text-brand-primary">&#10003; 20 prospects added to campaign &ldquo;Q4 launch&rdquo;</p>
              <p className="mt-3"><span className="text-[#8B8FBB]">&gt;</span> Draft personalised outreach for each</p>
              <p className="mt-1 text-brand-primary">&#10003; 20 drafts ready — average spam score A</p>
              <p className="mt-3"><span className="text-[#8B8FBB]">&gt;</span> Track approvals</p>
              <p className="mt-1 text-brand-primary">&#10003; Monitoring inbox for replies</p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
              <Link
                href="/docs/mcp"
                className="rounded-lg bg-brand-accent px-4 py-2 font-medium text-white hover:opacity-90"
              >
                Get your MCP endpoint &rarr;
              </Link>
              <span className="text-[#575858]">or sign in for the dashboard →</span>
            </div>
          </div>
```

**Notes on this JSX:**
- Uses `text-brand-primary` (`#ECFBFD` — Placebo Sky) for the ✓ result lines to look distinct on the dark background.
- `#8B8FBB` is a muted lavender that reads well against `bg-brand-secondary` (#140044) for the prompt caret and Claude label. Not a brand token but close in tone.
- The right column (sign-in card) is untouched.

- [ ] **Step 2: Reorder features grid so "Works with your AI agent" is first**

Still in `src/app/page.tsx`, find the `FEATURES` const array. Move the `"Works with your AI agent"` entry (currently last) to the **first** position. Everything else in that array stays in order.

- [ ] **Step 3: Rewrite the "How it works" three steps to be agent-centric**

Find the `STEPS` const. Replace it with:

```ts
const STEPS = [
  {
    n: "01",
    title: "Connect your agent",
    body: "Sign in, generate an API key, paste one snippet into Claude Desktop / Claude Code / Cursor. 60 seconds.",
  },
  {
    n: "02",
    title: "Prompt the work",
    body: "\"Find 20 SEO blog prospects, draft personalized outreach, save as drafts.\" The agent chains tools, you review.",
  },
  {
    n: "03",
    title: "Approve and send",
    body: "Every send needs your tap. Replies land in your Gmail. Backlinks show up in Search Console automatically.",
  },
]
```

- [ ] **Step 4: Rewrite the mid-page CTA copy**

Find the CTA block near the bottom (the `<section className="border-t border-[#DCDDDE] bg-brand-primary">` block). Replace the `<h2>` and `<p>` inside with:

```tsx
          <h2 className="text-2xl font-semibold text-brand-secondary">
            Ready to give your agent the job?
          </h2>
          <p className="max-w-lg text-sm text-[#575858]">
            Sign in, get your MCP endpoint, and your agent can be building links inside two minutes.
          </p>
```

- [ ] **Step 5: Build + eyeball**

```bash
cd linklight && npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`.

Then boot dev, visit `/`, confirm:
- Hero eyebrow reads "THE MCP SERVER FOR SEO"
- Headline reads "Give your AI agent backlink superpowers."
- Terminal-style prompt block renders with three prompt/response pairs
- Features grid has "Works with your AI agent" as tile #1
- "How it works" reads agent-centric

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "landing: reframe hero around agent prompts + MCP endpoint"
```

---

## Task 2: Exa.ai library + `find_similar_prospects` MCP tool

**Files:**
- Create: `linklight/src/lib/exa.ts`
- Create: `linklight/scripts/verify-exa.mts`
- Modify: `linklight/src/lib/mcp/handlers.ts` (append one tool)

- [ ] **Step 1: Write `src/lib/exa.ts`**

```ts
// Exa.ai — https://docs.exa.ai/
// We use two endpoints:
//   POST /search        — neural + keyword search
//   POST /findSimilar   — given a URL, return semantically similar URLs

const EXA_API_KEY = process.env.EXA_API_KEY

export interface ExaResult {
  url: string
  title: string
  score: number | null
  publishedDate: string | null
}

interface ExaRawResult {
  id?: string
  url?: string
  title?: string
  score?: number
  publishedDate?: string
}

interface ExaResponse {
  results?: ExaRawResult[]
  requestId?: string
}

function normalize(items: ExaRawResult[]): ExaResult[] {
  const out: ExaResult[] = []
  for (const it of items) {
    const url = it.url || it.id
    const title = it.title?.trim() || ""
    if (!url || !title) continue
    out.push({
      url,
      title,
      score: typeof it.score === "number" ? it.score : null,
      publishedDate: it.publishedDate || null,
    })
  }
  return out
}

export async function exaSearch(
  query: string,
  opts: { numResults?: number; type?: "neural" | "keyword" | "auto" } = {},
): Promise<ExaResult[]> {
  if (!EXA_API_KEY) {
    console.warn("exaSearch: EXA_API_KEY not configured — returning [].")
    return []
  }
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": EXA_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        type: opts.type || "auto",
        numResults: Math.min(50, Math.max(1, opts.numResults || 10)),
      }),
    })
    if (!res.ok) {
      console.error("Exa /search failed:", res.status, (await res.text()).slice(0, 300))
      return []
    }
    const data = (await res.json()) as ExaResponse
    return normalize(data.results || [])
  } catch (error) {
    console.error("Exa /search error:", error)
    return []
  }
}

export async function exaFindSimilar(
  url: string,
  opts: { numResults?: number; excludeSourceDomain?: boolean } = {},
): Promise<ExaResult[]> {
  if (!EXA_API_KEY) {
    console.warn("exaFindSimilar: EXA_API_KEY not configured — returning [].")
    return []
  }
  try {
    const res = await fetch("https://api.exa.ai/findSimilar", {
      method: "POST",
      headers: { "x-api-key": EXA_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        numResults: Math.min(50, Math.max(1, opts.numResults || 10)),
        excludeSourceDomain: opts.excludeSourceDomain ?? true,
      }),
    })
    if (!res.ok) {
      console.error("Exa /findSimilar failed:", res.status, (await res.text()).slice(0, 300))
      return []
    }
    const data = (await res.json()) as ExaResponse
    return normalize(data.results || [])
  } catch (error) {
    console.error("Exa /findSimilar error:", error)
    return []
  }
}
```

- [ ] **Step 2: Write the verify script**

Create `linklight/scripts/verify-exa.mts`:

```ts
// scripts/verify-exa.mts
// End-to-end sanity for exa.ts. Prints result counts from both endpoints.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-exa.mts
import { exaSearch, exaFindSimilar } from "@/lib/exa"

const search = await exaSearch("link building tools", { numResults: 5 })
console.log(`exaSearch: ${search.length} results`)
search.slice(0, 3).forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score?.toFixed(2)}] ${r.title.slice(0, 60)}`)
})

const similar = await exaFindSimilar("https://ahrefs.com", { numResults: 5 })
console.log(`\nexaFindSimilar: ${similar.length} results`)
similar.slice(0, 3).forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score?.toFixed(2)}] ${new URL(r.url).hostname}`)
})

if (search.length === 0 || similar.length === 0) {
  console.error("\nFAIL: one endpoint returned 0")
  process.exit(1)
}
console.log("\nEXA PASS")
```

- [ ] **Step 3: Run it**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-exa.mts
```
Expected final line: `EXA PASS` with 5 results from each endpoint.

- [ ] **Step 4: Register the new MCP tool**

Open `src/lib/mcp/handlers.ts`. At the top, add to the existing imports block:

```ts
import { exaFindSimilar } from "@/lib/exa"
```

At the end of the file (after the last `registerTool({...})` block), append:

```ts
registerTool({
  name: "find_similar_prospects",
  description:
    "Given a known-good prospect URL, return semantically similar URLs via Exa.ai's neural search. Use this when the caller already has one great prospect and wants 5-20 more like it. Excludes the source domain by default.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The reference URL (e.g. https://backlinko.com/link-building-tools)",
      },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
    },
    required: ["url"],
  },
  handler: async (_userId, args) => {
    const url = String(args.url || "").trim()
    if (!url) return errorResult("url is required")
    try {
      // Basic URL validation
      new URL(url)
    } catch {
      return errorResult(`Invalid URL: ${url}`)
    }
    const limit = Math.min(50, Math.max(1, Number(args.limit) || 10))
    const results = await exaFindSimilar(url, { numResults: limit })
    const enriched = results.map((r) => {
      let domain = ""
      try {
        domain = new URL(r.url).hostname.replace(/^www\./, "")
      } catch {
        // fall through
      }
      return { url: r.url, title: r.title, score: r.score, domain }
    })
    return jsonResult(enriched)
  },
})
```

- [ ] **Step 5: Push `EXA_API_KEY` to Vercel**

```bash
cd linklight
export $(grep -E '^(VERCEL_AUTH_TOKEN|VERCEL_PROJECT_ID|EXA_API_KEY)=' .env.local | xargs -d '\n')

curl -sS -X POST "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?upsert=true" \
  -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"key\":\"EXA_API_KEY\",\"value\":\"$EXA_API_KEY\",\"type\":\"encrypted\",\"target\":[\"production\",\"preview\",\"development\"]}" \
  | python -c "import json,sys; d=json.load(sys.stdin); ok=d.get('created') and not d.get('failed'); print('EXA_API_KEY:', 'OK' if ok else 'FAILED', d.get('failed',''))"
```
Expected: `EXA_API_KEY: OK`.

- [ ] **Step 6: Build + smoke via MCP**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

Boot dev, then in another terminal:
```bash
cd linklight
KEY=$(npx tsx --env-file=.env.local scripts/create-test-key.mts)
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_similar_prospects","arguments":{"url":"https://ahrefs.com","limit":5}}}' \
  --max-time 60 \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print(f'got {len(r)} similar sites'); [print(f'  {i+1}. [{x[\"domain\"]}] {x[\"title\"][:50]}') for i,x in enumerate(r)]"
```
Expected: 5 similar-to-ahrefs prospects, none from ahrefs.com itself.

- [ ] **Step 7: Commit**

```bash
git add src/lib/exa.ts scripts/verify-exa.mts src/lib/mcp/handlers.ts
git commit -m "exa: add find_similar_prospects MCP tool via Exa.ai findSimilar"
```

---

## Task 3: Three MCP tools mirroring dashboard opportunities

**Files:**
- Modify: `linklight/src/lib/mcp/handlers.ts` (append three tools)

- [ ] **Step 1: Append `find_quick_win_keywords`**

Open `src/lib/mcp/handlers.ts`. At the end of the file, append:

```ts
interface GscKeywordRow {
  keyword: string
  clicks: number
  impressions: number
  ctr: number
  avg_position: number
}

function keywordOpportunity(row: GscKeywordRow): number {
  return row.impressions * (1 / Math.max(row.avg_position, 1))
}

registerTool({
  name: "find_quick_win_keywords",
  description:
    "Return keywords the caller's site is ranking for in Search Console, filtered to 'quick win' opportunities: position 11-30 with meaningful impressions. Sorted by opportunity score (impressions ÷ position). Use to answer 'what should I write about next?'",
  inputSchema: {
    type: "object",
    properties: {
      site_id: { type: "string", description: "UUID from list_campaigns' sites (or run list_sites first)" },
      min_impressions: { type: "integer", minimum: 1, default: 10 },
      position_min: { type: "number", minimum: 1, default: 11 },
      position_max: { type: "number", minimum: 1, default: 30 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
    required: ["site_id"],
  },
  handler: async (userId, args) => {
    const siteId = String(args.site_id || "")
    if (!siteId) return errorResult("site_id is required")

    const { data: rows } = await supabaseAdmin
      .from("keywords")
      .select("keyword, clicks, impressions, ctr, avg_position")
      .eq("user_id", userId)
      .eq("site_id", siteId)
      .eq("source", "gsc")

    if (!rows || rows.length === 0) {
      return jsonResult([])
    }

    const minImp = Number(args.min_impressions) || 10
    const posMin = Number(args.position_min) || 11
    const posMax = Number(args.position_max) || 30
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 20))

    const filtered = (rows as GscKeywordRow[])
      .filter((r) => r.impressions >= minImp && r.avg_position >= posMin && r.avg_position <= posMax)
      .map((r) => ({ ...r, opportunity: keywordOpportunity(r) }))
      .sort((a, b) => b.opportunity - a.opportunity)
      .slice(0, limit)

    return jsonResult(filtered)
  },
})
```

- [ ] **Step 2: Append `find_prospect_gaps`**

Immediately after the block above, append:

```ts
registerTool({
  name: "find_prospect_gaps",
  description:
    "Return prospects in a campaign that are missing a contact email, sorted by Domain Authority DESC. Use to answer 'which prospects should I run find_email on next?'",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
    required: ["campaign_id"],
  },
  handler: async (userId, args) => {
    const campaignId = String(args.campaign_id || "")
    if (!campaignId) return errorResult("campaign_id is required")
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 20))

    const { data } = await supabaseAdmin
      .from("prospects")
      .select("id, url, domain, title, domain_authority, status, created_at")
      .eq("user_id", userId)
      .eq("campaign_id", campaignId)
      .or("email.is.null,email.eq.")
      .order("domain_authority", { ascending: false, nullsFirst: false })
      .limit(limit)

    return jsonResult(data || [])
  },
})
```

- [ ] **Step 3: Append `list_lost_backlinks`**

Append:

```ts
registerTool({
  name: "list_lost_backlinks",
  description:
    "Return backlinks in unhealthy states (broken, unreachable, redirected). Use to answer 'what did I lose recently?' Combine with a since filter to scope to a time window.",
  inputSchema: {
    type: "object",
    properties: {
      site_id: { type: "string" },
      since: {
        type: "string",
        description: "ISO-8601 timestamp — only include backlinks whose last_health_check is after this",
      },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  handler: async (userId, args) => {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50))
    let q = supabaseAdmin
      .from("backlinks")
      .select(
        "id, site_id, source_url, target_url, anchor_text, first_seen, last_seen, is_indexed, health_status, last_health_check",
      )
      .eq("user_id", userId)
      .in("health_status", ["broken", "unreachable", "redirected"])
      .order("last_health_check", { ascending: false, nullsFirst: false })
      .limit(limit)

    if (args.site_id) q = q.eq("site_id", String(args.site_id))
    if (args.since) q = q.gt("last_health_check", String(args.since))

    const { data } = await q
    return jsonResult(data || [])
  },
})
```

- [ ] **Step 4: Extend the `TOOLS` list in `/docs/mcp` page**

Open `src/app/docs/mcp/page.tsx`. Find the `TOOLS` const array. Append these four new entries (after `list_replies`):

```ts
  { name: "find_similar_prospects", description: "Given a known-good prospect URL, return semantically similar URLs via Exa.ai. Great for 'find me 20 more like this one.'" },
  { name: "find_quick_win_keywords", description: "Return keywords ranking on GSC pages 2-3 with impressions — the striking-distance opportunities. Sorted by opportunity score." },
  { name: "find_prospect_gaps", description: "Return prospects in a campaign that are missing a contact email, sorted by Domain Authority." },
  { name: "list_lost_backlinks", description: "Return backlinks that are currently broken, unreachable, or redirected. Optionally filter by since date." },
```

- [ ] **Step 5: Build + smoke each new tool via MCP**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: `✓ Compiled successfully` with 4 more tools (13 total).

Boot dev, then verify tool count:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts)
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); print('tool count:', len(d['result']['tools'])); [print(f'  - {t[\"name\"]}') for t in d['result']['tools']]"
```
Expected: `tool count: 13` (5 lists + 3 originals + 4 new + find_similar_prospects from Task 2 = 13).

For each new tool, one round-trip:
```bash
for TOOL in find_quick_win_keywords find_prospect_gaps list_lost_backlinks; do
  echo "--- $TOOL ---"
  curl -sS -X POST http://localhost:3000/api/mcp \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":{\"site_id\":\"00000000-0000-0000-0000-000000000000\",\"campaign_id\":\"00000000-0000-0000-0000-000000000000\"}}}" \
    | python -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',{}); print('isError:', r.get('isError',False), 'content:', r.get('content',[{}])[0].get('text','')[:100])"
done
```
Expected: each returns JSON (probably `[]` since the test user's data doesn't match the fake IDs — that's fine, we're testing that the tools respond without crashing).

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/handlers.ts src/app/docs/mcp/page.tsx
git commit -m "mcp: add find_quick_win_keywords, find_prospect_gaps, list_lost_backlinks"
```

---

## Task 4: MCP "test connection" button

**Files:**
- Create: `linklight/src/app/api/mcp/test/route.ts`
- Modify: `linklight/src/components/settings/api-key-manager.tsx`

- [ ] **Step 1: Write the test endpoint**

Create `src/app/api/mcp/test/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/db"
import { toolSchemas } from "@/lib/mcp/tools"
import "@/lib/mcp/handlers"

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: key } = await supabaseAdmin
    .from("api_keys")
    .select("id, key_prefix, last_used_at, created_at")
    .eq("user_id", session.user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!key) {
    return NextResponse.json(
      { ok: false, error: "No active API key found. Create one first." },
      { status: 400 },
    )
  }

  const tools = toolSchemas()

  return NextResponse.json({
    ok: true,
    keyPrefix: key.key_prefix,
    keyId: key.id,
    lastUsedAt: key.last_used_at,
    toolCount: tools.length,
    tools: tools.map((t) => ({ name: t.name, description: t.description })).slice(0, 3),
  })
}
```

**Note:** This deliberately does not do an HTTP round-trip to `/api/mcp` itself. Reading `TOOLS` after `import "@/lib/mcp/handlers"` proves the registry is populated on the server. Verifying an actual API key via `verifyKey` isn't needed here — the presence of any non-revoked key for this user is the diagnostic value.

- [ ] **Step 2: Add the Test button to the key manager**

Open `src/components/settings/api-key-manager.tsx`. Add a new piece of state at the top of the component (near `newKey`, `error`):

```tsx
  const [testResult, setTestResult] = useState<
    | null
    | { ok: true; toolCount: number; keyPrefix: string }
    | { ok: false; error: string }
  >(null)
  const [testing, setTesting] = useState(false)
```

Add the handler:

```tsx
  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/mcp/test", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setTestResult({ ok: false, error: data.error || "Test failed" })
      } else {
        setTestResult({ ok: true, toolCount: data.toolCount, keyPrefix: data.keyPrefix })
      }
    } catch {
      setTestResult({ ok: false, error: "Network error" })
    } finally {
      setTesting(false)
    }
  }
```

Then, in the JSX, find the `"Your keys"` block header (`<h2 className="text-h3 font-semibold text-brand-secondary">Your keys</h2>`). Just after that heading's closing `</div>`, insert (before `{keys.length === 0 ? ... }`):

```tsx
        <div className="border-b border-[#DCDDDE] px-5 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={testConnection}
              disabled={testing || keys.filter((k) => !k.revoked_at).length === 0}
              className="rounded-lg border border-[#DCDDDE] bg-brand-surface px-3 py-1.5 text-xs font-medium text-brand-secondary hover:bg-[#DCDDDE] disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult && testResult.ok && (
              <span className="text-xs text-[#166534]">
                ✓ Connected. Key {testResult.keyPrefix}… &middot; {testResult.toolCount} tools available.
              </span>
            )}
            {testResult && !testResult.ok && (
              <span className="text-xs text-brand-accent">✗ {testResult.error}</span>
            )}
          </div>
        </div>
```

- [ ] **Step 3: Build + eyeball**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error|/api/mcp/test" | head -5
```
Expected: clean build, `/api/mcp/test` in the route list.

Boot dev, visit `/dashboard/settings/api-access` (requires auth). Confirm:
- New "Test connection" button appears above the key list
- Clicking it (with any non-revoked key existing) shows green `✓ Connected. Key sk_ll_…. · 13 tools available.`
- If no key exists, button is disabled

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mcp/test/route.ts src/components/settings/api-key-manager.tsx
git commit -m "mcp: add Test connection button on /dashboard/settings/api-access"
```

---

## Task 5: Dev-first onboarding branch

**Files:**
- Modify: `linklight/src/components/onboarding/onboarding-wizard.tsx`

- [ ] **Step 1: Restructure `STEPS` and add a `path` selector step**

Open `src/components/onboarding/onboarding-wizard.tsx`. Replace the current `STEPS` const with:

```ts
const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "path", label: "Setup path" },
  { id: "connect", label: "Connect Google" },
  { id: "site", label: "Add Your Site" },
  { id: "campaign", label: "First Campaign" },
  { id: "prospects", label: "Find Prospects" },
  { id: "done", label: "You're Ready" },
]
```

- [ ] **Step 2: Add a `path` state and a `jumpTo` helper near the other useState calls**

```tsx
  const [path, setPath] = useState<"human" | "agent" | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [creatingKey, setCreatingKey] = useState(false)
```

- [ ] **Step 3: Add a `createAgentKey` helper alongside `createCampaign` / `findProspects`**

```tsx
  const createAgentKey = async () => {
    setCreatingKey(true)
    setError("")
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "MCP client (onboarding)" }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to create key")
        return
      }
      setApiKey(data.raw)
    } catch {
      setError("Network error creating key")
    } finally {
      setCreatingKey(false)
    }
  }
```

- [ ] **Step 4: Insert the `path` step body**

In the JSX section that renders `{step === 0 && ...}`, `{step === 1 && ...}`, etc., insert a new block between step 0 (Welcome) and step 1 (Connect Google). Because we're inserting mid-array, everything after shifts by 1 — the existing `step === 1`, `step === 2`, etc., need to become `step === 2`, `step === 3`, etc.

Add the new step 1 block:

```tsx
        {step === 1 && (
          <div className="text-center">
            <h2 className="text-h2 font-bold text-brand-secondary">How will you use linklight?</h2>
            <p className="mt-2 text-body text-[#575858]">Pick the setup that matches how you work.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <button
                onClick={() => {
                  setPath("human")
                  nextStep()
                }}
                className="rounded-xl border border-[#DCDDDE] bg-brand-white p-6 text-left hover:border-brand-accent"
              >
                <p className="text-h3 font-bold text-brand-secondary">Dashboard</p>
                <p className="mt-1 text-sm text-[#575858]">
                  I&apos;ll connect a site, create a campaign, and drive linklight from the web app.
                </p>
              </button>
              <button
                onClick={async () => {
                  setPath("agent")
                  await createAgentKey()
                  setStep(STEPS.length - 1)
                }}
                className="rounded-xl border border-[#DCDDDE] bg-brand-white p-6 text-left hover:border-brand-accent"
              >
                <p className="text-h3 font-bold text-brand-secondary">AI agent</p>
                <p className="mt-1 text-sm text-[#575858]">
                  I&apos;ll plug linklight into Claude Desktop / Code / Cursor via MCP.
                </p>
              </button>
            </div>
          </div>
        )}
```

Then bump every existing `step === 1` → `step === 2`, `step === 2` → `step === 3`, …, `step === 5` → `step === 6`.

- [ ] **Step 5: Rewrite the final "done" step to branch on `path`**

The current final step (`step === 5` in the old numbering, `step === 6` after the bump) renders "You're All Set" with the three stat tiles. Replace its body with:

```tsx
        {step === STEPS.length - 1 && (
          <div className="text-center">
            {path === "agent" ? (
              <>
                <h2 className="text-h2 font-bold text-brand-secondary">You&apos;re ready. Plug this into your agent.</h2>
                <p className="mt-2 text-body text-[#575858]">
                  Copy the key and paste the config into Claude Desktop, Claude Code, or Cursor.
                </p>
                {apiKey ? (
                  <div className="mt-6 rounded-lg border border-brand-accent bg-[#FFF0F2] p-4">
                    <p className="text-sm text-[#575858]">This is the only time your key will be shown.</p>
                    <code className="mt-2 block overflow-x-auto rounded bg-brand-white px-3 py-2 font-mono text-xs text-brand-secondary">
                      {apiKey}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(apiKey)}
                      className="mt-3 rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white hover:bg-[#1f0066]"
                    >
                      Copy key
                    </button>
                  </div>
                ) : creatingKey ? (
                  <p className="mt-6 text-sm text-[#575858]">Generating your key…</p>
                ) : (
                  <button
                    onClick={createAgentKey}
                    className="mt-6 rounded-lg bg-brand-secondary px-6 py-3 text-sm font-medium text-brand-white hover:bg-[#1f0066]"
                  >
                    Generate my key
                  </button>
                )}
                <div className="mt-6 flex flex-col gap-3 text-sm sm:flex-row sm:justify-center">
                  <a
                    href="/docs/mcp"
                    className="rounded-lg bg-brand-accent px-4 py-2 font-medium text-white hover:opacity-90"
                  >
                    Setup snippets &rarr;
                  </a>
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="text-brand-accent hover:underline"
                  >
                    Or open the dashboard
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-h2 font-bold text-brand-secondary">You&apos;re All Set!</h2>
                <p className="mt-2 text-body text-[#575858]">
                  Your campaign is ready. Start adding prospects, writing emails, and building links.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-4">
                  <div className="rounded-lg border border-[#DCDDDE] p-4">
                    <p className="text-2xl font-bold text-brand-accent">1</p>
                    <p className="mt-1 text-sm text-[#575858]">Campaign created</p>
                  </div>
                  <div className="rounded-lg border border-[#DCDDDE] p-4">
                    <p className="text-2xl font-bold text-brand-accent">{prospectCount || "10+"}</p>
                    <p className="mt-1 text-sm text-[#575858]">Prospects found</p>
                  </div>
                  <div className="rounded-lg border border-[#DCDDDE] p-4">
                    <p className="text-2xl font-bold text-brand-accent">Ready</p>
                    <p className="mt-1 text-sm text-[#575858]">To send emails</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="mt-8 rounded-lg bg-brand-accent px-8 py-3 text-body font-medium text-white hover:opacity-90"
                >
                  Go to Dashboard
                </button>
              </>
            )}
          </div>
        )}
```

- [ ] **Step 6: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/onboarding/onboarding-wizard.tsx
git commit -m "onboarding: dev-first branch — agent path generates API key + skips wizard"
```

---

## Task 6: README rewrite + `/docs/mcp` polish

**Files:**
- Rewrite: `linklight/README.md`
- Modify: `linklight/src/app/docs/mcp/page.tsx`

- [ ] **Step 1: Rewrite README**

Overwrite `linklight/README.md` with:

````markdown
# linklight

**The MCP server for SEO.** Plug linklight into Claude Desktop, Claude Code, or Cursor and let your AI agent find prospects, draft outreach, and monitor backlinks — you approve and send.

Dashboard included. But the agent is the point.

---

## 60-second setup

1. Sign in at [lightlinks.dev](https://lightlinks.dev) with Google.
2. Go to **Settings → API Access → Generate key**. Copy it.
3. Paste this into `~/.claude/settings.json` (or your MCP client's config):

   ```json
   {
     "mcpServers": {
       "linklight": {
         "type": "http",
         "url": "https://lightlinks.dev/api/mcp",
         "headers": { "Authorization": "Bearer sk_ll_PASTE_YOUR_KEY_HERE" }
       }
     }
   }
   ```

4. Restart your MCP client. Ask your agent: *"List my linklight campaigns."*

Full docs: **[lightlinks.dev/docs/mcp](https://lightlinks.dev/docs/mcp)**.

## What your agent can do

| Tool | What it does |
|---|---|
| `search_prospects(keyword)` | Find prospect sites for a topic (Tavily-backed, DA-enriched) |
| `find_similar_prospects(url)` | Given one good prospect, return 20 more like it (Exa.ai neural search) |
| `enrich_domain(domain)` | DA + contact email + homepage title/description |
| `find_email(domain)` | Look up a contact email (Hunter) |
| `draft_email(topic)` | Write a personalised outreach email with a built-in spam score |
| `save_draft(prospect_id, subject, body)` | Save a drafted email against a prospect for you to review |
| `find_quick_win_keywords(site_id)` | Return striking-distance keywords (pages 2-3 with impressions) |
| `find_prospect_gaps(campaign_id)` | Prospects in a campaign missing an email, sorted by DA |
| `list_lost_backlinks(site_id)` | Backlinks currently broken, unreachable, or redirected |
| `list_campaigns` / `list_prospects` / `list_replies` / `list_backlinks` | Query your data |

Sending emails is **never** exposed as an MCP tool. Every send needs your manual approval in the dashboard.

## Example agent prompts

```
Find the top 20 prospects for "nextjs seo" with DA ≥ 40.
For each, draft a warm personalised email referencing their most recent post,
save each draft against the prospect, and show me the spam scores.
```

```
List my lost backlinks from the past 30 days, group by domain,
and tell me which ones are worth reaching out to.
```

```
For campaign "Q4 outreach", find prospects without emails and run find_email
on the top 10 by domain authority.
```

## Pricing

$12.99/mo. 7-day free trial, no credit card required.

## Under the hood

- Next.js 16 (Turbopack) on Vercel
- Supabase (Postgres) with RLS on every table
- NextAuth + Google OAuth (Gmail + Search Console)
- Tavily for real-time web search
- Exa.ai for semantic prospect discovery
- OpenAI for email drafting
- Moz + Hunter for enrichment

## License

Proprietary. All rights reserved.
````

- [ ] **Step 2: Extend `/docs/mcp` with more example prompts + safety section**

Open `src/app/docs/mcp/page.tsx`. Find the existing `<section className="mt-12 rounded-lg border border-[#DCDDDE] bg-brand-primary p-6">` block ("Try prompting your agent"). Replace its body (everything inside that section) with:

```tsx
          <h2 className="text-lg font-semibold text-brand-secondary">Try prompting your agent</h2>
          <div className="mt-3 space-y-3">
            <pre className="overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`Find the top 10 prospects for "nextjs seo" with DA ≥ 40.
For each, draft a warm personalized email referencing their most recent post,
save each draft against the prospect, and show me the spam scores.`}
            </pre>
            <pre className="overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`I already have one great prospect at https://backlinko.com. Use find_similar_prospects
to give me 20 more sites like it, ranked by score.`}
            </pre>
            <pre className="overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`Show me all lost backlinks from the past 14 days for my main site, grouped by
domain, then draft outreach to try to recover the top 5.`}
            </pre>
            <pre className="overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`Find my quick-win keywords, pick the top 3 by opportunity score, and suggest
content-gap articles I could write to move them onto page 1.`}
            </pre>
          </div>
```

Then, just before the `</main>` closing tag, insert a new section for safety:

```tsx
        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-brand-secondary">What linklight will NOT do</h2>
          <p className="mt-2 text-[#575858]">
            The MCP surface is deliberately narrower than your dashboard capabilities. There is no
            &ldquo;send this email&rdquo; tool and no destructive tools. Anything with real-world
            consequence stays behind a manual tap in the web app.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#575858]">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-brand-accent">&#10007;</span>
              <span>Never sends outreach — save_draft is the closest tool, and it just leaves notes for you to review.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-brand-accent">&#10007;</span>
              <span>Never deletes prospects, campaigns, or backlinks.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-brand-accent">&#10007;</span>
              <span>Never changes your billing tier or issues refunds.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-brand-accent">&#10007;</span>
              <span>Never touches other users&apos; data — every tool is scoped to the caller.</span>
            </li>
          </ul>
        </section>
```

- [ ] **Step 3: Build + eyeball**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

Boot dev, visit `/docs/mcp`. Confirm four prompt examples + "What linklight will NOT do" section render at the bottom.

- [ ] **Step 4: Commit**

```bash
git add README.md src/app/docs/mcp/page.tsx
git commit -m "docs: rewrite README as MCP-first launch pitch + polish /docs/mcp"
```

---

## Task 7: Final verify + push + prod redeploy

**Files:** none.

- [ ] **Step 1: Clean build**

```bash
cd linklight && npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`, `/api/mcp/test` present in route list.

- [ ] **Step 2: Lint touched files**

```bash
cd linklight && npx eslint \
  src/app/page.tsx \
  src/lib/exa.ts \
  src/lib/mcp/handlers.ts \
  src/app/api/mcp/test/route.ts \
  src/components/settings/api-key-manager.tsx \
  src/components/onboarding/onboarding-wizard.tsx \
  src/app/docs/mcp/page.tsx \
  2>&1 | tail -15
```
Expected: 0 errors. `<img>` warnings on the landing page are pre-existing, fine.

Note: The onboarding wizard has two pre-existing `react-hooks/set-state-in-effect` errors that are not blocking build. If they still trigger after your changes, they're the same ones flagged during Tier 1 — leave for a Tier 3 cleanup unless they got worse.

- [ ] **Step 3: End-to-end via MCP against localhost**

Boot dev. Confirm the full tool count and one Exa call:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts)
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); print('tools:', len(d['result']['tools']))"

curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_similar_prospects","arguments":{"url":"https://buffer.com","limit":3}}}' \
  --max-time 60 \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print('similar:', len(r), 'first:', r[0]['domain'] if r else 'none')"
```
Expected: `tools: 13`, `similar: 3`, first domain isn't buffer.com.

- [ ] **Step 4: Push**

```bash
cd linklight && git push origin master
```

- [ ] **Step 5: Trigger prod redeploy so `EXA_API_KEY` is baked in**

```bash
cd linklight
export $(grep -E '^VERCEL_(AUTH_TOKEN|PROJECT_ID)=' .env.local | xargs -d '\n')
LATEST=$(curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1&target=production" -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" | python -c "import json,sys; print(json.load(sys.stdin)['deployments'][0]['uid'])")
echo "redeploying $LATEST"
curl -sS -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"deploymentId\":\"$LATEST\",\"target\":\"production\",\"name\":\"linklight\"}"
```

- [ ] **Step 6: Poll for READY and eyeball prod**

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  STATE=$(curl -sS "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1&target=production" -H "Authorization: Bearer $VERCEL_AUTH_TOKEN" | python -c "import json,sys; print(json.load(sys.stdin)['deployments'][0]['state'])")
  echo "check $i: $STATE"
  [ "$STATE" = "READY" ] && break
  sleep 15
done
```

Then in a real browser signed in to lightlinks.dev:
- `/` — hero eyebrow says "THE MCP SERVER FOR SEO", terminal-style prompt block visible
- `/dashboard/settings/api-access` — "Test connection" button works, shows 13 tools
- `/onboarding` — the "How will you use linklight?" step appears; clicking "AI agent" generates a key and lands on the setup screen
- `/docs/mcp` — four example prompts + "What linklight will NOT do" section

---

## Post-launch backlog

- **Extract shared keyword-opportunity util.** Both `gsc-keywords.tsx` and the new `find_quick_win_keywords` MCP handler compute the same `impressions / max(position, 1)` score inline. If either grows more logic, promote to `src/lib/keyword-opportunity.ts`.
- **Corpus-based `find_similar_prospects` fallback.** When Exa is out of credit, fall back to `domain_facts.seen_count` co-occurrence to suggest similar prospects. Requires the corpus to be populated (which happens organically as users search).
- **Rate-limit the test endpoint.** Currently `/api/mcp/test` is unrestricted — a user could spam it. Trivial risk today; revisit if abuse patterns appear.
- **README landing GIF.** The README references a demo GIF but doesn't include one yet. Record a 30-second Claude Code session using linklight tools and drop the GIF in `public/demo.gif`, then reference it above "60-second setup".
- **MCP directory submissions.** Once prod stable, submit to the MCP-Hub / Awesome MCP lists (external, not code).
