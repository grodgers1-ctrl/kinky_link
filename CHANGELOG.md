# Changelog

## [0.2.0] — 2026-09-10

Zero-cost outreach release: real link data, verification, and spend guards.

### MCP Server

- `find_competitor_backlinks` rebuilt: candidates now come from the Common Crawl
  domain link graph (real link data, free) plus the SERP cache, and every result
  is fetch-verified to contain a live hyperlink to the competitor (anchor text +
  dofollow/nofollow included). Pages with no link are dropped; unfetchable pages
  are reported separately as `unverified`.
- New tools: `create_prospect` and `bulk_create_prospects` — close the
  find → enrich → draft → queue loop from MCP. Dedupe on (campaign, domain);
  cache-only enrichment, no paid lookups.
- Per-user daily budgets (`api_key_usage`) on every tool that can hit an
  external API; cache-served calls never count. Limits are env-overridable.
- `search_prospects` is now genuinely cache-first (was live-first despite docs).
- `verifyKey` upserts the synthetic `MCP_TEST_KEY` user so write tools pass FK.

### Data & Cost

- Common Crawl domain-graph import (`scripts/import-cc-graph.mts`): quarterly,
  resumable, filtered to queried competitors only (`cc_targets` → `cc_link_graph`).
- Moz auth fixed: supports `MOZ_API_KEY` (`x-moz-token`, modern `{targets}` shape)
  alongside legacy HMAC credentials — DA was silently null before.
- Moz monthly circuit breaker (default 45 rows/mo via `provider_usage`) —
  the 50-row free tier can no longer be exhausted by a loop; DA degrades to null.
- New tables: `verified_mentions`, `cc_targets`, `cc_link_graph`,
  `provider_usage`, `api_key_usage`; `prospect_serp_cache` gains `query_kind`.

## [0.1.0] — 2026-08-01

First public release of linklight — the MCP server for SEO.

### MCP Server

- Full MCP server at `POST /api/mcp` (Streamable HTTP, JSON-RPC 2.0) with 14 tools:
  - `search_prospects` — find link-building prospects for a keyword (Tavily + Moz DA)
  - `find_competitor_backlinks` — pages linking to a competitor in roundups/alternatives; filter to only-new with `my_domain`
  - `find_similar_prospects` — Exa.ai neural search for similar URLs
  - `enrich_domain` — Moz DA, contact email, homepage title/description
  - `find_email` — Hunter → Tomba → Apollo → ContactOut email cascade
  - `draft_email` — OpenAI-generated outreach with built-in spam score
  - `save_draft` — review-only draft saving (never auto-sends)
  - `find_quick_win_keywords` / `find_prospect_gaps` / `list_lost_backlinks`
  - `list_campaigns` / `list_prospects` / `list_replies` / `list_backlinks`
- API-key auth (`sk_ll_...`, SHA-256 hashed at rest) with self-serve key manager
- Public docs at `/docs/mcp` with client setup snippets
- Stdio bridge shim for directory-check compatibility (Glama)

### Email System

- Gmail send engine with MIME + quoted-printable + merge-tag rendering
- Open-tracking pixel + click-tracking redirects + reply detection (Gmail Pub/Sub webhook)
- Sequence builder with multi-step follow-ups and automated daily cron
- Email finder (pattern-based + provider cascade) with verification badges

### Backlink Monitor

- GSC backlink fetcher with daily sync
- Health checking (HEAD requests, rate-limited batch, destination checks)
- Google index-status checks
- Backlink history timeline + in-app notifications

### Keyword Research

- GSC query data (90-day) with save-to-track
- Google Suggest, People Also Ask, difficulty estimation

### Dashboard

- GSC performance summary, email stats, backlinks widget
- Kanban pipeline with drag-and-drop
- Campaigns, prospects, templates, sequences, keywords pages
- Onboarding wizard (6 steps), pricing page, Stripe billing (7-day trial)
- API Access settings page

### Launch Assets

- MCP-first README with animated demo GIF
- Dockerfile + submission guide for MCP directories (Glama listed)
- MIT license

### Infrastructure

- Next.js 16 (Turbopack), Supabase (Postgres, RLS enabled), NextAuth + Google OAuth
- Tavily, Exa.ai, OpenAI, Moz, Hunter/Tomba/Apollo/ContactOut integrations
- Merged daily cron: follow-ups + backlink sync + health + index checks
