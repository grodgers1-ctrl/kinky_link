# Personalized draft_email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `draft_email` MCP tool produce genuinely personalized drafts by fetching the prospect's actual page content (title, meta description, first paragraph) and injecting it into the AI prompt. Callers pass a new optional `prospect_url` argument; when present, the tool fetches that URL's content, hands it to `generateEmailDraft`, and the resulting email references something real about the target — not the generic "I enjoyed your work on X" placeholder that current drafts produce. When `prospect_url` is omitted, behavior is unchanged (backwards-compatible).

**Architecture:** One new fetcher `fetchProspectContext(url)` in a new file `src/lib/prospect-context.ts` — does a plain HTTP GET, extracts `<title>`, `<meta description>`, and first `<p>` via lightweight regex (no cheerio round-trip; we already left cheerio behind in Tier 1). Returns `{title, description, snippet, source: "live"}` or null. `AiDraftParams` in `src/lib/ai-writer.ts` grows a new optional `recentSnippet` field alongside the existing `articleTitle` slot — the user prompt template is extended to weave both in when set. MCP `draft_email` handler in `src/lib/mcp/handlers.ts` accepts `prospect_url`, calls `fetchProspectContext`, and passes `articleTitle` + `recentSnippet` through. No schema changes; no cache (fetches on demand — draft_email is already OpenAI-bound so an extra ~500ms HTTP is invisible next to a 1-2s LLM call).

**Tech Stack:** Same as prior plans — Next.js 16, TypeScript strict, no test framework. Verification via `npm run build` + `npx eslint` on touched files + one `verify-prospect-context.mts` smoke script + curl-against-MCP end-to-end. No new external APIs, no new env vars.

**Conventions to preserve:**
- No `any` — narrow interfaces for the fetched-page shape
- Fetcher never throws — returns null on any failure (network, parse, empty page)
- Commit style: `ai:` prefix for writer changes, `mcp:` for handler, `context:` for the new fetcher

---

## File Structure

```
linklight/
├── src/lib/
│   ├── prospect-context.ts               [Task 1 — NEW fetcher]
│   ├── ai-writer.ts                      [Task 2 — extend AiDraftParams + prompt]
│   └── mcp/handlers.ts                   [Task 3 — draft_email accepts prospect_url]
└── scripts/verify-prospect-context.mts   [Task 1 — smoke]
```

**File responsibilities:**
- `prospect-context.ts` — one exported function `fetchProspectContext(url: string): Promise<ProspectContext | null>`. Does `fetch(url)` with a short timeout, extracts three fields via regex over the raw HTML, returns them or null. No dependencies beyond native `fetch` + `AbortController`.
- `ai-writer.ts` — `AiDraftParams` grows one optional field: `recentSnippet?: string`. The user prompt template weaves in a new "Their latest published content:" line when present, and refines the "Their article title:" line to use `recentSnippet.title` when `articleTitle` is not explicitly set. Nothing else changes — the OpenAI call, response parsing, return type are all identical.
- `handlers.ts` — `draft_email` tool's `inputSchema` grows one new property: `prospect_url` (optional string). Handler fetches the context (if URL provided), maps it into the existing `articleTitle` + new `recentSnippet` params, calls `generateEmailDraft`.
- `verify-prospect-context.mts` — one-off smoke: fetches context for `https://vercel.com/blog`, prints title + snippet. Proves the parse works end-to-end without touching OpenAI.

---

## Task 1: Prospect context fetcher + smoke script

**Files:**
- Create: `linklight/src/lib/prospect-context.ts`
- Create: `linklight/scripts/verify-prospect-context.mts`

- [ ] **Step 1: Write the fetcher**

Create `src/lib/prospect-context.ts`:

