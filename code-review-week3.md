# kinkylink Week 3 — Concise Review

Scope: backlinks, keyword research, daily cron, and dashboard widget additions in `src/` plus `vercel.json`.  
Tooling: `npm run lint` now reports **52 errors, 10 warnings** (up from 31 errors pre-Week 3).  
*Note: I checked the Week 3 migrations (`supabase/migrations/20260728120000_week3-backlinks.sql`, `20260728123000_notifications-table.sql`) to answer the DB/index questions.*

---

## Issues

### Security / Multi-tenant isolation

- **`src/app/api/check-url/route.ts:1`** — `GET` is **completely unauthenticated**. It acts as an open HTTP proxy; anyone can make HEAD requests to arbitrary URLs through your server. Add `auth()` gating or restrict to signed-in users.
- **`src/app/api/keywords/suggest/route.ts:1`**, **`paa/route.ts:1`**, **`difficulty/route.ts:1`** — All three keyword helper routes are **unauthenticated** and scrape Google. Add `auth()` or rate-limit to prevent abuse.
- **`src/app/api/backlinks/[id]/history/route.ts:17`** — History query only filters by `backlink_id`; it does **not** verify the backlink belongs to `session.user.id` before returning rows. A user could enumerate other users' backlink history by ID. Add a `backlinks` ownership check first.
- **`src/app/api/backlinks/sync/route.ts:28`** — Fetches `accounts` only by `user_id` without filtering by `provider`. If a user has multiple OAuth providers, this could pick the wrong account.
- **`src/app/api/cron/daily/route.ts:14`** — Cron auth is optional: if `CRON_SECRET` is not set, the endpoint is public. Require the secret in all environments.

### Conventions

- **Reads should use `supabase` (anon), writes `supabaseAdmin`** — violated in:
  - `src/app/api/backlinks/route.ts:18` (read uses `supabaseAdmin`)
  - `src/app/api/keywords/route.ts:12` (read uses `supabaseAdmin`)
  - `src/app/api/keywords/gsc/route.ts:20` (read uses `supabaseAdmin`)
  - `src/app/api/backlinks/sync/route.ts:16` (read uses `supabaseAdmin`)
- **`NextRequest`/`NextResponse`** — all new Week 3 routes import these correctly. Older routes (`/api/campaigns`, `/api/prospects`, `/api/prospects/search`, `/api/sites`) still use plain `Request`; standardize when touching them.
- **`params` typed as `Promise<{ id: string }>` and awaited** — correct in all new dynamic Week 3 routes (`backlinks/[id]/*`, `dashboard/backlinks/[id]/page.tsx`).
- **INSERT snake_case columns** — mostly correct, but `src/lib/health-checker.ts:97`, `src/app/api/backlinks/[id]/check-health/route.ts:38`, and `src/app/api/cron/daily/route.ts:183` insert into `backlink_history` without `checked_at` (relies on default). That is fine, but note `backlink_history` migration does not set a default for `checked_at` in the migration file (only in `supabase-schema.sql`). Verify the deployed migration has the default.
- **try/catch + structured `{ error }` responses** — all new API routes have this. Good.

### Cron / Daily job

- **`src/app/api/cron/daily/route.ts`** — Partial-failure handling is **good**: each part (follow-ups, backlink sync, health checks, index checks) is wrapped in its own `try/catch`, so one failure does not blow up the whole run.
- **`src/app/api/cron/daily/route.ts:43`, `:89`** — Uses `s: any` in `steps.find`. Type the steps array.
- **`src/app/api/cron/daily/route.ts:65`** — `to: item.prospect.email || item.prospect.url` will send to a raw URL if email is missing, which Gmail will reject. Validate email presence before sending.
- **`src/app/api/cron/daily/route.ts:51`** — Reuses stored `account.access_token` without refresh-token exchange; expired tokens cause silent send failures.
- **`src/app/api/cron/daily/route.ts:125`** — `accounts` query does not filter by `provider`; should be `.eq("provider", "google")`.
- **`src/app/api/cron/daily/route.ts:190`, `:196`** — Calls `.maybeSingle()` on an `insert()` into `notifications`. `maybeSingle()` is a select modifier; remove it from inserts.

