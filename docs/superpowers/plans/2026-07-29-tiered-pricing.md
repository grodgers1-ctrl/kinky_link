# Tiered Pricing (Solo / Pro / Team) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-plan subscription with three tiers — Solo ($12.99), Pro ($29), Team ($79) — with per-tier limits on sites, AI drafts, emails, and Hunter lookups. Enforce limits at API and MCP boundaries. Surface usage in the settings UI.

**Architecture:** Single source of truth for tier config in `src/lib/tiers.ts`. Usage tracked as append-only events in a new `usage_events` table with an index on `(user_id, event_type, created_at DESC)` — supports both monthly-window checks and hourly rate limits with one query shape. Enforcement helpers in `src/lib/usage.ts` are called from six existing API routes and two MCP tool handlers. Stripe gets six new price IDs (3 tiers × monthly/yearly), the checkout route accepts a `tier` param, and the webhook writes `subscription_tier` on the user row. Existing users grandfathered into Pro for one billing cycle.

**Tech Stack:** Same as MCP plan — Next.js 16 App Router, Supabase (Postgres via `supabaseAdmin`), NextAuth v5 (`auth()`), TypeScript, Tailwind v4 brand tokens. Migrations applied via the Supabase Management API pattern already used in commits `815aaef` and `9ddd654`.

**Conventions this repo enforces (recap):**
- API routes use `NextRequest`/`NextResponse` + `await auth()` first.
- Supabase writes via `supabaseAdmin`.
- No `any`; use `unknown` + narrowing (ESLint blocks `any`).
- Migrations: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`; mirror DDL into `supabase-schema.sql`.
- Brand tokens (`brand-secondary`, `brand-white`, etc.); grey hex literals like `#575858` are fine.
- Migrations applied via Management API (see MCP plan Task 1 for the exact `curl` recipe).

**Tier spec being implemented:**

| | Solo | Pro | Team |
|---|---|---|---|
| Monthly / Yearly | $12.99 / $129 | $29 / $290 | $79 / $790 |
| Sites | 3 | 10 | unlimited |
| Seats | 1 | 1 | 5 |
| AI drafts / month | 100 | 500 | 2,500 |
| AI drafts / hour (MCP guard) | 30 | 60 | 100 |
| Emails / month | 500 | 2,000 | 10,000 |
| Emails / hour | 100 | 200 | 500 |
| Hunter lookups / month | 25 | 150 | 500 |
| Prospect searches / month | 50 | unlimited | unlimited |
| MCP server | ✓ | ✓ | ✓ |
| Priority support | — | ✓ | ✓ + Slack |

---

## File Structure

```
linklight/
├── supabase/migrations/
│   └── 20260731120000_tiered-pricing.sql              [Task 1]
├── supabase-schema.sql                                [Task 1 — mirror]
├── src/lib/
│   ├── tiers.ts                                        [Task 2]
│   ├── usage.ts                                        [Task 3]
│   ├── stripe.ts                                       [Task 5 — modify]
│   └── ai-writer.ts                                    [Task 8 — trim]
├── src/app/api/
│   ├── billing/create-checkout/route.ts                [Task 6 — modify]
│   ├── webhooks/stripe/route.ts                        [Task 7 — modify]
│   ├── sites/route.ts                                  [Task 9 — modify]
│   ├── email/send/route.ts                             [Task 10 — modify]
│   ├── ai/draft/route.ts                               [Task 8 — modify]
│   ├── prospects/find-email/route.ts                   [Task 11 — modify]
│   └── usage/route.ts                                  [Task 13 — new]
├── src/lib/mcp/handlers.ts                             [Task 12 — modify]
├── src/components/
│   ├── billing/pricing-cards.tsx                       [Task 14 — rewrite]
│   └── settings/usage-widget.tsx                       [Task 13 — new]
├── src/app/dashboard/settings/page.tsx                 [Task 13 — wire widget]
└── scripts/
    └── verify-usage.mts                                [Task 4]
```

**File responsibilities:**
- `tiers.ts` — the tier config: id → limits + prices. Pure constants, no I/O. Only place limits are defined.
- `usage.ts` — event-based usage tracking. `recordEvent`, `countEvents`, `checkMonthlyLimit`, `checkHourlyLimit`, `getUsageSnapshot`. Wraps Supabase; used everywhere limits matter.
- `stripe.ts` — extended with six price IDs and `priceIdFor(tier, interval)`.
- `create-checkout/route.ts` — accepts `{ tier, interval }` body, calls `priceIdFor`.
- `webhooks/stripe/route.ts` — on subscription events, reads the `line_items` price ID back → sets `subscription_tier`.
- `sites`, `email/send`, `ai/draft`, `find-email` routes — call `checkMonthlyLimit` (and `checkHourlyLimit` where relevant) before doing work; call `recordEvent` on success.
- `mcp/handlers.ts` — enforce the same limits inside `draft_email` and `find_email` handlers (and reuse the send route pattern if MCP ever gains a send tool).
- `usage/route.ts` — GET endpoint returning `{ tier, limits, used }` for the settings widget.
- `usage-widget.tsx` — reads that endpoint, renders progress bars.
- `pricing-cards.tsx` — rewritten to show 3 tier cards with a monthly/yearly toggle.

---

## Task 1: Schema — `usage_events` + `subscription_tier`

**Files:**
- Create: `linklight/supabase/migrations/20260731120000_tiered-pricing.sql`
- Modify: `linklight/supabase-schema.sql`

- [ ] **Step 1: Write the migration SQL**

Create `linklight/supabase/migrations/20260731120000_tiered-pricing.sql`:

```sql
-- Add tier to users; default 'solo' for new users. Grandfather every existing
-- paying account into 'pro' for one cycle (see Task 7 for renewal handling).
ALTER TABLE users
  ADD COLUMN subscription_tier TEXT
    CHECK (subscription_tier IN ('solo', 'pro', 'team'));

UPDATE users
  SET subscription_tier = CASE
    WHEN subscription_status IN ('active', 'past_due') THEN 'pro'
    ELSE 'solo'
  END;

ALTER TABLE users
  ALTER COLUMN subscription_tier SET DEFAULT 'solo',
  ALTER COLUMN subscription_tier SET NOT NULL;

-- Append-only usage log. Serves both monthly-window checks and hourly rate limits.
CREATE TABLE usage_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('ai_draft', 'email_sent', 'hunter_lookup', 'prospect_search')),
  quantity   INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user_type_time
  ON usage_events(user_id, event_type, created_at DESC);
```

- [ ] **Step 2: Mirror into `supabase-schema.sql`**

Append the same SQL to `linklight/supabase-schema.sql` (below the existing `api_keys` block).

- [ ] **Step 3: Apply via Management API**

From `linklight/`:
```bash
export $(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_ACCESS_TOKEN)=' .env.local | xargs -d '\n')
REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')
python -c "import json,sys; sys.stdout.write(json.dumps({'query': open('supabase/migrations/20260731120000_tiered-pricing.sql').read()}))" > /tmp/mig.json
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/mig.json
```
Expected: `[]`.

- [ ] **Step 4: Verify**

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name=$q$users$q$ AND column_name=$q$subscription_tier$q$ UNION SELECT column_name FROM information_schema.columns WHERE table_name=$q$usage_events$q$;"}'
```
Expected: rows including `subscription_tier`, plus all 5 `usage_events` columns.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260731120000_tiered-pricing.sql supabase-schema.sql
git commit -m "pricing: schema for subscription_tier + usage_events"
```

---

## Task 2: Tier config

**Files:**
- Create: `linklight/src/lib/tiers.ts`

- [ ] **Step 1: Write `src/lib/tiers.ts`**

```ts
export type Tier = "solo" | "pro" | "team"
export type Interval = "monthly" | "yearly"

export interface TierLimits {
  sites: number | null           // null = unlimited
  seats: number
  aiDraftsMonthly: number
  aiDraftsHourly: number
  emailsMonthly: number
  emailsHourly: number
  hunterLookupsMonthly: number
  prospectSearchesMonthly: number | null
}

export interface TierConfig {
  id: Tier
  label: string
  priceMonthly: number
  priceYearly: number
  limits: TierLimits
}

export const TIERS: Record<Tier, TierConfig> = {
  solo: {
    id: "solo",
    label: "Solo",
    priceMonthly: 12.99,
    priceYearly: 129,
    limits: {
      sites: 3,
      seats: 1,
      aiDraftsMonthly: 100,
      aiDraftsHourly: 30,
      emailsMonthly: 500,
      emailsHourly: 100,
      hunterLookupsMonthly: 25,
      prospectSearchesMonthly: 50,
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceMonthly: 29,
    priceYearly: 290,
    limits: {
      sites: 10,
      seats: 1,
      aiDraftsMonthly: 500,
      aiDraftsHourly: 60,
      emailsMonthly: 2000,
      emailsHourly: 200,
      hunterLookupsMonthly: 150,
      prospectSearchesMonthly: null,
    },
  },
  team: {
    id: "team",
    label: "Team",
    priceMonthly: 79,
    priceYearly: 790,
    limits: {
      sites: null,
      seats: 5,
      aiDraftsMonthly: 2500,
      aiDraftsHourly: 100,
      emailsMonthly: 10000,
      emailsHourly: 500,
      hunterLookupsMonthly: 500,
      prospectSearchesMonthly: null,
    },
  },
}

export function limitsFor(tier: Tier): TierLimits {
  return TIERS[tier].limits
}

export function isTier(x: unknown): x is Tier {
  return x === "solo" || x === "pro" || x === "team"
}
```

- [ ] **Step 2: Typecheck**

```bash
cd linklight && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tiers.ts
git commit -m "pricing: tier config (solo/pro/team, prices + limits)"
```

---

## Task 3: Usage tracking library

**Files:**
- Create: `linklight/src/lib/usage.ts`

- [ ] **Step 1: Write `src/lib/usage.ts`**

