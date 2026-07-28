# kinkylink Week 2 — One-Pass Code Review

Scope: Week 2 additions in `src/` of `C:\Users\grodg\kinkyseo\linklight` (Gmail engine, templates, sequences, tracking, reply detection, campaign stats).  
Tooling notes: `npm run lint` reports **31 errors, 8 warnings** (down from 46/10 in Week 1); `npx tsc --noEmit` passes cleanly.  
*Note: I read the relevant Supabase migrations (`supabase/migrations/20260726143234_email-tracking.sql` and `20260726154645_sequences.sql`) to answer the database schema questions, even though migrations are normally out of scope.*

---

## 1. Security

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| **Critical** | `.env.local` (repo root) | 2–18 | Same Week 1 issue: real secrets are still in the working tree (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `MOZ_SECRET_KEY`). Must rotate and add `.env.local` to `.gitignore`. |
| **Critical** | `src/app/api/webhooks/gmail/route.ts` | 6–9 | Pub/Sub webhook has **no request authentication/verification**. Anyone can POST to this route and trigger Gmail history processing. Google push notifications should verify the `X-Goog-Signature` or at least a shared secret/token. |
| **Critical** | `src/app/api/webhooks/gmail/route.ts` | 24–31 | Reuses the stored `access_token` from the `accounts` table without refreshing. If the token has expired, the webhook silently fails; no refresh-token exchange is implemented. |
| High | `src/app/api/cron/send-followups/route.ts` | 10 | Cron endpoint is **unauthenticated and unrate-limited**. Anyone can trigger mass email sends by hitting this URL. Protect it with a cron secret (e.g., `Authorization: Bearer ${CRON_SECRET}`) or move it to a Vercel Cron job with a signature. |
| High | `src/app/api/email/send/route.ts` | 9–21 | `req.json()` is parsed without validation; `to`, `subject`, `bodyHtml` are not checked for length, format, or HTML safety. Consider Zod + DOMPurify for outbound email. |
| High | `src/app/api/track/open/[messageId]/route.ts` | 18–22 | Tracking insert sets `user_id` to `undefined` (omitted), so open/click events are stored with a null user. This breaks user-scoped analytics. At minimum, look up the event by `message_id` and copy `user_id` before inserting. |
| High | `src/app/api/track/click/[messageId]/route.ts` | 20–24 | Same as above: `user_id` is not set on click events. |
| Medium | `src/app/api/sequences/route.ts` | 10–46 | `steps` and `prospectIds` are not validated: empty step bodies, missing subjects, or huge prospect arrays are accepted. Add schema validation and cap `prospectIds.length`. |
| Medium | `src/app/api/sequences/[id]/enroll/route.ts` | 14–27 | Same: unvalidated bulk enrollment. No check that the sequence belongs to the current user before enrolling. |
| Medium | `src/app/api/webhooks/gmail/route.ts` | 53–92 | No verification that the replying email address matches the original recipient; auto-replies/out-of-office messages can incorrectly mark sequences as `replied`. |
| Low | `src/lib/email.ts` | 26 | MIME boundary is based on `Date.now()` + `Math.random()`. In production, use `crypto.randomUUID()` or `crypto.randomBytes()` for a stronger boundary. |
| Low | `src/app/api/track/open/[messageId]/route.ts` | 13 | `messageId` is not validated; arbitrary strings are accepted into `email_events.message_id`. |
| Low | `src/app/api/track/click/[messageId]/route.ts` | 8–16 | Same: no `messageId` validation; `destinationUrl` is decoded and redirected without allow-list checks. |
| Fixed | `src/lib/db.ts` | 15–19 | Week 2 introduced a `supabaseAdmin` service-role client and a lazy proxy for both clients. Good improvement. |
| Fixed | `src/lib/auth.ts` | 39–44 | Session now correctly carries `accessToken`/`refreshToken` via typed declarations in `src/types/next-auth.d.ts` — Week 1 `(session as any)` casts removed. |

---