### p-limit usage

- **`src/lib/health-checker.ts:116`** — `await Promise.all(backlinks.map(bl => limit(checkOne, bl)))` matches the p-limit v7 API (`limit(fn, arg)`). Correct. However, `checkOne` is typed `bl: any` (line 88); tighten to the backlink type.

### Error handling / UX states

- **`src/components/backlinks/backlinks-view.tsx:15`** — `fetchBacklinks` has no `try/catch`; a JSON or network error leaves `loading` stuck at `true`.
- **`src/components/backlinks/backlinks-view.tsx:29`** — `useEffect(() => { fetchBacklinks() }, [selectedSite, indexFilter])` triggers the eslint `setState-in-effect` rule and misses the `fetchBacklinks` dependency (also flagged). Move the `setLoading(true)` call inside `fetchBacklinks` itself.
- **`src/components/backlinks/backlink-detail.tsx:15`** — `checkHealth` only uses `finally`; errors are swallowed.
- **`src/components/backlinks/backlink-detail.tsx:27`** — `checkIndex` only uses `finally`; errors are swallowed.
- **`src/components/backlinks/destination-health-check.tsx:8`** — `check` only uses `finally`; errors are swallowed.
- **`src/components/backlinks/sync-button.tsx:7`** — `fetch` response is not checked; non-OK still triggers `window.location.reload()`.
- **`src/components/backlinks/health-timeline.tsx:8`** — Silently swallows fetch errors with `.catch(() => setLoading(false))`; no error state.
- **`src/components/keywords/gsc-keywords.tsx:12`** — Fire-and-forget save with `.catch(() => {})` (line 63) gives no success/error feedback.
- **`src/components/keywords/keyword-ideas.tsx:11`** — `research()` silently catches and discards all errors (line 25); no error UI.
- **`src/components/keywords/saved-keywords.tsx:22`** — `remove()` does not handle non-OK responses or network errors.
- **`src/components/dashboard/backlinks-widget.tsx:8`** — Silently swallows fetch errors with `.catch(() => {})`.
- **`src/components/keywords/gsc-keywords.tsx:9`**, **`saved-keywords.tsx:20`**, **`backlinks-view.tsx:29`** — All trigger the `setState-in-effect` eslint error.

### TypeScript

- **`any` types in new Week 3 files**:
  - `src/app/api/check-url/route.ts:26`
  - `src/app/api/cron/daily/route.ts:19`, `:43`, `:89`
  - `src/lib/health-checker.ts:28`, `:88`
  - `src/lib/keyword-service.ts:28`
  - `src/components/backlinks/backlink-detail.tsx:7`, `:10`
  - `src/components/backlinks/backlinks-table.tsx:7`
  - `src/components/backlinks/backlinks-view.tsx:7`, `:8`
  - `src/components/backlinks/destination-health-check.tsx:5`
  - `src/components/backlinks/health-timeline.tsx:5`, `:22`
  - `src/components/dashboard/backlinks-widget.tsx:6`
  - `src/components/keywords/gsc-keywords.tsx:5`, `:54`
  - `src/components/keywords/keyword-ideas.tsx:8`
  - `src/components/keywords/saved-keywords.tsx:5`, `:57`
- **`src/components/backlinks/backlinks-table.tsx:7`** — `onRefresh` prop is defined but never used.
- **`src/components/dashboard/backlinks-widget.tsx:3`** — `Link` is imported but never used.

### Brand / Colors