```ts
export interface ProspectContext {
  url: string
  title: string | null
  description: string | null
  snippet: string | null
  source: "live"
}

const FETCH_TIMEOUT_MS = 6000
const MAX_HTML_BYTES = 500_000

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
}

function firstMatch(re: RegExp, source: string): string | null {
  const m = source.match(re)
  if (!m) return null
  const raw = m[1]?.trim()
  if (!raw) return null
  const clean = stripTags(raw)
  return clean || null
}

export async function fetchProspectContext(url: string): Promise<ProspectContext | null> {
  let normalized: string
  try {
    normalized = new URL(url.startsWith("http") ? url : `https://${url}`).toString()
  } catch {
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(normalized, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some sites 403 without a real UA
        "User-Agent": "Mozilla/5.0 (compatible; LinkLightBot/1.0; +https://lightlinks.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
    })
    if (!response.ok) return null

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("text/html")) return null

    let html = await response.text()
    if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES)

    const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html)
    const description =
      firstMatch(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html) ||
      firstMatch(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i, html)

    // First non-empty paragraph
    let snippet: string | null = null
    const pMatches = html.match(/<p[^>]*>([\s\S]{40,500}?)<\/p>/gi)
    if (pMatches) {
      for (const p of pMatches) {
        const clean = stripTags(p)
        if (clean.length >= 40) {
          snippet = clean.slice(0, 400)
          break
        }
      }
    }

    if (!title && !description && !snippet) return null

    return { url: normalized, title, description, snippet, source: "live" }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
```

**Notes:**
- Regex-based parse (not cheerio) — matches the rest of the codebase's Tier 1 shift away from HTML scrapers.
- 6-second timeout so `draft_email` doesn't hang on a slow site.
- 500 KB HTML cap so a gigantic Medium article doesn't blow memory.
- Deliberately returns `null` on any failure — callers use `context ?? null` and continue.

- [ ] **Step 2: Write the smoke script**

Create `linklight/scripts/verify-prospect-context.mts`:

```ts
// scripts/verify-prospect-context.mts
// Sanity: prove fetchProspectContext returns real title/description/snippet for
// three well-known targets covering common shapes (blog index, article, homepage).
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-prospect-context.mts
import { fetchProspectContext } from "@/lib/prospect-context"

const targets = [
  "https://vercel.com/blog",
  "https://backlinko.com/link-building-tools",
  "https://buffer.com",
]

for (const url of targets) {
  console.log(`\n=== ${url} ===`)
  const ctx = await fetchProspectContext(url)
  if (!ctx) {
    console.log("  (no context)")
    continue
  }
  console.log(`  title:       ${ctx.title?.slice(0, 80) || "-"}`)
  console.log(`  description: ${ctx.description?.slice(0, 80) || "-"}`)
  console.log(`  snippet:     ${ctx.snippet?.slice(0, 80) || "-"}`)
}

console.log("\nCONTEXT PASS (any-non-crash)")
```

- [ ] **Step 3: Run the smoke**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-prospect-context.mts
```
Expected: `CONTEXT PASS` with a title on all three. Description + snippet present on at least two.

- [ ] **Step 4: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/prospect-context.ts
```
Expected: clean build; lint exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prospect-context.ts scripts/verify-prospect-context.mts
git commit -m "context: fetchProspectContext (title + description + first-paragraph snippet)"
```

---

## Task 2: Extend `generateEmailDraft` to use context

**Files:**
- Modify: `linklight/src/lib/ai-writer.ts`

- [ ] **Step 1: Add `recentSnippet` to `AiDraftParams`**

Open `src/lib/ai-writer.ts`. Replace the existing `interface AiDraftParams` block (lines 16-23) with:

```ts
interface AiDraftParams {
  topic: string
  articleTitle?: string
  siteName?: string
  prospectName?: string
  recentSnippet?: string
  tone: "friendly" | "professional" | "direct"
  campaignType: "outreach" | "guest_post" | "resource_page" | "skyscraper" | "link_reclamation"
}
```

- [ ] **Step 2: Weave `recentSnippet` into the user prompt**

Still in `src/lib/ai-writer.ts`, replace the `userPrompt` const (around lines 47-64) with:

```ts
  const contextBlock = params.recentSnippet
    ? `\nSomething they recently published (reference this naturally, do not quote verbatim):\n${params.recentSnippet}\n`
    : ""

  const userPrompt = `Write a link building outreach email.

Context:
- Topic: ${params.topic}
- Their article title: ${params.articleTitle || "(not specified)"}
- Your site name: ${params.siteName || "(your website)"}
- Recipient name: ${params.prospectName || "(unknown)"}
${contextBlock}
Campaign type: ${params.campaignType}
Instructions: ${campaignInstructions}