```ts
import { supabaseAdmin } from "@/lib/db"
import { limitsFor, type Tier, type TierLimits } from "@/lib/tiers"

export type EventType = "ai_draft" | "email_sent" | "hunter_lookup" | "prospect_search"

export async function recordEvent(
  userId: string,
  eventType: EventType,
  quantity = 1,
): Promise<void> {
  await supabaseAdmin.from("usage_events").insert({
    user_id: userId,
    event_type: eventType,
    quantity,
  })
}

async function countSince(
  userId: string,
  eventType: EventType,
  since: Date,
): Promise<number> {
  const { data } = await supabaseAdmin
    .from("usage_events")
    .select("quantity")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .gte("created_at", since.toISOString())
  if (!data) return 0
  return data.reduce((sum, row) => sum + (row.quantity || 0), 0)
}

function startOfMonthUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function oneHourAgo(): Date {
  return new Date(Date.now() - 60 * 60 * 1000)
}

export async function usageThisMonth(
  userId: string,
  eventType: EventType,
): Promise<number> {
  return countSince(userId, eventType, startOfMonthUtc())
}

export async function usageLastHour(
  userId: string,
  eventType: EventType,
): Promise<number> {
  return countSince(userId, eventType, oneHourAgo())
}

export interface LimitResult {
  ok: boolean
  used: number
  limit: number | null   // null = unlimited
  remaining: number | null
  reason?: string
}

export async function checkMonthlyLimit(
  userId: string,
  eventType: EventType,
  limit: number | null,
): Promise<LimitResult> {
  if (limit === null) return { ok: true, used: 0, limit: null, remaining: null }
  const used = await usageThisMonth(userId, eventType)
  const remaining = Math.max(0, limit - used)
  if (used >= limit) {
    return { ok: false, used, limit, remaining: 0, reason: `Monthly limit reached (${used}/${limit})` }
  }
  return { ok: true, used, limit, remaining }
}

export async function checkHourlyLimit(
  userId: string,
  eventType: EventType,
  limit: number,
): Promise<LimitResult> {
  const used = await usageLastHour(userId, eventType)
  const remaining = Math.max(0, limit - used)
  if (used >= limit) {
    return { ok: false, used, limit, remaining: 0, reason: `Hourly rate limit reached (${used}/${limit}). Try again in a bit.` }
  }
  return { ok: true, used, limit, remaining }
}

// Site count is stored as rows in the `sites` table, not events.
export async function countSites(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("sites")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
  return count || 0
}

export async function checkSiteLimit(
  userId: string,
  limit: number | null,
): Promise<LimitResult> {
  if (limit === null) return { ok: true, used: 0, limit: null, remaining: null }
  const used = await countSites(userId)
  const remaining = Math.max(0, limit - used)
  if (used >= limit) {
    return { ok: false, used, limit, remaining: 0, reason: `Site limit reached (${used}/${limit})` }
  }
  return { ok: true, used, limit, remaining }
}

export interface UsageSnapshot {
  tier: Tier
  limits: TierLimits
  used: {
    sites: number
    ai_draft: number
    email_sent: number
    hunter_lookup: number
    prospect_search: number
  }
}

export async function getUsageSnapshot(userId: string, tier: Tier): Promise<UsageSnapshot> {
  const limits = limitsFor(tier)
  const [sites, ai, sent, hunter, search] = await Promise.all([
    countSites(userId),
    usageThisMonth(userId, "ai_draft"),
    usageThisMonth(userId, "email_sent"),
    usageThisMonth(userId, "hunter_lookup"),
    usageThisMonth(userId, "prospect_search"),
  ])
  return {
    tier,
    limits,
    used: {
      sites,
      ai_draft: ai,
      email_sent: sent,
      hunter_lookup: hunter,
      prospect_search: search,
    },
  }
}

export async function getUserTier(userId: string): Promise<Tier> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("subscription_tier")
    .eq("id", userId)
    .maybeSingle()
  const raw = data?.subscription_tier
  return raw === "pro" || raw === "team" ? raw : "solo"
}
```

- [ ] **Step 2: Typecheck**

```bash
cd linklight && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/usage.ts
git commit -m "pricing: usage tracking + limit check helpers"
```

---

## Task 4: Verification script for usage helpers

**Files:**
- Create: `linklight/scripts/verify-usage.mts`

- [ ] **Step 1: Write the script**

```ts
// scripts/verify-usage.mts
// Roundtrips usage_events writes + reads and checkMonthlyLimit / checkHourlyLimit.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-usage.mts
import {
  recordEvent,
  usageThisMonth,
  usageLastHour,
  checkMonthlyLimit,
  checkHourlyLimit,
  getUsageSnapshot,
  getUserTier,
} from "@/lib/usage"
import { supabaseAdmin } from "@/lib/db"

const { data: users } = await supabaseAdmin.from("users").select("id").limit(1)
if (!users?.length) {
  console.log("SKIP: no users in DB")
  process.exit(0)
}
const userId = users[0].id as string

// Clean slate for this test run
await supabaseAdmin
  .from("usage_events")
  .delete()
  .eq("user_id", userId)
  .eq("event_type", "ai_draft")

const before = await usageThisMonth(userId, "ai_draft")
if (before !== 0) throw new Error(`expected 0 initial ai_draft events, got ${before}`)

await recordEvent(userId, "ai_draft", 3)
await recordEvent(userId, "ai_draft", 1)

const monthCount = await usageThisMonth(userId, "ai_draft")
if (monthCount !== 4) throw new Error(`expected 4 monthly events, got ${monthCount}`)
console.log("usageThisMonth: OK")

const hourCount = await usageLastHour(userId, "ai_draft")
if (hourCount !== 4) throw new Error(`expected 4 hourly events, got ${hourCount}`)
console.log("usageLastHour: OK")

const under = await checkMonthlyLimit(userId, "ai_draft", 100)
if (!under.ok || under.remaining !== 96) throw new Error(`under-limit check failed: ${JSON.stringify(under)}`)
console.log("checkMonthlyLimit (under): OK", under)

const over = await checkMonthlyLimit(userId, "ai_draft", 3)
if (over.ok) throw new Error("over-limit check should have failed")
console.log("checkMonthlyLimit (over): OK", over)

const hourly = await checkHourlyLimit(userId, "ai_draft", 3)
if (hourly.ok) throw new Error("hourly check should have failed")
console.log("checkHourlyLimit (over): OK", hourly)

const tier = await getUserTier(userId)
const snap = await getUsageSnapshot(userId, tier)
console.log("snapshot:", { tier: snap.tier, used: snap.used })

// Cleanup
await supabaseAdmin
  .from("usage_events")
  .delete()
  .eq("user_id", userId)
  .eq("event_type", "ai_draft")

console.log("\nUSAGE PASS")
```

- [ ] **Step 2: Run it**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-usage.mts
```
Expected final line: `USAGE PASS`.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-usage.mts
git commit -m "pricing: usage helpers verification script"
```

---

## Task 5: Extend `stripe.ts` for six price IDs

**Files:**
- Modify: `linklight/src/lib/stripe.ts`
- Modify (env): `linklight/.env.local` — user adds the new IDs manually

- [ ] **Step 1: Update `src/lib/stripe.ts`**

Replace the two existing constants with a full set. Open `linklight/src/lib/stripe.ts` and replace:

```ts
export const MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_PRICE_ID || "price_monthly"
export const YEARLY_PRICE_ID = process.env.STRIPE_YEARLY_PRICE_ID || "price_yearly"
```

With:

```ts
import type { Tier, Interval } from "@/lib/tiers"

export const PRICE_IDS: Record<Tier, Record<Interval, string>> = {
  solo: {
    monthly: process.env.STRIPE_SOLO_MONTHLY_PRICE_ID || "price_solo_monthly",
    yearly: process.env.STRIPE_SOLO_YEARLY_PRICE_ID || "price_solo_yearly",
  },
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "price_pro_monthly",
    yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || "price_pro_yearly",
  },
  team: {
    monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || "price_team_monthly",
    yearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID || "price_team_yearly",
  },
}

// Reverse lookup: given a Stripe price ID (from webhook), which tier is it?
export function tierFromPriceId(priceId: string): Tier | null {
  for (const tier of ["solo", "pro", "team"] as const) {
    if (PRICE_IDS[tier].monthly === priceId || PRICE_IDS[tier].yearly === priceId) {
      return tier
    }
  }
  return null
}

export function intervalFromPriceId(priceId: string): Interval | null {
  for (const tier of ["solo", "pro", "team"] as const) {
    if (PRICE_IDS[tier].monthly === priceId) return "monthly"
    if (PRICE_IDS[tier].yearly === priceId) return "yearly"
  }
  return null
}

export function priceIdFor(tier: Tier, interval: Interval): string {
  return PRICE_IDS[tier][interval]
}
```

- [ ] **Step 2: Add env vars template**

Add the six new env vars to whatever env docs exist (README or an `.env.example` if present). At minimum, tell the operator (in commit message and code comment) that they need to add:
```
STRIPE_SOLO_MONTHLY_PRICE_ID=price_...
STRIPE_SOLO_YEARLY_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
STRIPE_TEAM_MONTHLY_PRICE_ID=price_...
STRIPE_TEAM_YEARLY_PRICE_ID=price_...
```
The old `STRIPE_MONTHLY_PRICE_ID` / `STRIPE_YEARLY_PRICE_ID` env vars become unused — leave them in `.env.local` for now, remove in a follow-up.

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: `✓ Compiled successfully`. Any type errors from callers of the old constants will surface here — fix each by importing `priceIdFor` from `@/lib/stripe`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stripe.ts
git commit -m "pricing: expand stripe.ts to six price IDs (3 tiers × monthly/yearly)"
```

---

## Task 6: Update checkout route to accept tier + interval

**Files:**
- Modify: `linklight/src/app/api/billing/create-checkout/route.ts`

- [ ] **Step 1: Read the current file to understand its shape**

```bash
cat linklight/src/app/api/billing/create-checkout/route.ts
```

- [ ] **Step 2: Replace the body-parsing + priceId selection**

Find the block that reads `plan` and computes `priceId`. Replace with:

```ts
import { priceIdFor } from "@/lib/stripe"
import { isTier, type Interval } from "@/lib/tiers"

// ...inside POST handler, after reading req.json():
const body = (await req.json().catch(() => ({}))) as { tier?: string; interval?: string }
const tier = isTier(body.tier) ? body.tier : "solo"
const interval: Interval = body.interval === "yearly" ? "yearly" : "monthly"
const priceId = priceIdFor(tier, interval)
```

Rest of the checkout call (line_items, success_url, etc.) stays the same.

Also attach the tier to the subscription metadata so the webhook has it as a backup:
```ts
// in the sessions.create({...}) call, add:
subscription_data: {
  metadata: { tier, interval },
},
metadata: { tier, interval },
```

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/billing/create-checkout/route.ts
git commit -m "pricing: create-checkout accepts tier + interval params"
```

---

## Task 7: Update Stripe webhook to write `subscription_tier`

**Files:**
- Modify: `linklight/src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Read the file**

```bash
cat linklight/src/app/api/webhooks/stripe/route.ts
```
Identify where `subscription_status` / `subscription_plan` are currently updated on the user row. That's where `subscription_tier` also needs to be set.

- [ ] **Step 2: Extract the tier at each event site**

Add a helper at the top of the file:

```ts
import { tierFromPriceId, intervalFromPriceId } from "@/lib/stripe"
import type { Tier } from "@/lib/tiers"
import type Stripe from "stripe"

function extractTier(sub: Stripe.Subscription): { tier: Tier | null; interval: "monthly" | "yearly" | null } {
  // Prefer metadata (set by our checkout route), fall back to price lookup.
  const metaTier = sub.metadata?.tier
  const metaInterval = sub.metadata?.interval
  if (metaTier === "solo" || metaTier === "pro" || metaTier === "team") {
    return {
      tier: metaTier,
      interval: metaInterval === "yearly" ? "yearly" : metaInterval === "monthly" ? "monthly" : null,
    }
  }
  const priceId = sub.items?.data?.[0]?.price?.id
  if (!priceId) return { tier: null, interval: null }
  return { tier: tierFromPriceId(priceId), interval: intervalFromPriceId(priceId) }
}
```

- [ ] **Step 3: Wire `subscription_tier` into every user update**

For each event branch that updates the user (`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed` if it also updates), call `extractTier(subscription)` and include `subscription_tier: tier` in the update payload — but only when tier is non-null. On `deleted`, set `subscription_tier` back to `'solo'` (they're on the free/canceled path).

Example pattern for an updated event:
```ts
const { tier } = extractTier(subscription)
const updates: Record<string, unknown> = {
  subscription_status: subscription.status,
  subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
}
if (tier) updates.subscription_tier = tier
await supabaseAdmin.from("users").update(updates).eq("stripe_customer_id", customerId)
```

- [ ] **Step 4: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "pricing: webhook writes subscription_tier on sub events"
```

---

## Task 8: Wire AI draft limits (route + MCP)