- **`src/components/backlinks/backlinks-summary.tsx:8`, `:12`, `:16`** — Uses Tailwind generic `green/red/yellow` status cards instead of brand tokens.
- **`src/components/backlinks/backlinks-table.tsx:44`, `:59–63`** — `text-blue-600` for links and generic `green/red/gray` index badges. Use `text-brand-accent` and brand semantic badges.
- **`src/components/backlinks/backlink-detail.tsx:51`, `:87–93`** — `text-blue-600` links and generic `green/red/gray` index badges.
- **`src/components/backlinks/destination-health-check.tsx:25`** — Generic `green/red` badge.
- **`src/components/backlinks/health-badge.tsx:2–7`** — Generic `green/yellow/red/orange/gray` health badges; not brand-aligned.
- **`src/components/backlinks/backlinks-view.tsx:94`** — Skeleton uses `bg-gray-100`.
- **`src/components/keywords/gsc-keywords.tsx:35`** — Skeleton uses `bg-gray-100`.
- **`src/components/keywords/keyword-ideas.tsx:99–102`** — Difficulty badge uses generic `red/yellow/green`.
- **`src/components/keywords/saved-keywords.tsx:31`** — Skeleton uses `bg-gray-100`.
- **`src/components/dashboard/backlinks-widget.tsx:16`, `:26`, `:30`** — Uses `text-green-600` / `text-red-600`; should use brand tokens.
- **`src/app/dashboard/page.tsx:47`** — `text-blue-600` for the "View all" link.
- **`src/app/dashboard/page.tsx:44`** — Uses `bg-white` directly instead of `bg-brand-white`.

### Database / Schema

- **`supabase/migrations/20260728120000_week3-backlinks.sql:23`** — `backlink_history.checked_at` has **no default** in the migration, while `supabase-schema.sql:90` gives it `DEFAULT NOW()`. Align them or the cron/API inserts will fail on the deployed migration.
- **`supabase/migrations/20260728120000_week3-backlinks.sql`** — `backlinks.first_seen`/`last_seen` are `DATE`, but `src/lib/gsc-backlinks.ts:51` stores ISO date strings (`YYYY-MM-DD`), which is compatible. OK.
- **Missing index** — `keywords(source)` or `keywords(user_id, keyword)` would help the upsert/lookup; current indexes (`idx_keywords_user`, `idx_keywords_site`) are minimal.
- **Good** — `backlinks` has `UNIQUE(user_id, source_url, target_url)` and indexes on `user_id`, `site_id`, `source_url`, `health_status`. `notifications` has partial index on unread rows.

### Correctness

- **`src/lib/index-checker.ts:17–18`** — Escapes the URL for use in a regex, but Google result pages often percent-encode or normalize URLs; the literal match may miss indexed pages that appear under a different form.
- **`src/lib/health-checker.ts:42–46`** — `determineHealth` returns `healthy` for 401/403. This is intentional (page exists), but should probably be `blocked` or `protected` rather than `healthy`.
- **`src/lib/keyword-service.ts:90`** — Difficulty estimate uses exact-match result counts only; extremely crude and not representative of real keyword difficulty. Fine for a Week 3 MVP, but document the limitation.
- **`src/app/api/backlinks/[id]/check-health/route.ts:29–30`** — Checks both source and target URLs but only stores the source health status. The `targetCheck` result is returned but never persisted.
- **`src/app/api/backlinks/route.ts:37–52`** — Fires four separate count queries on every list call; consider materializing counts or using a single aggregate query.
- **`src/app/api/backlinks/sync/route.ts:41`** — Sync loops over all sites for a user but uses a single account token. If the account is not the one that owns a given GSC property, the API call will 403 for that site.
- **`src/app/dashboard/backlinks/page.tsx:11`** — Uses `supabase` (anon) to read sites; fine if RLS allows it, otherwise the page will be empty.

### Vercel config

- **`vercel.json:2–5`** — Schedules `/api/cron/daily` at 14:00 UTC daily. OK, but remember Vercel free/hobby plans do not guarantee cron execution; add monitoring/alerts.
