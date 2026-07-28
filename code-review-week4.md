# kinkylink Week 4 — Concise Review

Scope: email finder, AI writer, Stripe billing, onboarding, and related page/component updates.  
Tooling: `npm run lint` now reports **67 errors, 9 warnings** (up from 52 errors pre-Week 4).  
*Note: I checked `supabase/migrations/20260728153000_subscriptions.sql` and `supabase-schema.sql` to answer the schema questions.*

---

## Issues

### Security

- **`src/app/api/check-url/route.ts:1`** — Still completely unauthenticated (Week 3 carry-over). Open HTTP proxy; gate behind `auth()` before shipping.
- **`src/app/api/ai/draft/route.ts:5`** — AI route is auth-gated, but the daily limit is enforced via an **in-memory `Map`**. Serverless cold starts reset the count, and multiple instances do not share state; a user can exceed 5/day by hitting different pods. Move usage tracking to the DB or Redis for production.
- **`src/app/api/billing/create-checkout/route.ts:7`** — Auth-gated and uses `session.user.email`, good. But it does not verify the selected `plan` string is valid; invalid values silently fall back to `MONTHLY_PRICE_ID`.
- **`src/app/api/webhooks/stripe/route.ts:7`** — Webhook is unauthenticated by design (Stripe verifies via signature), and signature verification is present. Good.
- **`src/app/api/webhooks/stripe/route.ts:21`** — `userId` is read from `eventData.metadata.userId`, which is set at checkout. Acceptable, but if a user manually creates a checkout session with another user's `userId` in metadata, the webhook will update the wrong user. The metadata is write-protected by Stripe, so this is low risk.
- **`src/app/api/prospects/find-email/route.ts:7`** — Both `prospectIds` and `campaignId` paths are properly scoped to `session.user.id`. Good.
- **`src/app/api/prospects/verify-email/route.ts:7`** and **`verify-batch/route.ts:7`** — Properly gated and scoped. Good.

### Stripe / Billing

- **`src/app/api/billing/create-checkout/route.ts:36`** — `integration_identifier` is not a valid Stripe Checkout Session parameter. Stripe will reject this field. Remove it or use Stripe's `client_reference_id` if you need to tag the session.
- **`src/app/api/billing/create-checkout/route.ts:28–35`** — `trial_period_days` is applied unconditionally. If a returning customer starts a second checkout, they may get another free trial. Add logic to skip the trial for existing customers.
- **`src/app/api/billing/create-checkout/route.ts:37–38`** — Uses `process.env.AUTH_URL` directly; no fallback for local development. Add a `BASE_URL` helper with a default.
- **`src/app/api/billing/portal/route.ts:6`** — Does not import `NextRequest`, but the route takes no params so this is fine.
- **`src/app/api/billing/portal/route.ts:19`** — Returns `400 "No subscription found"` if the user has no Stripe customer ID. A better UX would redirect to checkout instead of an error.
- **`src/app/api/webhooks/stripe/route.ts:36–37`** — `new Date(sub.trial_end * 1000).toISOString()` will produce `"1970-01-01T00:00:00.000Z"` if `trial_end` is `null` or `0`. Guard before converting.
- **`src/app/api/webhooks/stripe/route.ts:48`** — `current_period_end` may also be `null` for incomplete subscriptions; guard before converting.
- **`src/app/api/webhooks/stripe/route.ts:29`** — `subscriptions.retrieve` is cast with `as any`; use the typed Stripe SDK response.
- **`src/app/api/webhooks/stripe/route.ts:70–72`** — Webhook catches DB errors and still returns `200`, which is correct for Stripe, but you should also log or alert so you know updates failed.
- **`src/lib/stripe.ts:5–11`** — `getStripe()` throws at runtime if `STRIPE_SECRET_KEY` is missing. Good for safety, but ensure build-time import of this file in a serverless environment does not instantiate Stripe during build (lazy function avoids this). OK.
- **`src/lib/stripe.ts:18–19`** — Fallback price IDs (`"price_monthly"`, `"price_yearly"`) are invalid placeholders. If env vars are missing, checkout will fail at Stripe. Either fail fast or document that these must be set.
- **`supabase/migrations/20260728153000_subscriptions.sql:7`** — `trial_end` default is `NOW() + INTERVAL '7 days'`, which sets the trial end at the moment the user row is created, not at subscription creation. This default is fine for schema but the Stripe webhook should overwrite it.
- **`supabase-schema.sql:11`** — `subscription_plan` defaults to `'monthly'`, but the webhook writes `'monthly'`/`'yearly'`/`'none'`. The default `'monthly'` for a trialing user with no plan is slightly misleading; consider `'none'` default.

### Conventions