**Files:**
- Modify: `linklight/src/lib/ai-writer.ts` (trim in-memory usage)
- Modify: `linklight/src/app/api/ai/draft/route.ts` (use DB-backed check)

- [ ] **Step 1: Deprecate in-memory usage in `ai-writer.ts`**

Open `src/lib/ai-writer.ts`. Delete `checkAiUsage` and `getAiUsageRemaining` (and any module-level Map holding counts). Leave `generateEmailDraft` intact. Also delete the internal `aiUsageMap` or equivalent if present.

- [ ] **Step 2: Replace `src/app/api/ai/draft/route.ts` in full**

Overwrite the file with:

```ts
import { auth } from "@/lib/auth"
import { generateEmailDraft } from "@/lib/ai-writer"
import { scoreEmail } from "@/lib/spam-score"
import { checkMonthlyLimit, recordEvent, getUserTier } from "@/lib/usage"
import { limitsFor } from "@/lib/tiers"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tier = await getUserTier(session.user.id)
  const limits = limitsFor(tier)
  const check = await checkMonthlyLimit(session.user.id, "ai_draft", limits.aiDraftsMonthly)
  if (!check.ok) {
    return NextResponse.json(
      { error: check.reason, remaining: 0, tier, limit: check.limit, used: check.used },
      { status: 429 },
    )
  }

  try {
    const body = await req.json()
    const { topic, articleTitle, siteName, prospectName, tone, campaignType } = body

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 })
    }

    const draft = await generateEmailDraft({
      topic,
      articleTitle: articleTitle || undefined,
      siteName: siteName || undefined,
      prospectName: prospectName || undefined,
      tone: tone || "friendly",
      campaignType: campaignType || "outreach",
    })

    await recordEvent(session.user.id, "ai_draft", 1)

    const spamScore = scoreEmail({
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      bodyText: draft.bodyText,
    })

    return NextResponse.json({
      draft,
      spamScore,
      remaining: check.remaining !== null ? check.remaining - 1 : null,
      tier,
    })
  } catch (error) {
    console.error("AI draft error:", error)
    const message = error instanceof Error ? error.message : "Failed to generate draft"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tier = await getUserTier(session.user.id)
  const limits = limitsFor(tier)
  const check = await checkMonthlyLimit(session.user.id, "ai_draft", limits.aiDraftsMonthly)
  return NextResponse.json({
    tier,
    limit: check.limit,
    used: check.used,
    remaining: check.remaining,
  })
}
```

- [ ] **Step 3: Update any callers of the old helpers**

The MCP `draft_email` handler currently imports `checkAiUsage` and `getAiUsageRemaining` from ai-writer. Replace those imports and calls — see Task 12.

Also grep for any other callers:
```bash
grep -rn "checkAiUsage\|getAiUsageRemaining" linklight/src
```
Any remaining reference must be replaced with the `usage.ts` helpers.

- [ ] **Step 4: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -10
```
Expected: clean (assuming Task 12 also lands to fix the MCP caller).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-writer.ts src/app/api/ai/draft/route.ts
git commit -m "pricing: DB-backed monthly AI draft limits + record usage events"
```

---

## Task 9: Wire site limit into `POST /api/sites`

**Files:**
- Modify: `linklight/src/app/api/sites/route.ts`

- [ ] **Step 1: Read the file to find the POST handler**

```bash
cat linklight/src/app/api/sites/route.ts
```

- [ ] **Step 2: Add the check at the top of the POST handler**

Just after the `auth()` check and before the insert into `sites`, add:

```ts
import { checkSiteLimit, getUserTier } from "@/lib/usage"
import { limitsFor } from "@/lib/tiers"

// ...inside POST, after auth:
const tier = await getUserTier(session.user.id)
const check = await checkSiteLimit(session.user.id, limitsFor(tier).sites)
if (!check.ok) {
  return NextResponse.json(
    { error: check.reason, tier, limit: check.limit, used: check.used },
    { status: 403 },
  )
}
```

No `recordEvent` needed — site count is derived from rows in `sites`.

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sites/route.ts
git commit -m "pricing: enforce site limit per tier on POST /api/sites"
```

---

## Task 10: Wire email send limits (monthly + hourly)

**Files:**
- Modify: `linklight/src/app/api/email/send/route.ts`

- [ ] **Step 1: Add the double-check + record**

Read the file first (`cat linklight/src/app/api/email/send/route.ts`) to find the POST handler. Immediately after `auth()`, add:

```ts
import { checkMonthlyLimit, checkHourlyLimit, recordEvent, getUserTier } from "@/lib/usage"
import { limitsFor } from "@/lib/tiers"

// ...inside POST, after auth:
const tier = await getUserTier(session.user.id)
const limits = limitsFor(tier)

const monthly = await checkMonthlyLimit(session.user.id, "email_sent", limits.emailsMonthly)
if (!monthly.ok) {
  return NextResponse.json({ error: monthly.reason, tier, ...monthly }, { status: 429 })
}
const hourly = await checkHourlyLimit(session.user.id, "email_sent", limits.emailsHourly)
if (!hourly.ok) {
  return NextResponse.json({ error: hourly.reason, tier, ...hourly }, { status: 429 })
}
```

At the point the send actually succeeds (after the Gmail API call returns without error), record the event:

```ts
await recordEvent(session.user.id, "email_sent", 1)
```

Important: `recordEvent` goes AFTER the send succeeds, not before. If Gmail fails, we don't count it against quota.

- [ ] **Step 2: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/email/send/route.ts
git commit -m "pricing: enforce monthly + hourly email send limits"
```

---

## Task 11: Wire Hunter lookup limit

**Files:**
- Modify: `linklight/src/app/api/prospects/find-email/route.ts`

- [ ] **Step 1: Read the file**

```bash
cat linklight/src/app/api/prospects/find-email/route.ts
```

