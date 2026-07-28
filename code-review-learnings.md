# Code Review Learnings — Week 1

Lessons extracted from `code-review-week1.md` and applied in commit `61256be`.

---

## 1. Security

- **Server-side Supabase writes must use `supabaseAdmin` (service-role key), not the anon key.** The anon key is for public/RLS-gated reads. All API routes that mutate data (`insert`, `update`, `delete`) should use `supabaseAdmin` from `db.ts`.
- **Validate request bodies before inserting.** Name required + string, keyword max length, prospect batch cap at 50. Prevents malformed inserts and abuse.
- **`.env.local` must stay in `.gitignore`.** Already present, but worth auditing before any commit.

## 2. Error Handling

- **Every Supabase query must be wrapped in `try/catch`.** Even read queries can fail. Return structured `{ error: string }` JSON responses with appropriate HTTP status codes.
- **Every `fetch` in client components must handle errors.** Show error state in UI, don't silently swallow with `.catch(() => setRows([]))`.
- **DELETE should verify the row was actually deleted.** Check `data?.length` before returning `{ success: true }`.
- **Pipeline drag-and-drop needs rollback on failure.** Optimistic update: save previous state, restore if the PATCH fails, show error toast.

## 3. TypeScript

- **Extend NextAuth types** in `src/types/next-auth.d.ts` for both `Session` and `JWT` to include `accessToken`, `refreshToken`, `expiresAt`, and `id`. This eliminates `(session as any)` casts.
- **Replace `any[]` with typed interfaces.** `Prospect[]`, `CampaignWithSite[]`, `ProspectSearchResult[]` from `src/types/index.ts`. Catches mismatched property access at compile time.
- **Fix ESLint warnings.** Unused imports (`useEffect` in connect-site-card, `editNotes` in prospect-row, `toggle` in prospects-view) and empty interfaces (`InputProps`).

## 4. Next.js 16 Conventions

- **Use `NextRequest` not `Request`** in API route handlers. Consistent across all route files.
- **Params in route handlers must be typed as `Promise<{ id: string }>`** and awaited. This is a Next.js 16 requirement enforced by the type checker.

## 5. Brand Consistency

- **UI primitives (Button, Input) must use brand color tokens** (`bg-brand-secondary`, `text-brand-secondary`, `border-[#CCCCCD]`) not generic Tailwind grays (`bg-gray-900`, `border-gray-300`).
- **Toast colors should align with brand.** Success (green), error (`brand-accent` / `#FF224B`), warning (yellow).
- **Neutral colors should be centralized.** `#575858` (text-muted), `#999999` (placeholder), `#777777` (label), `#DCDDDE` (border), `#CCCCCD` (input border). Consider adding these as CSS variables.

## 6. UX

- **Every fetch needs loading, empty, AND error states.** The pipeline board, GSC summary, and connect-site card all had silent error states.
- **Inline edits need loading indicators.** Disable the edit/delete button while the PATCH/DELETE is in flight.
- **Pipeline drag should optimistically update but roll back on API failure.**

---

## Week 2 Additions

### Security
- **Tracking endpoints must set `user_id`** by looking up the sent event via `message_id`. Without this, open/click events are orphaned and user-scoped analytics is broken.
- **Cron endpoints need authentication.** Protect them with an `Authorization: Bearer ${CRON_SECRET}` header check.
- **Pub/Sub webhooks need request verification.** At minimum check an `X-Goog-Signature` or shared secret.
- **Store OAuth tokens with refresh logic.** Webhook handlers that reuse `access_token` from the DB must handle token expiry by exchanging the `refresh_token`.

### React
- **Never use `useState(() => { sideEffect() })`.** The initializer function runs during render, not as an effect. Use `useEffect` for data fetching.
- **`Promise.all` for parallel fetches** in effects reduces waterfall timing.

### Database
- **All foreign keys should be explicit.** `sequence_id` in `email_events` was missing `REFERENCES sequences(id)`, meaning no referential integrity.
- **Partial indexes must match query filters.** The `idx_seq_progress_next_send` index only covers `in_progress` status, but the cron query also filters `pending` rows, bypassing the index.

### Email / MIME
- **`Content-Transfer-Encoding: quoted-printable` requires the body to be QP-encoded.** Either encode it or drop the header for raw HTML.
- **Tracking pixel fallback:** if `</body>` isn't present, append the pixel to the end of the HTML rather than silently failing.
- **Merge tags should HTML-escape values** when rendering the HTML email body variant.

### Brand
- **Status badges and skeletons must use brand tokens.** `bg-brand-surface` instead of `bg-gray-100`, `bg-brand-accent` instead of `bg-red-600`.
