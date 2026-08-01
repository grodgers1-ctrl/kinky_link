# Changelog

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