- **API route params** — all dynamic routes reviewed correctly use `Promise<{ id: string }>` and `await`. No new dynamic routes in Week 4.
- **INSERT snake_case** — new routes mostly correct; `email` updates in `find-email`, `verify-email`, `verify-batch` use `email`, `email_verified`, `updated_at` correctly.
- **NextRequest/NextResponse** — new routes use them correctly. `portal/route.ts` only uses `NextResponse` (no params) which is acceptable.
- **Supabase reads/writes** — `pricing/page.tsx:10`, `settings/page.tsx:10`, and `dashboard/page.tsx:14` use `supabase` (anon) for reads. The `campaigns/[id]/page.tsx` uses `supabaseAdmin` for reads (convention violation). Writes use `supabaseAdmin` everywhere.
- **try/catch + structured `{ error }`** — all new API routes have this. Good.

### AI / Email Finder

- **`src/lib/ai-writer.ts:66–75`** — `gpt-4o-mini` with `response_format: { type: "json_object" }` is correct. The prompt asks for JSON with `subject` and `body`, and the code parses it. Good.
- **`src/lib/ai-writer.ts:83–87`** — HTML conversion is naive: it wraps paragraphs in `<p>` and then replaces all `\n` with `<br/>`, including `\n` inside `<p>` tags. This can produce invalid HTML like `<p>...<br/></p>` but is generally harmless.
- **`src/lib/ai-writer.ts:94`** — Catches error and throws generic "Failed to generate email draft"; OK.
- **`src/lib/ai-writer.ts:100–122`** — In-memory usage counter. As noted under Security, this is not reliable across serverless instances. Fine for MVP, but not production.
- **`src/lib/email-finder.ts:102–121`** — `findEmail` only runs heuristics; it does not actually call Hunter inside the loop. The API route calls `hunterFindEmail` as a fallback. Good separation.
- **`src/lib/email-finder.ts:54`** — `pattern` field is generated incorrectly (e.g., `first@domain` for all patterns). This is only metadata; low impact.
- **`src/lib/email-finder.ts:85–90`** — `isKnownProvider` marks Gmail/Outlook/Yahoo as `likely`. This is a heuristic, but consumer providers do not validate that the mailbox exists, so it may be over-confident.
- **`src/lib/hunter.ts:13–14`** — API key is passed in the query string. This is how Hunter's API works, but it will appear in any upstream logs. Acceptable given Hunter's design.
- **`src/lib/hunter.ts:27–32`** — Uses `any` for email filters; add a Hunter email type.
- **`src/lib/hunter.ts:61`** — `data?.data?.status` can be any string; the return type claims `"valid" | "invalid" | "unknown"`. Stripe/validate or cast.
- **`src/app/api/ai/draft/route.ts:39`** — `catch (error: any)` — replace with typed error handling.
- **`src/app/api/prospects/find-email/route.ts:42`** — `results: any[]` — define a typed result.

### Onboarding / Components

