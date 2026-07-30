# MCP-First Fixes — Spec

**Date:** 2026-07-30
**Status:** For execution
**Companion:** [lightlinks_strategy.md](../../../../Downloads/lightlinks_strategy.md) (external — Downloads folder)

---

## Positioning shift

Product is now **"The MCP Server for SEO"** — the default backlink-building infrastructure for AI agents (Claude Desktop, Claude Code, Cursor, Hermes, OpenCode). The dashboard remains first-class for humans, but the MCP surface is now the primary category we compete in. Every user-facing feature has a parallel question: *what does this look like as a tool an agent calls?*

**What this changes vs. the original audit:**
- Landing page redesign (shipped last week) is now suboptimal — needs to lead with agent prompts, not a sign-in card
- Every dashboard "quick-win" feature has a mirrored MCP tool to spec/build
- Onboarding grows a dev-first path (get MCP key → skip the wizard) alongside the existing wizard
- Public `/docs/mcp` becomes as important as `/pricing` for driving sign-ups
- README + MCP directory listings become launch-critical

**What stays the same:**
- All the dashboard fixes in the original audit are still real bugs and still ship. The dashboard is the human view of the same underlying data agents consume via MCP — improving one improves both.

---

## Prioritized fix list

### Tier 1 — Blockers (ship first, ~1 day)

These are broken for both dashboard users and MCP callers today. Highest ROI per hour.

#### T1.1 — Prospect search reliability (GCSE swap)
**Why:** `scrapeSerp` in [src/lib/scraper.ts](../../src/lib/scraper.ts) hits `google.com/search` directly. From Vercel serverless (datacenter IP), Google returns a bot-detection page. Cheerio finds zero `div.g`, returns `[]`. Dashboard shows "No prospects found" on every fresh keyword; MCP's `search_prospects` tool returns empty arrays; corpus cache never populates. **This kills the core value prop for both surfaces.**

**Fix:** Replace with Google Programmable Search Engine (Custom Search). Free tier: 100 queries/day forever, JSON API, no bot detection.

- New env vars: `GOOGLE_CSE_ID`, `GOOGLE_CSE_KEY`
- Rewrite `src/lib/scraper.ts` → `searchViaCse(keyword)` returning the same `ProspectResult[]` shape
- Corpus cache in `src/lib/corpus.ts` continues to amortize the 100/day quota across all users
- Cost: $0 (free tier). At scale, $5 per 1,000 queries paid — corpus makes this negligible

**Files:** `src/lib/scraper.ts` (rewrite), `.env.local` docs (add two vars), `vercel env` (add two vars)

**MCP impact:** `search_prospects` starts returning real results. This is the single biggest MCP quality win.

#### T1.2 — Onboarding wizard's `siteId` bug (fixes campaign 404)
**Why:** [onboarding-wizard.tsx:53](../../src/components/onboarding/onboarding-wizard.tsx) sends `siteId: selectedSiteUrl` where `selectedSiteUrl` is a URL string like `"https://dividendmapper.com/"`, not a UUID. Campaigns row is created with either `site_id = NULL` (best case) or bogus data. When the user clicks that campaign, the `.select("*, sites(url)")` join fails or renders "Campaign not found."

**Fix:** In onboarding, look up the real site UUID by URL before creating the campaign. Or send the URL to the API and let it resolve.

**Files:** `src/components/onboarding/onboarding-wizard.tsx`, `src/app/api/campaigns/route.ts` (defensively resolve URL → UUID)

**MCP impact:** none directly, but the fix prevents the same class of bug leaking into the MCP `save_draft`/campaign flows.

#### T1.3 — Opportunity-sort for GSC keywords
**Why:** [gsc-keywords.tsx:54](../../src/components/keywords/gsc-keywords.tsx) renders keywords alphabetically because that's what Google returns. Users can't find their quick wins. This is a cheap fix with outsized daily-utility gain.

**Fix:** Sort by opportunity score `impressions × (1 / max(position, 1))`. Add a "Quick Wins" filter chip that limits to position 11-30 + impressions > 0.

**Files:** `src/components/keywords/gsc-keywords.tsx`