## 2. Error Handling

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| High | `src/app/api/track/open/[messageId]/route.ts` | 18 | `void supabaseAdmin.from("email_events").insert(...)` — DB errors are silently discarded. Tracking events may be lost without any log. |
| High | `src/app/api/track/click/[messageId]/route.ts` | 20 | Same pattern: `void ...insert(...)` swallows errors. |
| High | `src/app/api/webhooks/gmail/route.ts` | 97–99 | Catch-all returns `200 {}` for every failure. While this prevents Pub/Sub retries, it also suppresses error telemetry; at least log the error. |
| High | `src/components/templates/template-library.tsx` | 130–145 | `useState(() => { ... })` is used as a lazy initializer, but it performs side effects (two `fetch` calls). This is a React bug: it runs during render, not as an effect, and `loading` is never set to `false` in the expected path. Should be `useEffect`. |
| Medium | `src/components/templates/template-library.tsx` | 29–40 | `remove()` only handles `res.ok`; non-OK responses and network errors are swallowed and `deleting` is reset. |
| Medium | `src/components/templates/template-library.tsx` | 147–160 | `handleSend()` only checks `res.ok`; errors are swallowed and `sending` is reset with no toast. |
| Medium | `src/components/campaigns/campaign-email-stats.tsx` | 12–17 | Errors are swallowed with `.catch(() => setStats(null))`, so the user sees skeletons forever or a blank state instead of an error message. |
| Medium | `src/components/prospects/reply-badge.tsx` | 7–12 | Errors are swallowed with `.catch(() => {})`. A transient failure hides the fact that a reply was received. |
| Low | `src/app/api/cron/send-followups/route.ts` | 99–101 | Per-item failures are counted but the specific error is discarded. OK for a cron summary, but add structured logging for debugging. |
| Low | `src/app/api/email/send/route.ts` | 62–67 | Good error response with `error` + `details`. Keep this pattern. |
| Low | `src/app/api/templates/route.ts` | 21–112 | All methods now handle errors and return structured messages. Good improvement over Week 1. |

---

## 3. TypeScript

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| Medium | `src/components/sequences/sequence-builder.tsx` | 32 | `updateStep` accepts `value: any`. Should be typed as `string | number`. |
| Medium | `src/components/templates/template-library.tsx` | 121, 134 | Two `any` types in the `UseTemplateDialog` lazy fetch. Define a `Template` type. |
| Medium | `src/app/api/sequences/route.ts` | 25 | `steps.map((step: any, ...)` — use a validated DTO type. |
| Medium | `src/lib/db.ts` | 24 | Lazy proxy uses `as any` to access the getter. Consider a more strongly-typed wrapper or importing the admin client directly where needed. |
| Medium | `src/lib/supabase-adapter.ts` | 17–98 | Many `as any` casts remain from Week 1; they drive most of the remaining lint errors. |
| Low | `src/app/api/templates/seed/route.ts` | 6 | `req` parameter is unused. |
| Low | `src/app/dashboard/templates/page.tsx` | 5 | `TemplateEditor` is imported but never used. |
| Fixed | `src/types/next-auth.d.ts` | 1–23 | JWT and Session are now properly extended with `accessToken`, `refreshToken`, `expiresAt`, and `id`. |
| Fixed | `src/lib/auth.ts` | 30–44 | Token and session assignments now use typed assertions instead of `as any`. |

---

## 4. Next.js 16 Conventions

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| Medium | `src/app/api/campaigns/route.ts` | 5, 28 | Still uses `Request` instead of `NextRequest` (Week 1 carry-over). New Week 2 routes are correct; standardize the old ones. |
| Medium | `src/app/api/prospects/route.ts` | 5, 28, 47 | Same: `Request` instead of `NextRequest`. |
| Medium | `src/app/api/prospects/search/route.ts` | 6 | Same: `Request` instead of `NextRequest`. |
| Medium | `src/app/api/sites/route.ts` | 6 | Same: `Request` instead of `NextRequest`. |
| Low | `src/app/api/sequences/[id]/enroll/route.ts` | 5–9 | `params` correctly typed as `Promise<{ id: string }>` and awaited. |
| Low | `src/app/api/track/open/[messageId]/route.ts` | 9–13 | `params` correctly typed as `Promise<{ messageId: string }>` and awaited. |
| Low | `src/app/api/track/click/[messageId]/route.ts` | 4–8 | `params` correctly typed as `Promise<{ messageId: string }>` and awaited. |
| Low | `src/app/api/campaigns/[id]/stats/route.ts` | 5–9 | `params` correctly typed as `Promise<{ id: string }>` and awaited. |
| Low | `src/app/dashboard/campaigns/[id]/page.tsx` | 6–11 | `params` correctly typed as `Promise<{ id: string }>` and awaited. |
| Low | `src/app/page.tsx` | 16, `src/components/dashboard/sidebar.tsx` | Still using `<img>` instead of Next.js `<Image />`. |

---