- [ ] **Step 2: Wrap the Hunter call**

After `auth()`, add:

```ts
import { checkMonthlyLimit, recordEvent, getUserTier } from "@/lib/usage"
import { limitsFor } from "@/lib/tiers"

const tier = await getUserTier(session.user.id)
const check = await checkMonthlyLimit(session.user.id, "hunter_lookup", limitsFor(tier).hunterLookupsMonthly)
if (!check.ok) {
  return NextResponse.json({ error: check.reason, tier, ...check }, { status: 429 })
}
```

After a successful Hunter lookup (only when `email` is non-null OR the API was called — decide policy: count on-attempt is safer for cost control, so count regardless of hit):

```ts
await recordEvent(session.user.id, "hunter_lookup", 1)
```

**Design note:** count every Hunter API call, hit or miss. Users pay a lookup fee either way from Hunter's side.

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/prospects/find-email/route.ts
git commit -m "pricing: enforce monthly Hunter lookup limit"
```

---

## Task 12: MCP handlers — enforce limits + hourly rate

**Files:**
- Modify: `linklight/src/lib/mcp/handlers.ts`

- [ ] **Step 1: Add limit guards to `draft_email` and `find_email`**

Open `src/lib/mcp/handlers.ts`. Replace the current imports and the two handlers. First replace the top-of-file imports block:

```ts
import { supabaseAdmin } from "@/lib/db"
import { getSerpForKeyword, getDomainFacts } from "@/lib/corpus"
import { hunterFindEmail } from "@/lib/hunter"
import { generateEmailDraft } from "@/lib/ai-writer"
import { scoreEmail } from "@/lib/spam-score"
import { checkMonthlyLimit, checkHourlyLimit, recordEvent, getUserTier } from "@/lib/usage"
import { limitsFor } from "@/lib/tiers"
import { registerTool, jsonResult, errorResult } from "./tools"
```

Then rewrite the `draft_email` handler body (keep the schema unchanged):

```ts
handler: async (userId, args) => {
  const tier = await getUserTier(userId)
  const limits = limitsFor(tier)

  const monthly = await checkMonthlyLimit(userId, "ai_draft", limits.aiDraftsMonthly)
  if (!monthly.ok) return errorResult(`${monthly.reason} (tier: ${tier})`)

  const hourly = await checkHourlyLimit(userId, "ai_draft", limits.aiDraftsHourly)
  if (!hourly.ok) return errorResult(`${hourly.reason} (tier: ${tier})`)

  const draft = await generateEmailDraft({
    topic: String(args.topic),
    articleTitle: args.article_title ? String(args.article_title) : undefined,
    siteName: args.site_name ? String(args.site_name) : undefined,
    prospectName: args.prospect_name ? String(args.prospect_name) : undefined,
    tone: (args.tone as "friendly" | "professional" | "direct" | undefined) || "friendly",
    campaignType:
      (args.campaign_type as
        | "outreach"
        | "guest_post"
        | "resource_page"
        | "skyscraper"
        | "link_reclamation"
        | undefined) || "outreach",
  })
  await recordEvent(userId, "ai_draft", 1)

  const spamScore = scoreEmail({
    subject: draft.subject,
    bodyHtml: draft.bodyHtml,
    bodyText: draft.bodyText,
  })
  return jsonResult({
    draft,
    spamScore,
    tier,
    remaining: monthly.remaining !== null ? monthly.remaining - 1 : null,
  })
},
```

And rewrite the `find_email` handler body:

```ts
handler: async (userId, args) => {
  const domain = String(args.domain || "").trim().toLowerCase()
  if (!domain) return errorResult("domain is required")

  // Cache hit — free, doesn't count against limit
  const { data: cached } = await supabaseAdmin
    .from("domain_facts")
    .select("contact_email, email_fetched_at")
    .eq("domain", domain)
    .maybeSingle()
  if (cached?.contact_email) {
    return jsonResult({ domain, email: cached.contact_email, source: "cache" })
  }

  // Live lookup — enforce quota
  const tier = await getUserTier(userId)
  const check = await checkMonthlyLimit(userId, "hunter_lookup", limitsFor(tier).hunterLookupsMonthly)
  if (!check.ok) return errorResult(`${check.reason} (tier: ${tier})`)

  const res = await hunterFindEmail(domain)
  await recordEvent(userId, "hunter_lookup", 1)

  if (res.email) {
    const now = new Date().toISOString()
    await supabaseAdmin.from("domain_facts").upsert(
      { domain, contact_email: res.email, email_fetched_at: now, last_seen_at: now },
      { onConflict: "domain" },
    )
  }
  return jsonResult({
    domain,
    email: res.email,
    confidence: res.confidence,
    source: res.source || "live",
    tier,
    remaining: check.remaining !== null ? check.remaining - 1 : null,
  })
},
```

Also add a soft quota to `search_prospects` for the Solo tier. In its handler, near the top:

```ts
const tier = await getUserTier(_userId as string)  // rename _userId → userId in the handler signature
const searchLimit = limitsFor(tier).prospectSearchesMonthly
if (searchLimit !== null) {
  const check = await checkMonthlyLimit(_userId as string, "prospect_search", searchLimit)
  if (!check.ok) return errorResult(`${check.reason} (tier: ${tier})`)
}
// ... existing logic ...
await recordEvent(_userId as string, "prospect_search", 1)
```

(Change the handler signature from `async (_userId, args)` to `async (userId, args)` so `userId` isn't underscore-prefixed anymore.)

- [ ] **Step 2: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 3: End-to-end smoke via MCP**

Boot dev server, create a fresh test key, then call `draft_email` twice in a row from a Solo user and confirm both succeed:

```bash
cd linklight && npm run dev  # background
KEY=$(npx tsx --env-file=.env.local scripts/create-test-key.mts)
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"draft_email","arguments":{"topic":"link building"}}}' | python -c "import json,sys; d=json.load(sys.stdin); print(d['result']['content'][0]['text'][:400])"
```
Expected: JSON with `draft`, `spamScore`, `tier: "solo"`, `remaining: 99`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcp/handlers.ts
git commit -m "pricing: MCP handlers enforce tier limits (draft_email, find_email, search_prospects)"
```

