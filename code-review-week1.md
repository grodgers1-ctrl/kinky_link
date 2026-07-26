# kinkylink Week 1 — One-Pass Code Review

Scope: `src/` directory of `C:\Users\grodg\kinkyseo\linklight`  
Tooling notes: `npm run lint` reports **46 errors, 10 warnings**; `npx tsc --noEmit` passes cleanly.

---

## 1. Security

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| **Critical** | `.env.local` (repo root) | 2–18 | Real secrets are committed in the working tree: `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `MOZ_SECRET_KEY`. These must be rotated and `.env.local` added to `.gitignore`. |
| High | `src/lib/db.ts` | 3–4 | Server code uses the **anon key** client (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). API routes will be subject to RLS policies; if RLS is disabled or misconfigured, data leaks are possible. Server-side data mutations should use a service-role client. |
| High | `src/lib/auth.ts` | 19–20 | Google OAuth scope requests broad Gmail access (`gmail.send`, `gmail.readonly`, `gmail.modify`). Confirm this scope is required for Week 1; over-scoping increases breach impact. |
| Medium | `src/app/api/campaigns/route.ts` | 9–10 | `req.json()` parsed without validation. Add Zod/schema validation for `name`/`siteId` to prevent malformed inserts. |
| Medium | `src/app/api/prospects/route.ts` | 9–12, 32–33, 51–52 | Query/body params are not validated or sanitized. Supabase builder escapes values, but schema-level validation is missing. |
| Medium | `src/app/api/prospects/batch/route.ts` | 9–10, 16–25 | `prospects` array is not validated; arbitrary keys are spread into inserts. Validate shape and cap array length. |
| Medium | multiple API routes | all | No rate limiting or abuse protection on expensive calls (`/api/prospects/search`, `/api/sites`, GSC queries). |
| Low | `src/app/page.tsx` | 16, `src/components/dashboard/sidebar.tsx` | `<img>` tags used instead of Next.js `<Image />`; less critical for security but relevant for performance/optimization. |

---

## 2. Error Handling

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| High | `src/app/api/campaigns/route.ts` | 32–38 | `GET` ignores the `error` object from Supabase; only `data` is returned. If the query fails, the client gets an empty array with no error signal. |
| High | `src/app/api/prospects/route.ts` | 14–25, 35–44, 47–55 | `GET`, `PATCH`, and `DELETE` do not wrap Supabase calls in `try/catch`; `PATCH` and `DELETE` also silently ignore errors. |
| High | `src/app/api/prospects/route.ts` | 52–55 | `DELETE` does not check whether a row was actually deleted; returns `{ success: true }` even for non-owned/non-existent IDs. |
| Medium | `src/components/dashboard/connect-site-card.tsx` | 8–19 | Errors are swallowed (`catch { setSites([]) }`). No user-facing error state. |
| Medium | `src/components/dashboard/gsc-summary.tsx` | 16–22 | Fetch errors are swallowed with `.catch(() => setRows([]))`. User sees “No performance data” instead of an error message. |
| Medium | `src/components/prospects/prospect-row.tsx` | 32–39, 41–46 | `save` and `remove` fetch calls are not awaited/handled; no `try/catch`, no loading state, no feedback on failure. |
| Medium | `src/components/prospects/prospect-table.tsx` | 89–98 | Batch add fetch is not error-handled; dialog closes optimistically. |
| Medium | `src/components/prospects/prospects-view.tsx` | 18–28 | `fetchProspects` is not wrapped in `try/catch`; a network error leaves `loading` stuck at `true`. |
| Low | `src/components/pipeline/pipeline-board.tsx` | 19–24 | Initial fetch has no error handling. |

---

## 3. TypeScript

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| High | `src/types/next-auth.d.ts` | 1–12 | JWT is not extended with `accessToken`/`refreshToken`/`expiresAt`/`id`, forcing `(session as any)` casts elsewhere. |
| High | `src/lib/auth.ts` | 42–43 | `(session as any).accessToken` / `(session as any).refreshToken`. Fix by extending NextAuth types and casting to the typed interface. |
| High | `src/app/api/sites/route.ts` | 12–13, 25 | Multiple `as any` casts; service-account token typing should come from NextAuth. |
| High | `src/app/api/sites/[id]/performance/route.ts` | 31–32 | Same `(session as any).accessToken` pattern. |
| Medium | `src/lib/supabase-adapter.ts` | 17, 28–32, 69–72, 88–98 | Heavy use of `(x as any)` instead of using proper Auth.js adapter types. Lint flags 28 `any` instances in this file alone. |
| Medium | `src/components/auth/sign-in-button.tsx` | 4 | `session: any` — should be `Session \| null`. |
| Medium | `src/components/dashboard/campaign-list.tsx` | 1 | `campaigns: any[]` — use `Campaign[]`. |
| Medium | `src/components/dashboard/connect-site-card.tsx` | 6, 40 | `useState<any[]>` and inline `site: any`. |
| Medium | `src/components/prospects/prospect-search.tsx` | 7 | `results: any[]` — use `ProspectResult[]`. |
| Medium | `src/components/prospects/prospect-table.tsx` | 9 | `results: any[]`. |
| Medium | `src/components/prospects/prospect-row.tsx` | 24, 32 | `prospect: any`, `updates: Record<string, any>`. Use `Prospect` / partial update type. |
| Medium | `src/components/prospects/prospects-view.tsx` | 10 | `prospects: any[]` — use `Prospect[]`. |
| Medium | `src/components/pipeline/pipeline-board.tsx` | 15 | `prospects: any[]`. |
| Medium | `src/components/pipeline/pipeline-column.tsx` | 15 | `prospects: any[]`. |
| Medium | `src/components/pipeline/prospect-card.tsx` | 5 | `prospect: any`. |
| Medium | `src/app/api/prospects/batch/route.ts` | 16 | `(p: any)` — define a DTO. |
| Low | `src/components/ui/input.tsx` | 4 | Empty `InputProps` interface flagged by ESLint; either add props or use `type InputProps = React.InputHTMLAttributes<HTMLInputElement>`. |
| Low | `src/components/dashboard/connect-site-card.tsx` | 2 | `useEffect` imported but never used. |
| Low | `src/components/dashboard/gsc-summary.tsx` | 12 | `siteUrl` prop defined but never used. |
| Low | `src/components/prospects/prospect-row.tsx` | 30 | `editNotes`/`setEditNotes` defined but never used. |
| Low | `src/components/prospects/prospects-view.tsx` | 37 | `toggle` function defined but never used. |

---

## 4. Next.js 16 Conventions

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| Medium | `src/app/api/campaigns/route.ts` | 5, 28 | Uses `Request` instead of `NextRequest`. Not a bug, but inconsistent with `src/app/api/sites/[id]/performance/route.ts` which correctly imports `NextRequest`. |
| Medium | `src/app/api/prospects/route.ts` | 5, 28, 47 | Same: `Request` instead of `NextRequest`. |
| Medium | `src/app/api/prospects/search/route.ts` | 6 | Same: `Request` instead of `NextRequest`. |
| Medium | `src/app/api/sites/route.ts` | 6 | Same: `Request` instead of `NextRequest`. |
| Low | `src/app/api/sites/[id]/performance/route.ts` | 11–14 | `params` is correctly typed as `Promise<{ id: string }>` and awaited — good. |
| Low | `src/app/api/auth/[...nextauth]/route.ts` | 1–2 | NextAuth v5 handler export is correct. |
| Low | `src/app/page.tsx` | 16, `src/components/dashboard/sidebar.tsx` | `<img>` tags instead of Next.js `<Image />` component. |
| Low | `src/app/layout.tsx` | 2 | Imports `Geist`/`Geist_Mono` but brand guide specifies Calibre; fonts are unused/left as variables. |

---

## 5. Supabase / PostgREST Case Mismatches

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| Medium | `src/app/api/prospects/batch/route.ts` | 16–25 | Correctly maps camelCase input `p.domainAuthority` to snake_case column `domain_authority`. However, `p` is untyped, so this mapping is fragile. |
| Low | `src/types/index.ts` | 28–46 | Interface uses `domain_authority`, `email_verified`, `pipeline_order` (snake_case) matching the schema. Good. |
| Low | `src/lib/supabase-adapter.ts` | 24–172 | Adapter consistently uses snake_case for DB columns (`email_verified`, `provider_account_id`, etc.). Good. |
| Note | `src/app/api/campaigns/route.ts` | 17–19 | Inserts `user_id`, `name`, `site_id` (snake_case) from camelCase `siteId`. Mapping is correct. |

**Verdict:** No actual column-name mismatches found, but the lack of typed DTOs makes the boundary easy to break.

---

## 6. Brand Consistency

Brand tokens in `src/app/globals.css`: `--brand-primary #ECFBFD`, `--brand-secondary #140044`, `--brand-accent #FF224B`, `--brand-surface #EDEEEF`, `--brand-text #000000`, `--brand-white #FEFEFE`.

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| Medium | `src/components/ui/button.tsx` | 10–15 | Variants use generic Tailwind grays (`bg-gray-900`, `bg-gray-100`, etc.) instead of `bg-brand-secondary`, `bg-brand-primary`, `text-brand-secondary`. |
| Medium | `src/components/ui/input.tsx` | 11 | Uses `border-gray-300`, `bg-white`, `focus:ring-gray-400` instead of brand surface/border colors. |
| Medium | `src/components/ui/toast.tsx` | 53–55 | Uses generic `bg-green-600`, `bg-red-600`, `bg-yellow-500`. Brand accent red is `#FF224B` (`brand-accent`); success/warning colors are not brand-aligned. |
| Medium | `src/components/prospects/prospect-row.tsx` | 4–10 | Status badges use Tailwind default colors (`bg-gray-100`, `bg-blue-100`, etc.) rather than brand palette. |
| Medium | `src/components/prospects/prospect-table.tsx` | 62–70 | DA badge uses `bg-green-100`, `bg-yellow-100`, `bg-gray-100` instead of brand colors. |
| Low | many components | many | Hardcoded neutrals are scattered throughout: `#575858` (text-muted), `#999999`, `#777777`, `#DCDDDE` (borders), `#CCCCCD` (inputs), `#FFF0F2` (error bg). These should be centralized as CSS variables or Tailwind theme tokens (e.g., `text-brand-muted`, `border-brand-border`). |
| Low | `src/app/dashboard/settings/page.tsx` | 4–5 | Uses `text-gray-900` / `text-gray-600` instead of brand text colors. |
| Low | `src/app/layout.tsx` | 17–20 | Metadata description matches brand copy; OK. |