## 5. Email / MIME

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| High | `src/lib/email.ts` | 46–48 | `Content-Transfer-Encoding: quoted-printable` is declared, but the HTML body is inserted raw. This is incorrect MIME; either encode the body as quoted-printable or use `Content-Transfer-Encoding: 7bit/8bit` and ensure the boundary is unique. |
| Medium | `src/lib/email.ts` | 67–72 | `injectTrackedLinks` only replaces `href="http..."` attributes. It is safe because it does not inject arbitrary JS, but it should also exclude `mailto:` and `tel:` links and maybe anchor-only links. |
| Medium | `src/lib/email.ts` | 74–77 | `injectTrackingPixel` only inserts the pixel if a literal `</body>` tag exists. HTML emails often lack a body tag or use `<BODY>`, `<body >`, etc. Use a more robust fallback (append to end of string). |
| Low | `src/lib/email.ts` | 26 | Boundary string uses `Math.random()`; prefer `crypto.randomUUID()` for collision resistance. |
| Low | `src/lib/email.ts` | 29 | Subject is base64-encoded but does not include `charset="UTF-8"` in the encoded-word prefix; `=?UTF-8?B?...?=` is correct. |
| Low | `src/lib/email.ts` | 53–57 | Base64url encoding for Gmail raw payload is correct (`+` → `-`, `/` → `_`, trim `=`). |
| Low | `src/lib/email.ts` | 14–65 | No token refresh logic. If `accessToken` expired, `sendGmailEmail` will throw; callers should retry with a refreshed token. |
| Note | `src/lib/render-template.ts` | 13–22 | Simple merge-tag replacement. `{{(
+)}}` leftovers are stripped, but unescaped HTML from merge data can still be injected into email bodies. Consider HTML-escaping merge values when rendering the HTML variant. |

---

## 6. Cron / Sequences

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| High | `src/app/api/cron/send-followups/route.ts` | 10 | Endpoint is unprotected (see Security). |
| Medium | `src/app/api/cron/send-followups/route.ts` | 12–18 | No daily send cap or per-user rate limit. A misconfigured sequence could blast hundreds of emails per cron run. |
| Medium | `src/app/api/cron/send-followups/route.ts` | 80–82 | `nextSendAt` is calculated from `Date.now()` + `delay_days * 86400000`. There is no business-hours/timezone scheduling, no respect for weekends, and no throttling. |
| Medium | `src/app/api/sequences/[id]/enroll/route.ts` | 21–27 | `next_send_at` is set to `new Date().toISOString()` with `current_step: 1`, so the first step fires immediately on the next cron run. This is intentional but should be documented; if the first step should be delayed, enrollment should add the first step’s `delay_days`. |
| Medium | `src/app/api/cron/send-followups/route.ts` | 33–39 | If a step is not found, progress is marked `completed`. If step numbers are 1-based this is fine, but the code should verify that `current_step` simply exceeds the max step order rather than a missing intermediate step. |
| Low | `src/app/api/cron/send-followups/route.ts` | 14–18 | Partial index `idx_seq_progress_next_send` is used correctly. Good. |
| Low | `src/app/api/cron/send-followups/route.ts` | 56–62 | `to` falls back to `item.prospect.url` if no email exists. This will cause Gmail to reject the message; validate the email address before sending. |
| Low | `src/app/api/cron/send-followups/route.ts` | 75–76 | `subject` and `recipient` are stored but not sanitized. |
| Low | `src/app/api/webhooks/gmail/route.ts` | 83–92 | When a reply is detected, sequence progress and prospect status are updated to `replied`. This correctly pauses the sequence. Good. |

---

## 7. Database

*Based on `supabase/migrations/20260726143234_email-tracking.sql` and `supabase/migrations/20260726154645_sequences.sql`.*

| Severity | Migration / Table | Line(s) | Finding |
|---|---|---|---|
| High | `email_events` | 9 | `sequence_id UUID` is **not a foreign key** (`REFERENCES sequences(id)` missing). Integrity is not enforced and `ON DELETE` behavior is undefined. |
| Medium | `sequence_steps` | 11–21 | No index on `sequence_id`. The cron query `sequence_steps.where(sequence_id)` will scan the table at scale. |
| Medium | `sequence_progress` | 23–34 | No index on `prospect_id`. The dashboard/reply lookups may scan. |
| Medium | `email_events` | 18–22 | No index on `sequence_id`; stats/joins by sequence will scan. |
| Low | `sequence_progress` | 30 | `status` uses `'in_progress'` while the cron filters on `['pending', 'in_progress']`. The enrollment route creates `status: 'pending'` (correct). The partial index `idx_seq_progress_next_send` only covers `in_progress`, so cron will miss `pending` items. The cron query uses `.in("status", ["pending", "in_progress"])`, so the partial index will not be used for `pending` rows; performance may degrade. |
| Low | `email_events` | 5 | `user_id` is nullable. Combined with tracking routes not setting it, this produces orphaned rows. Consider `NOT NULL` + lookup from the sent event. |
| Low | `email_events` | 7–8 | `prospect_id` and `campaign_id` are `ON DELETE SET NULL`; acceptable for analytics retention. |
| Good | `templates` | 25–38 | Normalized: user-scoped, seed flag, category enum. Index on `user_id`. Good. |
| Good | `sequences` | 1–9 | Normalized: user-scoped, campaign link, status enum. Good. |
| Good | `sequence_progress` | 23–34 | `UNIQUE(sequence_id, prospect_id)` prevents duplicate enrollment. Good. |
| Good | `email_events` | 1–16 | JSONB `metadata` is appropriate for variable event payloads. Good. |