**MCP mirror (spec now, build in T2.2):** new tool `find_quick_win_keywords(site_id, min_impressions?, position_range?)` returning the same opportunity-sorted list.

---

### Tier 2 — MCP-first strategic push (~2-3 days)

These move the product from "dashboard SaaS with MCP feature" to "MCP-first product with dashboard."

#### T2.1 — Landing page reframe
**Why:** Current landing (shipped `3d12700`) is a conventional SaaS layout — logo card + features grid. Strategy says "Homepage should show prompts, not dashboards." An agent developer landing on this page today would see nothing that speaks to them.

**Fix:** Reframe hero around agent prompts. Concretely:

- New hero eyebrow: "The MCP server for SEO"
- New headline: "Give your AI agent backlink superpowers." (or similar — one round of copy iteration)
- Below headline: animated terminal-style block showing the strategy doc's example:
  ```
  Claude
  > Find 20 SaaS directories                ✓ Done
  > Submit my product                       ✓ Submitted
  > Track approvals                         ✓ Monitoring
  ```
- Right column: sign-in card stays, but adds a secondary "Or grab your MCP endpoint →" link that goes to `/docs/mcp` for developer sign-in
- Features grid stays but the "Works with your AI agent" tile moves to first position, and 2-3 tiles get rewritten to lead with agent verbs ("Your agent finds prospects", "Your agent drafts outreach", etc.)
- Existing "How it works" section reordered: (1) Connect MCP (2) Prompt your agent (3) Approve and send

**Files:** `src/app/page.tsx` (partial rewrite), no new deps, brand tokens only

#### T2.2 — Mirror dashboard opportunities into MCP tools
**Why:** Every dashboard feature that surfaces "the smart thing to do next" should have an MCP equivalent so agents can act on it. Right now the MCP tools are all read-your-data-back-generically.

**Fix — add three new tools to `src/lib/mcp/handlers.ts`:**

1. `find_quick_win_keywords(site_id, position_range?, min_impressions?)` — returns keywords sorted by opportunity score. Backed by GSC data via existing `fetchGscKeywords`.
2. `find_prospect_gaps(campaign_id)` — returns prospects in the campaign that have no email yet, sorted by DA. Enables "agent, find emails for my best 10 prospects."
3. `list_lost_backlinks(site_id, since?)` — returns backlinks that transitioned from healthy → broken/unreachable. Enables "agent, tell me what I lost this week."

Each is ~30 lines. All read-only, all use existing lib functions.

**Files:** `src/lib/mcp/handlers.ts`, `src/app/docs/mcp/page.tsx` (extend TOOLS list)

#### T2.3 — MCP "test connection" button
**Why:** First-time MCP setup is the highest-anxiety moment in the onboarding flow. Every user wonders "did I paste the config right?" A one-click test in the browser removes that friction and creates trust.

**Fix:** Add a button on `/dashboard/settings/api-access` next to each key row: **"Test connection"**. Clicking issues an `initialize` + `tools/list` from the browser (via a small `/api/mcp/test` endpoint that hits our own MCP), shows a green check + tool count on success, or the raw error on failure.

**Files:** `src/components/settings/api-key-manager.tsx` (add button), new `src/app/api/mcp/test/route.ts` (session-authed, hits `/api/mcp` server-side to validate the currently-issued keys work end-to-end)

#### T2.4 — Dev-first onboarding path
**Why:** The 6-step wizard is right for humans but wrong for developers. A Claude Code user wants to be pasting MCP config into their client in under 60 seconds, not clicking through a "Welcome" screen.

**Fix:** Add a **"I'm using an AI agent"** branch after the "Welcome" step. That branch skips the site-selection + campaign-creation steps and goes directly to a mini-page showing:
1. Generated API key (revealed once, copy button)
2. Client config snippet (same tabs as `/dashboard/settings/api-access`)
3. "Try prompting your agent:" example prompt
4. "You can add sites and campaigns later from the dashboard" link

**Files:** `src/components/onboarding/onboarding-wizard.tsx`

#### T2.5 — README + `/docs/mcp` polish for launch
**Why:** Product Hunt / Hacker News / MCP directory listings all pull from the GitHub README as their first impression. The current README is the create-next-app boilerplate.