---

## 7. UX Gaps

| Severity | File | Line(s) | Finding |
|---|---|---|---|
| High | `src/components/pipeline/pipeline-board.tsx` | 19–24 | No error state if the initial `/api/prospects` call fails. |
| High | `src/components/prospects/prospect-row.tsx` | 32–46 | Inline title edit and delete have no loading indicators and no error feedback. |
| Medium | `src/components/dashboard/connect-site-card.tsx` | 21–48 | No error state; button disables during loading, but failure is invisible. |
| Medium | `src/components/dashboard/gsc-summary.tsx` | 31–74 | No top-level error state; only loading/empty. |
| Medium | `src/components/prospects/prospects-view.tsx` | 92–105 | Bulk tag apply has no loading state and no error handling. |
| Medium | `src/components/prospects/prospect-table.tsx` | 85–101 | “Add to Campaign” dialog fetch has no error feedback. |
| Medium | `src/components/pipeline/pipeline-board.tsx` | 28–45 | Drag-and-drop status update has no rollback on failure; card stays in the new column even if `PATCH` fails. |
| Low | `src/app/dashboard/settings/page.tsx` | 1–8 | Placeholder page with no actual functionality or navigation back-link. |
| Low | `src/components/pipeline/pipeline-column.tsx` | 21 | Column header colors use generic Tailwind (`bg-gray-50`, `bg-blue-50`) rather than brand semantic colors. |
| Low | global | — | No global error boundary (`error.tsx`) or not-found page (`not-found.tsx`) in the dashboard route group. |
| Low | global | — | No skeleton screens beyond the pipeline loading placeholder. |

---

## Summary of Priorities

1. **Security first:** rotate leaked secrets, move server-side Supabase client to service-role, validate request bodies, and add rate limiting.
2. **Error handling:** wrap all Supabase calls in `try/catch`, return structured errors from APIs, and surface them in UI components.
3. **TypeScript:** extend NextAuth types to remove `(session as any)` casts, replace component-level `any[]` props with shared types from `src/types/index.ts`, and clean up ESLint errors.
4. **Next.js conventions:** standardize on `NextRequest`, replace `<img>` with `<Image />`.
5. **Brand:** centralize neutrals as theme tokens and update `Button`/`Input`/`Toast` components to use brand colors.
6. **UX:** add error/loading states to inline edits, batch actions, and pipeline drag operations; consider `error.tsx` / `not-found.tsx`.

Overall the Week 1 build is functionally coherent, but it needs hardening around auth, typing, and error surfaces before it’s safe to deploy.