Format your response as JSON with two fields:
{
  "subject": "The email subject line (max 10 words)",
  "body": "The email body as plain text, suitable for both HTML and text versions. Use {{first_name}}, {{site_name}} etc. as merge tags where appropriate."
}

Keep the body under 150 words. If you referenced their recent work, do it once, naturally, in the opening. Do not use markdown formatting.`
```

**Notes:**
- `contextBlock` is empty when `recentSnippet` is absent — the prompt renders exactly as before for backwards compatibility.
- Explicit "reference this naturally, do not quote verbatim" instruction prevents the model from doing the awkward "I really liked your paragraph that said X."

- [ ] **Step 3: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/ai-writer.ts
```
Expected: clean build; lint exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai-writer.ts
git commit -m "ai: generateEmailDraft accepts recentSnippet for personalization"
```

---

## Task 3: Wire `prospect_url` into MCP `draft_email`

**Files:**
- Modify: `linklight/src/lib/mcp/handlers.ts`

- [ ] **Step 1: Import the fetcher**

Open `src/lib/mcp/handlers.ts`. Add near the other lib imports at the top:

```ts
import { fetchProspectContext } from "@/lib/prospect-context"
```

- [ ] **Step 2: Extend the `draft_email` tool**

Find the `draft_email` handler (search for `name: "draft_email"`). It's currently defined around line 197. Replace the entire `registerTool({...})` block for `draft_email` with:

```ts
registerTool({
  name: "draft_email",
  description:
    "Generate an outreach email draft. Returns subject, HTML body, plain-text body, and a spam score (0-10, higher = better). Pass prospect_url to fetch the target's page and personalize the draft with a reference to their actual content — this dramatically improves reply rate over generic drafts.",
  inputSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "What the email is about" },
      article_title: { type: "string", description: "Their article title, if known" },
      site_name: { type: "string", description: "Your site name" },
      prospect_name: { type: "string", description: "Recipient name" },
      prospect_url: {
        type: "string",
        description:
          "Optional. If provided, the tool fetches this URL and uses its title + first paragraph to personalize the draft. Best URL is the specific post you want to reference; the homepage works too.",
      },
      tone: {
        type: "string",
        enum: ["friendly", "professional", "direct"],
        default: "friendly",
      },
      campaign_type: {
        type: "string",
        enum: ["outreach", "guest_post", "resource_page", "skyscraper", "link_reclamation"],
        default: "outreach",
      },
    },
    required: ["topic"],
  },
  handler: async (userId, args) => {
    if (!checkAiUsage(userId)) {
      return errorResult(
        `AI draft quota exhausted for today. Remaining: ${getAiUsageRemaining(userId)}`,
      )
    }

    const topic = String(args.topic || "").trim()
    if (!topic) return errorResult("topic is required")

    let articleTitle = args.article_title ? String(args.article_title) : undefined
    let recentSnippet: string | undefined

    const prospectUrl = args.prospect_url ? String(args.prospect_url).trim() : ""
    let contextSource: string | null = null
    if (prospectUrl) {
      const context = await fetchProspectContext(prospectUrl)
      if (context) {
        contextSource = context.url
        if (!articleTitle && context.title) articleTitle = context.title
        recentSnippet = context.snippet || context.description || undefined
      }
    }

    try {
      const draft = await generateEmailDraft({
        topic,
        articleTitle,
        siteName: args.site_name ? String(args.site_name) : undefined,
        prospectName: args.prospect_name ? String(args.prospect_name) : undefined,
        recentSnippet,
        tone: (args.tone as "friendly" | "professional" | "direct") || "friendly",
        campaignType:
          (args.campaign_type as
            | "outreach"
            | "guest_post"
            | "resource_page"
            | "skyscraper"
            | "link_reclamation") || "outreach",
      })

      const spam = scoreEmail({
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
        bodyText: draft.bodyText,
      })

      return jsonResult({
        ...draft,
        spamScore: spam,
        personalized: recentSnippet ? true : false,
        contextSource,
      })
    } catch (error) {
      console.error("draft_email error:", error)
      return errorResult("Failed to generate draft")
    }
  },
})
```