**Fix:** Rewrite README with:
- One-line pitch ("The MCP server for SEO — plug into Claude Desktop and let your agent build backlinks")
- One animated GIF of a Claude Code session using linklight to find + email prospects
- MCP client config snippets (mirror `/docs/mcp` content)
- Tool reference table
- Link to hosted app + link to `/docs/mcp`

Also polish `/docs/mcp`:
- Add 3-4 example prompts (not just the one currently there) — one per workflow (find prospects, draft outreach, monitor backlinks, quick-win keywords)
- Add a "What linklight will NOT do" section (never send emails without approval, respects tier quotas, etc.) — builds trust

**Files:** `README.md` (full rewrite), `src/app/docs/mcp/page.tsx` (extend)

---

### Tier 3 — Dashboard polish (~2-3 days, still ship)

Not blockers, still on the roadmap. Roughly ordered by user-visible impact.

- **T3.1 — Campaign detail reorder.** Move "Email Finder" section below campaign metadata + prospect list. Add bulk actions on prospect table (add to sequence, delete, tag).
- **T3.2 — Backlink loss notifications.** The `notifications` table exists and the daily cron detects lost backlinks. Wire the cron to insert a notification row, and add an in-app notifications bell in the top nav.
- **T3.3 — Dashboard "Next 3 actions" widget.** On `/dashboard` home, add a widget that reads: (1) quick-win keywords count, (2) unresponded replies count, (3) backlinks lost this week. Each with a click-through to the relevant page. Turns the dashboard from passive → task-list.
- **T3.4 — Sequences UI.** DB tables + API route exist but the page doesn't. Build minimal list + editor. Sidebar link comes back at this point.
- **T3.5 — Prospect enrichment display.** Corpus cache stores DA, contact email, homepage title/description per domain. The prospects table doesn't show most of this. Render it inline in the prospect list.
- **T3.6 — Spam score badge in template list view.** Currently only in the editor. Add to the list so users can compare templates.

---

### Tier 4 — Moat building (weeks, defer)

The strategy doc's "proprietary graph" — the actual long-term defensibility. Not urgent.

- **T4.1 — Seeded directory corpus.** Pre-populate `domain_facts` and (a new) `prospect_lists` table with curated lists of SaaS directories, indie hacker guest post opportunities, and broken-link outreach targets. On first user search of any topic, they see the curated matches immediately alongside the SERP results. This is the "hero content" for every MCP demo.
- **T4.2 — Outreach outcome tracking.** Track which templates → which domains → which reply rates. Roll up into per-domain acceptance-rate signals. Feed back into agent prompts ("this domain responds to skyscraper pitches at 12%").
- **T4.3 — Rank tracking.** Cron-check keyword rankings weekly, store as time series. MCP tool `rank_history(keyword, site_id)` for agents to prompt on.
- **T4.4 — Internal linking suggestions.** Analyze user's own sitemap + GSC keywords, suggest internal links between existing posts. MCP tool to expose.

---

## Explicit deprioritizations

Things I would have shipped under the old framing but are now lower priority:

- **Tiered pricing (Solo/Pro/Team).** Strategy commits to $12.99 as the single price point. Keep the plan in `docs/superpowers/plans/2026-07-29-tiered-pricing.md` for later reference but don't execute now. Simplifies billing, positioning, and support.
- **Elaborate seat management for teams.** Same reason — one price, no seats to bill.
- **Marketing polish on the pricing page.** With one price, pricing is a paragraph, not a page.

---

## Execution order

1. **Tier 1 as one commit** (T1.1 + T1.2 + T1.3) — ~1 day
2. **Tier 2 as three commits** — landing rework (T2.1), then MCP tools + test (T2.2 + T2.3), then dev onboarding + docs (T2.4 + T2.5) — ~2-3 days
3. **Tier 3 as individual commits** — pick and ship as time allows
4. **Tier 4 as separate plan document** written when ready

## Next step

Write an executable plan for **Tier 1** (three fixes, one commit) using the `writing-plans` skill. Ready when you say go.