---

## 8. Brand Consistency

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| Medium | `src/components/ui/toast.tsx` | 53–55 | Still uses generic `bg-green-600`, `bg-red-600`, `bg-yellow-500` instead of brand tokens. |
| Medium | `src/components/prospects/reply-badge.tsx` | 17–25 | Uses `border-green-200`, `bg-green-50`, `text-green-700`, `text-green-800` — not brand-aligned. |
| Medium | `src/components/campaigns/campaign-email-stats.tsx` | 23 | Skeleton uses `bg-gray-100`. |
| Medium | `src/components/sequences/sequence-builder.tsx` | 55, 66, 72, 89, 102, 122, 126 | Several hardcoded neutrals (`#CCCCCD`, `#DCDDDE`, `#575858`) instead of theme tokens. |
| Medium | `src/components/templates/template-library.tsx` | 62, 76, 77, 90, 91, 92 | Hardcoded `#DCDDDE`, `#575858`, `#777777`, `#999999`, `#CCCCCD`. |
| Low | `src/components/dashboard/email-stats.tsx` | 39 | Skeleton uses `bg-gray-100`. |
| Fixed | `src/components/ui/button.tsx` | 10–14 | Now uses `brand-secondary`, `brand-surface`, `brand-accent`, etc. |
| Fixed | `src/components/ui/input.tsx` | 11 | Now uses `brand-white`, `brand-secondary`, `brand-primary` focus ring. |
| Good | `src/components/sequences/sequence-builder.tsx` | 49, 58, 117, 145 | Uses `brand-secondary`, `brand-primary`, `brand-accent`, `brand-white` for primary actions. |
| Good | `src/components/templates/template-library.tsx` | 51, 67, 71, 84 | Uses brand colors for active states and badges. |

---

## 9. UX Gaps

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| High | `src/components/templates/template-library.tsx` | 130–145 | `useState(() => { ... })` bug means the dialog data is never fetched correctly and `loading` is unused. The dialog will appear empty or stale. |
| High | `src/components/campaigns/campaign-email-stats.tsx` | 12–17 | No error state; a failed fetch leaves the skeleton showing indefinitely. |
| Medium | `src/components/sequences/sequence-builder.tsx` | 122–140 | No empty state when there are no prospects; the checkbox list is just blank. |
| Medium | `src/components/sequences/sequence-builder.tsx` | 142–148 | No confirmation or success feedback after saving a sequence. |
| Medium | `src/components/templates/template-library.tsx` | 29–40 | Delete action has no confirmation dialog; accidental deletions are possible. |
| Medium | `src/components/templates/template-library.tsx` | 147–160 | Send action has no validation feedback for missing recipient/subject. |
| Medium | `src/components/prospects/reply-badge.tsx` | 7–12 | No error or loading state; a failed fetch simply hides the badge. |
| Low | `src/app/dashboard/campaigns/[id]/page.tsx` | 22 | Uses a plain `<div>` for 404; should use a proper `not-found.tsx` or `NotFound` component. |
| Low | `src/app/dashboard/templates/page.tsx` | 17–24 | No loading or error state for the server-fetched template list; the page renders empty if Supabase fails. |
| Good | `src/components/dashboard/email-stats.tsx` | 13–52 | Has loading, error, and empty states. Good pattern. |
| Good | `src/components/templates/template-library.tsx` | 60–63 | Has an empty state for the template list. |

---

## Summary of Week 2 Priorities

1. **Security:** protect the Gmail webhook and cron endpoint; set `user_id` on tracking events; validate the Pub/Sub payload; implement token refresh in the webhook and email sender.
2. **Fix the React bug:** replace the `useState(() => { fetch... })` pattern in `template-library.tsx` with `useEffect`.
3. **Error handling:** remove `void` DB inserts in tracking routes; add error states to `campaign-email-stats` and `reply-badge`.
4. **Database:** add missing foreign key on `email_events.sequence_id` and add indexes on `sequence_steps.sequence_id`, `sequence_progress.prospect_id`, and `email_events.sequence_id`.
5. **MIME/email:** fix the quoted-printable mismatch or remove the header; robustify pixel injection and escape merge values in HTML.
6. **TypeScript:** replace the remaining `any` types in Week 2 files (sequence builder, template library, sequences API) and clean up the lazy-proxy `any` in `db.ts`.
7. **Brand:** convert generic green/red/yellow skeletons and status badges to brand tokens; centralize the remaining hardcoded neutrals.
8. **UX:** add confirmation dialogs, empty states, and success/error feedback in the sequence builder and template library.

Week 2 is a substantial feature expansion, but the unprotected cron/webhook and the `useState` side-effect bug are blockers that should be fixed before any production traffic.