**Notes:**
- If the current `draft_email` handler already includes a `spamScore` call or a slightly different return shape, keep the pieces that are already working — the important structural change is the new `prospect_url` input, the `fetchProspectContext` call, and the `recentSnippet` handoff.
- `personalized` + `contextSource` fields in the response let the agent explain to the operator "I fetched https://example.com/post and used it for personalization" vs. "I couldn't fetch anything, this is a generic draft."

- [ ] **Step 3: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/mcp/handlers.ts
```
Expected: clean build; lint exits 0.

- [ ] **Step 4: End-to-end MCP smoke**

Boot dev, then:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts 2>&1 | tail -1)

# Without prospect_url — should still work, personalized: false
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"draft_email","arguments":{"topic":"link building tools roundup","tone":"friendly","campaign_type":"outreach"}}}' \
  --max-time 60 \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print('personalized:', r.get('personalized')); print('subject:', r.get('subject'))"

# With prospect_url — should fetch context and reference it
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"draft_email","arguments":{"topic":"link building tools","prospect_url":"https://backlinko.com/link-building-tools","tone":"friendly","campaign_type":"resource_page"}}}' \
  --max-time 60 \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print('personalized:', r.get('personalized')); print('contextSource:', r.get('contextSource')); print('subject:', r.get('subject')); print('body preview:', r.get('bodyText','')[:200])"
```
Expected: first call returns `personalized: false`; second call returns `personalized: True`, `contextSource: 'https://backlinko.com/link-building-tools'`, and the body should reference something specific about backlinko's post (not the generic "I enjoyed your work").

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/handlers.ts
git commit -m "mcp: draft_email accepts prospect_url for personalization"
```

---

## Task 4: Final verify + push + prod redeploy

**Files:** none.

- [ ] **Step 1: Clean sweep**

```bash
cd linklight && npm run build 2>&1 | tail -10
cd linklight && npx eslint src/lib/prospect-context.ts src/lib/ai-writer.ts src/lib/mcp/handlers.ts 2>&1 | tail -5
```
Expected: clean build; 0 lint errors.

- [ ] **Step 2: Push**

```bash
cd linklight && git push origin master
```

- [ ] **Step 3: Wait for prod auto-deploy and smoke prod**

Wait ~2 min for Vercel to auto-build. Then:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts 2>&1 | tail -1)

curl -sS -X POST https://www.lightlinks.dev/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"draft_email","arguments":{"topic":"nextjs SEO tips","prospect_url":"https://vercel.com/blog","tone":"friendly","campaign_type":"outreach"}}}' \
  --max-time 60 \
  | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print('personalized:', r.get('personalized')); print('contextSource:', r.get('contextSource')); print('subject:', r.get('subject')); print('body:', r.get('bodyText','')[:250])"
```
Expected: `personalized: True`, `contextSource: 'https://vercel.com/blog'`, subject line references Next.js or Vercel's blog, body has a specific reference to their content rather than a generic opener.

---

## Post-launch backlog

- **Cache context in `domain_facts`.** Right now every `draft_email` call with `prospect_url` refetches the page. Add two columns (`recent_snippet`, `recent_snippet_fetched_at`) with a 7-day TTL — same pattern as `contact_email` / `email_fetched_at`. Cuts latency on repeat prospects to zero and reduces load on target sites.
- **Multi-URL context.** Accept `prospect_urls: string[]` and fetch all in parallel — useful for the "here are five of their recent posts, weave them in" prompt.
- **Content-type routing.** Detect that a URL is a PDF, YouTube video, or podcast page and use appropriate metadata sources (og:image, structured data) instead of just the first paragraph.
- **Anti-hallucination guardrail.** Have the AI extract 2-3 specific facts from the snippet before drafting, then require the draft to include at least one of them. Prevents the model from paraphrasing so far that the "personalization" becomes generic again.
- **UI equivalent.** The dashboard's compose flow (via TemplateLibrary → UseTemplateDialog) still uses static templates. Once the MCP tool is proven in prod, add a "Personalize with prospect URL" checkbox + input to the compose dialog so human users get the same benefit.