---

## Task 13: Usage endpoint + settings widget

**Files:**
- Create: `linklight/src/app/api/usage/route.ts`
- Create: `linklight/src/components/settings/usage-widget.tsx`
- Modify: `linklight/src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Write `src/app/api/usage/route.ts`**

```ts
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { getUsageSnapshot, getUserTier } from "@/lib/usage"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tier = await getUserTier(session.user.id)
  const snapshot = await getUsageSnapshot(session.user.id, tier)
  return NextResponse.json(snapshot)
}
```

- [ ] **Step 2: Write `src/components/settings/usage-widget.tsx`**

```tsx
"use client"
import { useEffect, useState } from "react"
import type { UsageSnapshot } from "@/lib/usage"

interface BarProps {
  label: string
  used: number
  limit: number | null
}

function UsageBar({ label, used, limit }: BarProps) {
  const unlimited = limit === null
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const warn = pct >= 80
  const over = pct >= 100
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-brand-secondary">{label}</span>
        <span className="text-[#575858]">
          {used.toLocaleString()} {unlimited ? "used" : `/ ${limit.toLocaleString()}`}
        </span>
      </div>
      {!unlimited && (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-surface">
          <div
            className={`h-full transition-all ${over ? "bg-brand-accent" : warn ? "bg-[#F59E0B]" : "bg-brand-secondary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function UsageWidget() {
  const [snap, setSnap] = useState<UsageSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setSnap(d)
      })
      .catch(() => setError("Failed to load usage"))
  }, [])

  if (error) return <p className="text-sm text-brand-accent">{error}</p>
  if (!snap) return <p className="text-sm text-[#575858]">Loading usage…</p>

  const { tier, limits, used } = snap

  return (
    <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h3 font-semibold text-brand-secondary">Usage this month</h2>
        <span className="rounded-full bg-brand-primary px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-secondary">
          {tier} plan
        </span>
      </div>
      <div className="mt-4 space-y-4">
        <UsageBar label="Sites"           used={used.sites}           limit={limits.sites} />
        <UsageBar label="AI drafts"       used={used.ai_draft}        limit={limits.aiDraftsMonthly} />
        <UsageBar label="Emails sent"     used={used.email_sent}      limit={limits.emailsMonthly} />
        <UsageBar label="Hunter lookups"  used={used.hunter_lookup}   limit={limits.hunterLookupsMonthly} />
        <UsageBar label="Prospect searches" used={used.prospect_search} limit={limits.prospectSearchesMonthly} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire the widget into settings**

Open `src/app/dashboard/settings/page.tsx`. Add the import and render the widget between `BillingSettings` and the API-access card:

```tsx
import { UsageWidget } from "@/components/settings/usage-widget"

// ...inside the return, after <BillingSettings />:
<UsageWidget />
```

- [ ] **Step 4: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error|/api/usage" | head -5
```
Expected: clean, `/api/usage` in the route list.

- [ ] **Step 5: Boot + eyeball**

```bash
cd linklight && npm run dev
```
Visit `/dashboard/settings`. Confirm the usage widget renders with the tier badge and five bars.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/usage/route.ts src/components/settings/usage-widget.tsx src/app/dashboard/settings/page.tsx
git commit -m "pricing: /api/usage endpoint + settings usage widget"
```

---

## Task 14: Rewrite pricing cards for 3 tiers

**Files:**
- Modify: `linklight/src/components/billing/pricing-cards.tsx`

- [ ] **Step 1: Read the current file to understand the props contract**

```bash
cat linklight/src/components/billing/pricing-cards.tsx
```

Note the current `subscriptionStatus` prop and any parent that renders this component (`grep -rn "PricingCards" linklight/src`).

- [ ] **Step 2: Replace the component body**

```tsx
"use client"
import { useState } from "react"
import { TIERS, type Tier, type Interval } from "@/lib/tiers"

const TIER_ORDER: Tier[] = ["solo", "pro", "team"]

const TIER_HIGHLIGHTS: Record<Tier, { tagline: string; features: string[] }> = {
  solo: {
    tagline: "For side-hustle SEOs running one or two sites.",
    features: [
      "3 sites",
      "100 AI drafts / month",
      "500 emails / month",
      "25 Hunter lookups / month",
      "MCP server included",
      "Backlink monitoring + spam score",
    ],
  },
  pro: {
    tagline: "For serious operators who need room to run.",
    features: [
      "10 sites",
      "500 AI drafts / month",
      "2,000 emails / month",
      "150 Hunter lookups / month",
      "Unlimited prospect search",
      "Priority email support",
    ],
  },
  team: {
    tagline: "For agencies and small teams.",
    features: [
      "Unlimited sites",
      "5 seats",
      "2,500 AI drafts / month",
      "10,000 emails / month",
      "500 Hunter lookups / month",
      "Priority + shared Slack",
    ],
  },
}

export function PricingCards({ subscriptionStatus }: { subscriptionStatus: string }) {
  const [interval, setInterval] = useState<Interval>("monthly")
  const [busy, setBusy] = useState<Tier | null>(null)

  async function subscribe(tier: Tier) {
    setBusy(tier)
    try {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setBusy(null)
    }
  }

  const subscribed = subscriptionStatus === "active" || subscriptionStatus === "trialing"

  return (
    <div>
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-[#DCDDDE] bg-brand-white p-1">
          {(["monthly", "yearly"] as Interval[]).map((i) => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                interval === i
                  ? "bg-brand-secondary text-brand-white"
                  : "text-[#575858] hover:text-brand-secondary"
              }`}
            >
              {i === "monthly" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {TIER_ORDER.map((tierId) => {
          const cfg = TIERS[tierId]
          const price = interval === "monthly" ? cfg.priceMonthly : cfg.priceYearly
          const highlight = tierId === "pro"
          const details = TIER_HIGHLIGHTS[tierId]

          return (
            <div
              key={tierId}
              className={`rounded-2xl border p-6 ${
                highlight
                  ? "border-brand-accent bg-brand-white shadow-md"
                  : "border-[#DCDDDE] bg-brand-white"
              }`}
            >
              {highlight && (
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-brand-accent">
                  Most popular
                </p>
              )}
              <h3 className="text-h3 font-bold text-brand-secondary">{cfg.label}</h3>
              <p className="mt-1 text-sm text-[#575858]">{details.tagline}</p>
              <p className="mt-4">
                <span className="text-3xl font-bold text-brand-secondary">${price}</span>
                <span className="ml-1 text-sm text-[#575858]">
                  /{interval === "monthly" ? "mo" : "yr"}
                </span>
              </p>
              <button
                onClick={() => subscribe(tierId)}
                disabled={!!busy || subscribed}
                className={`mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  highlight
                    ? "bg-brand-accent text-white hover:opacity-90"
                    : "bg-brand-secondary text-brand-white hover:bg-[#1f0066]"
                } disabled:opacity-50`}
              >
                {subscribed
                  ? "Already subscribed"
                  : busy === tierId
                    ? "Redirecting…"
                    : `Get ${cfg.label}`}
              </button>
              <ul className="mt-6 space-y-2 text-sm text-[#575858]">
                {details.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-accent"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓|error|Error" | head -5
```
Expected: clean.

- [ ] **Step 4: Eyeball**

```bash
cd linklight && npm run dev
```
Visit `/pricing`. Confirm three cards, monthly/yearly toggle, prices update, "Most popular" ribbon on Pro.

- [ ] **Step 5: Commit**

```bash
git add src/components/billing/pricing-cards.tsx
git commit -m "pricing: 3-tier pricing cards with monthly/yearly toggle"
```

---

## Task 15: Final verify + push

**Files:** none.

- [ ] **Step 1: Clean build**

```bash
cd linklight && npm run build 2>&1 | tail -15
```
Expected: `✓ Compiled successfully`. New routes visible: `/api/usage`. `/pricing` re-rendered.

- [ ] **Step 2: Lint changed files**

```bash
cd linklight && npx eslint \
  src/lib/tiers.ts \
  src/lib/usage.ts \
  src/lib/stripe.ts \
  src/lib/ai-writer.ts \
  src/lib/mcp/handlers.ts \
  src/app/api/billing/create-checkout \
  src/app/api/webhooks/stripe \
  src/app/api/sites \
  src/app/api/email/send \
  src/app/api/ai/draft \
  src/app/api/prospects/find-email \
  src/app/api/usage \
  src/components/billing/pricing-cards.tsx \
  src/components/settings/usage-widget.tsx \
  src/app/dashboard/settings/page.tsx
```
Expected: 0 errors.

- [ ] **Step 3: Verify usage helpers still pass**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-usage.mts
```
Expected: `USAGE PASS`.

- [ ] **Step 4: End-to-end limit smoke**

Boot dev, create an API key, generate 3 drafts via MCP, then check usage:
```bash
cd linklight && npm run dev  # background
KEY=$(npx tsx --env-file=.env.local scripts/create-test-key.mts)
for i in 1 2 3; do
  curl -sS -X POST http://localhost:3000/api/mcp -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"draft_email","arguments":{"topic":"outreach"}}}' \
    | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print(f\"remaining: {r.get('remaining')}\")"
done
```
Expected: `remaining: 99`, `98`, `97` (or offset from whatever the user's existing usage is).

- [ ] **Step 5: Manual UI check**

Visit `/dashboard/settings` — confirm usage widget shows five bars with your tier badge.
Visit `/pricing` — confirm three cards + toggle.

- [ ] **Step 6: Push**

```bash
cd linklight && git push origin master
```

- [ ] **Step 7: (Post-deploy) production migration**

Apply the same migration to production Supabase (repeat Task 1 Step 3 against the prod project). Then in Stripe:
1. Create 3 Products (Solo, Pro, Team).
2. Under each, create 2 Prices — monthly and yearly amounts per the tier spec.
3. Copy the six `price_...` IDs into production env vars (`STRIPE_{SOLO,PRO,TEAM}_{MONTHLY,YEARLY}_PRICE_ID`).
4. Announce grandfathering: any existing paying user is on Pro for their current billing cycle; renewal will use the tier they select in-app.

---

## Post-launch backlog (out of scope for this plan)

- **Hunter overage upsell.** When a user hits the monthly Hunter limit, offer "+50 lookups for $2.50" on the spot. Needs a new Stripe metered price + a small purchase flow.
- **Seat management for Team.** Currently `seats: 5` is documented but not enforced. Real teams need invite flows, per-seat auth, and role-scoped MCP keys.
- **Usage rollup table.** Current design queries `usage_events` directly. Fine at any indie-SEO scale; at 10k+ users, add a nightly rollup into `usage_monthly_rollup` and swap `usageThisMonth` to read from it.
- **Purge old usage events.** Add a cron job (piggyback on the daily one) to delete `usage_events` older than 90 days.
- **Downgrade flow.** If a user with 8 sites downgrades to Solo (3-site limit), what happens? Current design: existing sites keep working, they just can't add more. Consider a soft nudge or a "which to keep" flow.
- **Yearly upgrade prorating.** Stripe handles this natively via `proration_behavior: 'create_prorations'` but the current checkout flow may not surface it well.
