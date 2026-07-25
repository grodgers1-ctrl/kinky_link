# Auth + Supabase Learnings

## 1. @auth/supabase-adapter uses `next_auth` schema, not `public`
- The adapter hardcodes `db: { schema: "next_auth" }` when creating the Supabase client
- That schema must be exposed via PostgREST config (`db_schema`), else returns 406
- We swapped to a custom adapter at `src/lib/supabase-adapter.ts` that uses `public` schema

## 2. PostgREST camelCase→snake_case conversion
- SELECT queries: camelCase JS property names auto-convert to snake_case columns (e.g. `{ providerAccountId }` → `provider_account_id`)
- INSERT: **no auto-conversion** — must explicitly use snake_case keys (`provider_account_id`, `user_id`, `email_verified`)
- Error signature: `PGRST204 "Could not find the '${columnName}' column of '${table}' in the schema cache"`

## 3. NextAuth v5 beta (5.0.0-beta.32) with JWT strategy
- `session` callback receives `{ session, token }` — **not** `{ session, user }`
- `user` is only present during initial sign-in; `undefined` on subsequent requests
- Pattern: store user ID in `jwt` callback (`token.id = user.id`), read from `token.id` in `session` callback

## 4. Route groups don't affect URL paths
- `app/(dashboard)/page.tsx` serves at `/` — same path as `app/page.tsx`
- Route groups only share layouts, they don't add URL segments
- `/dashboard` requires `app/dashboard/page.tsx`

## 5. Orphaned users from partial sign-ups
- If `createUser` succeeds but `linkAccount` fails, the user exists without a linked account
- NextAuth throws `OAuthAccountNotLinked` on retry (`getUserByEmail` finds orphan)
- Fix: delete the orphan user from `users` + `accounts` tables via REST API with service_role key