- **`src/components/onboarding/onboarding-wizard.tsx:24–34`** — `useEffect` depends on `step` but not `fetchBacklinks` (no `useCallback`), so it will refetch sites on every render where `step` changes. Fine, but add dependency linting.
- **`src/components/onboarding/onboarding-wizard.tsx:29`** — Maps site list with synthetic IDs `site_${i}` and stores `site.url` as `selectedSite`. It does not persist the selected site to the DB or create a campaign linked to it.
- **`src/components/onboarding/onboarding-wizard.tsx:44–53`** — `createCampaign` posts to `/api/campaigns` with only `name`; no `siteId`. The campaign is not linked to the selected site.
- **`src/components/onboarding/onboarding-wizard.tsx:60–62`** — Reads `data.prospects?.length` from `/api/prospects/search`, but that route returns `{ results: [...] }`, not `prospects`. The count will always be `0`.
- **`src/components/onboarding/onboarding-wizard.tsx:49, 64`** — `createCampaign` and `findProspects` silently swallow errors and proceed to the next step. Add error state and prevent advancing on failure.
- **`src/components/onboarding/onboarding-wizard.tsx:115`** — `window.location.href = "/api/auth/signin/google"` is a hard redirect. Prefer NextAuth's `signIn("google")` to respect the configured callback URL.
- **`src/components/billing/billing-settings.tsx:17`** — Calls `Date.now()` during render, which React's new eslint purity rule flags. Compute `daysLeft` in a `useEffect` or memoize it.
- **`src/components/billing/billing-settings.tsx:4`** — `subscription: any` — type it with the user subscription fields.
- **`src/components/billing/billing-settings.tsx:8–13`** — `handleManage` does not check `res.ok` or handle network errors; `setLoading(false)` runs even on failure, but user gets no feedback.
- **`src/components/billing/pricing-cards.tsx:5–25`** — `handleSubscribe` does not check `res.ok`; if the API returns an error, it does nothing. Also `setLoading(null)` runs after the redirect, which is unreachable.
- **`src/components/billing/pricing-cards.tsx:37–44`** — Feature list uses generic `text-green-600` checkmarks. Not brand-aligned.
- **`src/components/ai/ai-draft-button.tsx:66`** — Uses `border-purple-200 bg-purple-50 text-purple-700` — not brand-aligned. Use `brand-accent` or `brand-secondary`.
- **`src/components/ai/ai-draft-button.tsx:73`** — Uses `bg-white` instead of `bg-brand-white` and `bg-black/50` instead of the brand overlay.
- **`src/components/ai/ai-draft-button.tsx:18–22`** — Initial usage fetch silently swallows errors with `.catch(() => {})`.
- **`src/components/campaigns/campaign-email-actions.tsx:19, 33`** — Uses `any` for filter callbacks. Type them.
- **`src/components/campaigns/campaign-email-actions.tsx:44`** — `vdata.verified`/`vdata.total` may be undefined if the response is not OK; the component doesn't check `vres.ok`.
- **`src/components/campaigns/campaign-email-actions.tsx:31–32`** — Fetches `/api/prospects?campaignId=${campaignId}` to get prospects for verification; this route returns all prospects by default unless filtered. Verify the API filters correctly (it does, but it does not cap the list).
- **`src/components/prospects/prospects-view.tsx:128–138`** — Bulk "Find Emails" button does not check response status or handle errors; it just calls `setFindingAll(false)` and refetches.
- **`src/components/prospects/prospect-row.tsx:35–48, 50–63`** — `handleFindEmail` and `handleVerify` only call `onUpdated()` if `res.ok`; errors are silently swallowed. Add toast/error feedback.
- **`src/components/templates/template-editor.tsx`** — New `AiDraftButton` integration is good, but the generated draft is inserted into the template editor without escaping or sanitization. The AI is instructed to output plain text, but still render the generated HTML carefully.
- **`src/app/pricing/page.tsx:9–15`** — Uses `supabase` (anon) read with RLS. Good. But if `subscription_status` is undefined for a new user, the default is `"none"`, which is fine.
- **`src/app/pricing/page.tsx:21`** — Heading says "No credit card required" but the checkout always sets a 7-day trial. Stripe trials usually require a card depending on settings; ensure the copy matches the Stripe configuration.
- **`src/app/dashboard/settings/page.tsx:10`** — Uses `supabase` (anon) read; ensure RLS allows users to read their own `subscription_status`.
- **`src/app/dashboard/page.tsx:43`** — `campaignCount` is a `count` from Supabase; the condition `if (!campaignCount)` treats `0` as falsy and shows the onboarding CTA. This is correct.
- **`src/app/dashboard/page.tsx:76`** — Uses `bg-white` instead of `bg-brand-white` and `text-blue-600` link instead of `text-brand-accent`.

### Brand / Colors

- **`src/components/billing/pricing-cards.tsx:38–44, 65–69`** — Green checkmarks (`text-green-600`) should be brand-aligned.
- **`src/components/ai/ai-draft-button.tsx:66, 73, 114, 119`** — Purple and generic white/black overlay; replace with brand tokens.
- **`src/components/onboarding/onboarding-wizard.tsx`** — Mostly uses brand tokens; minor `bg-white` vs `bg-brand-white` occurrences.
- **`src/app/dashboard/page.tsx:76, 79`** — `bg-white` and `text-blue-600`.
- **`src/app/page.tsx:37`** — `text-brand-accent` is good.

### Database / Schema

- **`supabase-schema.sql:9–13`** — Subscription fields added to `users` table. Good single-table approach for MVP.
- **`supabase-schema.sql:11`** — `subscription_plan` defaults to `'monthly'`; consider `'none'` for users who have not subscribed.
- **`supabase-schema.sql:12`** — `trial_end` defaults to `NOW() + INTERVAL '7 days'`. Aligns with the 7-day trial in checkout.
- **`supabase/migrations/20260728153000_subscriptions.sql`** — Migration matches schema. Good.
- **Missing indexes** — No new indexes needed for the subscription fields because lookups are by `id`/`stripe_customer_id` (the latter already has implicit index via UNIQUE on `email`? No, `stripe_customer_id` is not indexed). Add an index on `users(stripe_customer_id)` if the webhook frequently updates by customer ID.

### Misc

- **`src/app/page.tsx:37`** — Added `/pricing` link. Good.
- **`src/app/dashboard/page.tsx:35, 49`** — Added onboarding CTA. Good UX.
- **`src/components/prospects/prospects-view.tsx`** — Added bulk find-emails button. Good, but no error handling.
- **`src/components/templates/template-editor.tsx:58–66`** — AI draft integration is a nice addition.
- **`src/app/dashboard/campaigns/[id]/page.tsx:40–43`** — Added email finder actions. Good.
- **Unused `Link` import** in `src/app/dashboard/page.tsx` is actually used now, so the Week 3 warning is resolved.

---

## Top blockers

1. **`integration_identifier` in Stripe checkout** will break payment flows.
2. **`check-url` route remains an open proxy**.
3. **In-memory AI usage counter** is not reliable across serverless instances.
4. **Onboarding wizard** does not link campaigns to selected sites and reads the wrong response key for prospects.
5. **`Date.now()` in render** in `billing-settings.tsx` violates React purity and will cause hydration/SSR issues.
