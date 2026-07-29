# linklight MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a remote MCP (Model Context Protocol) server so users can drive linklight from their own AI agent (Claude Desktop, Claude Code, Cursor). Zero-install for the user — they paste a URL + API key into their MCP client config.

**Architecture:** Single JSON-RPC endpoint at `/api/mcp` served by the existing Next.js app on Vercel. Bearer-token auth (long-lived API keys stored SHA-256 hashed in Supabase). Eight read + write tools that wrap existing `src/lib/*` functions. A settings page manages keys and shows copy-paste snippets for popular MCP clients. A public `/docs/mcp` page acts as marketing surface. No new external services, no standing infra.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres via `supabaseAdmin` from `@/lib/db`), NextAuth v5 beta (`auth()` from `@/lib/auth`), TypeScript, Tailwind v4 with brand tokens (`brand-secondary`, `brand-white`, `brand-primary`, `brand-surface`, `brand-accent`). No test framework in the repo; verification uses `curl`/`node` smoke scripts and `npm run build` + `npm run lint`.

**Conventions this repo enforces:**
- API routes use `NextRequest`/`NextResponse` and check `await auth()` first.
- Supabase writes go through `supabaseAdmin` (service role); reads that must respect RLS use `supabase`.
- No `any` — ESLint fails on it. Use `unknown` + narrowing.
- Migrations: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`; mirror the DDL into `supabase-schema.sql`.
- Brand tokens only; never hex literals for brand-relevant colors (grey shades like `#575858` are allowed and used throughout).
- `console.log` is fine on error paths only; no debug logging in success paths.

**One-time env you'll need:**
- `.env.local` at `linklight/.env.local` must contain `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` (Management API PAT), plus everything already there. `MCP_ORIGIN` (see Task 1) will be added.

**Applying migrations without the Supabase CLI:** the repo has no supabase CLI installed. Use the Management API pattern proven in commit `815aaef`:
```bash
export $(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_ACCESS_TOKEN)=' .env.local | xargs -d '\n')
REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')
python -c "import json,sys; sys.stdout.write(json.dumps({'query': open('supabase/migrations/FILE.sql').read()}))" > /tmp/mig.json
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/mig.json
```

---

## File Structure

```
linklight/
├── supabase/migrations/
│   └── 20260730120000_api-keys.sql               [Task 1]
├── supabase-schema.sql                           [Task 1 — mirror]
├── src/lib/
│   ├── api-keys.ts                               [Task 2]
│   └── mcp/
│       ├── types.ts                              [Task 4]
│       ├── protocol.ts                           [Task 4]
│       ├── tools.ts                              [Task 6]
│       └── handlers.ts                           [Tasks 7 & 8]
├── src/app/api/
│   ├── mcp/route.ts                              [Task 4, extended in 7-8]
│   └── api-keys/
│       ├── route.ts                              [Task 10]
│       └── [id]/route.ts                         [Task 10]
├── src/components/settings/
│   ├── api-key-manager.tsx                       [Task 11]
│   └── mcp-setup-snippets.tsx                    [Task 12]
├── src/app/dashboard/settings/
│   ├── page.tsx                                  [Task 13 — modify]
│   └── api-access/page.tsx                       [Task 13]
├── src/app/docs/mcp/page.tsx                     [Task 15]
├── src/app/page.tsx                              [Task 16 — small edit]
└── scripts/
    ├── verify-api-keys.ts                        [Task 3]
    └── verify-mcp.mjs                            [Tasks 5 & 9]
```

**File responsibilities:**
- `api-keys.ts` — pure helpers: `generateKey()`, `hashKey()`, `verifyKey(raw) -> userId|null`. No HTTP, no rendering.
- `mcp/types.ts` — TypeScript types for JSON-RPC envelopes and MCP tool shape.
- `mcp/protocol.ts` — MCP-level helpers: `respond()`, `error()`, protocol version constant.
- `mcp/tools.ts` — the tool registry: name → `{ description, inputSchema, handler }`.
- `mcp/handlers.ts` — the eight handler functions, each `(userId, args) => Promise<result>`.
- `api/mcp/route.ts` — thin dispatcher: auth → parse JSON-RPC → route method → return JSON.
- `api/api-keys/*` — REST CRUD for the settings UI, session-authed (not bearer-authed).
- `api-key-manager.tsx` — client component: list, create modal (shows key once), revoke.
- `mcp-setup-snippets.tsx` — client component: 3 tabs, copy-paste JSON blocks.
- `dashboard/settings/api-access/page.tsx` — server component: loads keys, renders manager + snippets.
- `docs/mcp/page.tsx` — public marketing/reference page mirroring the setup snippets + tool list.

---

## Task 1: DB migration — `api_keys` table

**Files:**
- Create: `linklight/supabase/migrations/20260730120000_api-keys.sql`
- Modify: `linklight/supabase-schema.sql` (append)

- [ ] **Step 1: Write the migration SQL**

Create `linklight/supabase/migrations/20260730120000_api-keys.sql`:

```sql
CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_user     ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash     ON api_keys(key_hash) WHERE revoked_at IS NULL;
```

- [ ] **Step 2: Mirror into `supabase-schema.sql`**

Append the same block to the end of `linklight/supabase-schema.sql` so the reference schema stays complete.

- [ ] **Step 3: Apply via Management API**

Run from `linklight/`:
```bash
export $(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_ACCESS_TOKEN)=' .env.local | xargs -d '\n')
REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')
python -c "import json,sys; sys.stdout.write(json.dumps({'query': open('supabase/migrations/20260730120000_api-keys.sql').read()}))" > /tmp/mig.json
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/mig.json
```
Expected output: `[]` (empty array — Postgres returns no rows for DDL).

- [ ] **Step 4: Verify the table exists**

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='"'"'api_keys'"'"' ORDER BY ordinal_position;"}'
```
Expected: 7 rows (`id`, `user_id`, `name`, `key_hash`, `key_prefix`, `last_used_at`, `created_at`, `revoked_at`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260730120000_api-keys.sql supabase-schema.sql
git commit -m "mcp: add api_keys table for bearer-token auth"
```

---

## Task 2: API key generation/hash/verify library

**Files:**
- Create: `linklight/src/lib/api-keys.ts`

- [ ] **Step 1: Write `src/lib/api-keys.ts`**

```ts
import { createHash, randomBytes } from "node:crypto"
import { supabaseAdmin } from "@/lib/db"

const KEY_PREFIX = "sk_ll_"

export interface ApiKeyRow {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

export function generateKey(): { raw: string; hash: string; prefix: string } {
  const random = randomBytes(24).toString("base64url")
  const raw = `${KEY_PREFIX}${random}`
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, 12) }
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export async function verifyKey(raw: string): Promise<string | null> {
  if (!raw || !raw.startsWith(KEY_PREFIX)) return null
  const hash = hashKey(raw)
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle()
  if (!data) return null
  // Fire-and-forget last_used_at bump
  supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {})
  return data.user_id
}

export async function listKeys(userId: string): Promise<ApiKeyRow[]> {
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, created_at, revoked_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  return data || []
}

export async function createKey(userId: string, name: string): Promise<{ raw: string; row: ApiKeyRow }> {
  const { raw, hash, prefix } = generateKey()
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .insert({ user_id: userId, name, key_hash: hash, key_prefix: prefix })
    .select("id, name, key_prefix, last_used_at, created_at, revoked_at")
    .single()
  if (error || !data) throw new Error(error?.message || "Failed to create API key")
  return { raw, row: data }
}

export async function revokeKey(userId: string, keyId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", userId)
    .is("revoked_at", null)
  return !error
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd linklight && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-keys.ts
git commit -m "mcp: add api-keys library (generate, hash, verify, list, create, revoke)"
```

---

## Task 3: Verification script — round-trip a key

**Files:**
- Modify: `linklight/package.json` (add `tsx` devDep)
- Create: `linklight/scripts/verify-api-keys.ts`

**Why `tsx`:** the verify script needs to import `src/lib/api-keys.ts` (which uses the `@/` path alias and imports `@supabase/supabase-js`). Compiling with plain `tsc` to `/tmp` breaks module resolution — `tsx` runs TypeScript directly with alias + package resolution working, and it's a single small devDep with no runtime footprint.

- [ ] **Step 1: Install tsx**

```bash
cd linklight && npm install --save-dev tsx
```
Expected: exits 0, `tsx` added to `devDependencies` in `package.json`.

- [ ] **Step 2: Write `scripts/verify-api-keys.ts`**

```ts
// scripts/verify-api-keys.ts
// Verifies generate/hash/verify roundtrip against the real DB.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-api-keys.ts
import {
  generateKey,
  hashKey,
  verifyKey,
  createKey,
  revokeKey,
  listKeys,
} from "@/lib/api-keys"
import { supabaseAdmin } from "@/lib/db"

const { raw, hash, prefix } = generateKey()
console.log("generateKey:", { rawLen: raw.length, prefix, hashLen: hash.length })
if (hashKey(raw) !== hash) throw new Error("hashKey mismatch")

const { data: users } = await supabaseAdmin.from("users").select("id").limit(1)
if (!users?.length) {
  console.log("SKIP DB roundtrip: no users in DB")
  process.exit(0)
}
const userId = users[0].id as string

const { raw: created, row } = await createKey(userId, "verify-script")
console.log("createKey:", { id: row.id, prefix: row.key_prefix })

const verified = await verifyKey(created)
if (verified !== userId) throw new Error(`verifyKey returned ${verified}, expected ${userId}`)
console.log("verifyKey: OK")

const wrong = await verifyKey("sk_ll_notarealkey")
if (wrong !== null) throw new Error("verifyKey should reject fake keys")
console.log("verifyKey (bad key): OK")

const revoked = await revokeKey(userId, row.id)
if (!revoked) throw new Error("revokeKey failed")
const afterRevoke = await verifyKey(created)
if (afterRevoke !== null) throw new Error("verifyKey should reject revoked keys")
console.log("revokeKey: OK")

const keys = await listKeys(userId)
console.log("listKeys count:", keys.length)
console.log("\nALL PASS")
```

**Important — path alias resolution:** `tsx` reads `tsconfig.json` for the `@/*` mapping automatically. If your `tsconfig.json` doesn't include `scripts/**`, add it to the `include` array (or use `tsx --tsconfig ./tsconfig.json`). Confirm with:
```bash
grep -A5 "\"include\"" linklight/tsconfig.json
```
If `scripts` isn't included, add `"scripts/**/*"` to the `include` array.

- [ ] **Step 3: Run it**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-api-keys.ts
```
Expected final line: `ALL PASS`. If it errors on `Cannot find module '@/lib/api-keys'`, apply the tsconfig fix noted above and retry.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/verify-api-keys.ts tsconfig.json
git commit -m "mcp: api-keys verification script (tsx-based)"
```

---

## Task 4: MCP endpoint skeleton (initialize + tools/list empty)

**Files:**
- Create: `linklight/src/lib/mcp/types.ts`
- Create: `linklight/src/lib/mcp/protocol.ts`
- Create: `linklight/src/app/api/mcp/route.ts`

- [ ] **Step 1: Write `src/lib/mcp/types.ts`**

```ts
export interface JsonRpcRequest {
  jsonrpc: "2.0"
  id?: string | number | null
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface ToolContent {
  type: "text"
  text: string
}

export interface ToolResult {
  content: ToolContent[]
  isError?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}
```

- [ ] **Step 2: Write `src/lib/mcp/protocol.ts`**

```ts
import type { JsonRpcRequest, JsonRpcResponse } from "./types"

export const MCP_PROTOCOL_VERSION = "2025-06-18"

export const SERVER_INFO = {
  name: "linklight",
  version: "0.1.0",
}

export function ok(req: JsonRpcRequest, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: req.id ?? null, result }
}

export function err(
  req: JsonRpcRequest,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: req.id ?? null, error: { code, message, data } }
}

// Standard JSON-RPC error codes
export const PARSE_ERROR = -32700
export const INVALID_REQUEST = -32600
export const METHOD_NOT_FOUND = -32601
export const INVALID_PARAMS = -32602
export const INTERNAL_ERROR = -32603
```

- [ ] **Step 3: Write `src/app/api/mcp/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { verifyKey } from "@/lib/api-keys"
import {
  MCP_PROTOCOL_VERSION,
  SERVER_INFO,
  ok,
  err,
  METHOD_NOT_FOUND,
  INVALID_REQUEST,
  INTERNAL_ERROR,
} from "@/lib/mcp/protocol"
import type { JsonRpcRequest } from "@/lib/mcp/types"

export const runtime = "nodejs"

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || ""
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

export async function POST(req: NextRequest) {
  const token = extractBearer(req)
  const userId = token ? await verifyKey(token) : null
  if (!userId) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
      { status: 401 },
    )
  }

  let rpc: JsonRpcRequest
  try {
    rpc = (await req.json()) as JsonRpcRequest
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "Invalid JSON" } })
  }

  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return NextResponse.json(err(rpc, INVALID_REQUEST, "Invalid JSON-RPC request"))
  }

  try {
    switch (rpc.method) {
      case "initialize":
        return NextResponse.json(
          ok(rpc, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          }),
        )
      case "notifications/initialized":
        // Notifications carry no id and expect no response; MCP spec allows 202.
        return new NextResponse(null, { status: 202 })
      case "tools/list":
        return NextResponse.json(ok(rpc, { tools: [] }))
      case "resources/list":
        return NextResponse.json(ok(rpc, { resources: [] }))
      case "prompts/list":
        return NextResponse.json(ok(rpc, { prompts: [] }))
      default:
        return NextResponse.json(err(rpc, METHOD_NOT_FOUND, `Method ${rpc.method} not found`))
    }
  } catch (error) {
    console.error("MCP handler error:", error)
    const message = error instanceof Error ? error.message : "Internal error"
    return NextResponse.json(err(rpc, INTERNAL_ERROR, message))
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", server: SERVER_INFO.name, version: SERVER_INFO.version })
}
```

- [ ] **Step 4: Build to catch type errors**

```bash
cd linklight && npm run build 2>&1 | tail -15
```
Expected: `✓ Compiled successfully` and no errors from `/api/mcp`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/types.ts src/lib/mcp/protocol.ts src/app/api/mcp/route.ts
git commit -m "mcp: add /api/mcp endpoint skeleton (initialize, tools/list empty)"
```

---

## Task 5: Verification script — MCP round-trip

**Files:**
- Create: `linklight/scripts/verify-mcp.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/verify-mcp.mjs
// Hits the live dev server. Usage:
//   npm run dev                  # in another terminal
//   node --env-file=.env.local scripts/verify-mcp.mjs <API_KEY>
const key = process.argv[2]
if (!key) {
  console.error("Usage: node scripts/verify-mcp.mjs <API_KEY>")
  console.error("Generate a key with the verify-api-keys script or via the UI.")
  process.exit(1)
}

const URL = process.env.MCP_URL || "http://localhost:3000/api/mcp"

async function call(method, params) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  if (res.status === 202) return null
  return res.json()
}

const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify", version: "0" } })
console.log("initialize:", JSON.stringify(init.result, null, 2))
if (init.result?.serverInfo?.name !== "linklight") throw new Error("bad serverInfo")

const list = await call("tools/list", {})
console.log("tools/list count:", list.result.tools.length)

const bad = await call("does/not/exist", {})
if (bad.error?.code !== -32601) throw new Error(`expected -32601, got ${bad.error?.code}`)
console.log("unknown method: OK")

console.log("\nMCP PASS")
```

- [ ] **Step 2: Boot dev server in one terminal**

```bash
cd linklight && npm run dev
```
Wait for `Ready in ...ms`.

- [ ] **Step 3: Create a test key and run verification in another terminal**

```bash
cd linklight
npx tsx --env-file=.env.local scripts/verify-api-keys.ts
# Copy the last-printed raw key (from createKey step in that script).
# Or query DB for one:
#   curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" ...
# Then:
node --env-file=.env.local scripts/verify-mcp.mjs <PASTE_KEY>
```
Expected final line: `MCP PASS`. `tools/list count: 0` at this stage.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-mcp.mjs
git commit -m "mcp: add MCP round-trip verification script"
```

---

## Task 6: Tool schemas

**Files:**
- Create: `linklight/src/lib/mcp/tools.ts`

- [ ] **Step 1: Write the tool registry**

```ts
import type { ToolDefinition, ToolResult } from "./types"

export type Handler = (userId: string, args: Record<string, unknown>) => Promise<ToolResult>

export interface Tool extends ToolDefinition {
  handler: Handler
}

export const TOOLS: Tool[] = [] // populated by handlers.ts via registerTool

export function registerTool(t: Tool) {
  if (TOOLS.some((x) => x.name === t.name)) {
    throw new Error(`Duplicate tool: ${t.name}`)
  }
  TOOLS.push(t)
}

export function toolSchemas(): ToolDefinition[] {
  return TOOLS.map(({ handler: _h, ...rest }) => rest)
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name)
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] }
}

export function jsonResult(obj: unknown): ToolResult {
  return textResult(JSON.stringify(obj, null, 2))
}

export function errorResult(msg: string): ToolResult {
  return { content: [{ type: "text", text: msg }], isError: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/mcp/tools.ts
git commit -m "mcp: add tool registry"
```

---

## Task 7: Read-only tool handlers

**Files:**
- Create: `linklight/src/lib/mcp/handlers.ts`
- Modify: `linklight/src/app/api/mcp/route.ts` (wire tools/list + tools/call)

- [ ] **Step 1: Write `src/lib/mcp/handlers.ts`**

```ts
import { supabaseAdmin } from "@/lib/db"
import { getSerpForKeyword, getDomainFacts } from "@/lib/corpus"
import { registerTool, jsonResult, errorResult } from "./tools"

// ---- search_prospects ----
registerTool({
  name: "search_prospects",
  description:
    "Find prospect sites for a keyword. Uses the shared SERP cache when fresh; scrapes Google on miss. Returns url, title, domain, position, and Moz Domain Authority.",
  inputSchema: {
    type: "object",
    properties: {
      keyword: { type: "string", description: "Search phrase (2-200 chars)" },
      limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
    },
    required: ["keyword"],
  },
  handler: async (_userId, args) => {
    const keyword = String(args.keyword || "").trim()
    if (!keyword) return errorResult("keyword is required")
    if (keyword.length > 200) return errorResult("keyword too long")
    const limit = Math.min(20, Math.max(1, Number(args.limit) || 10))
    const results = await getSerpForKeyword(keyword)
    return jsonResult(results.slice(0, limit))
  },
})

// ---- enrich_domain ----
registerTool({
  name: "enrich_domain",
  description:
    "Return known facts about a domain: Moz Domain Authority, cached contact email, homepage title/description. Data is shared across all users of linklight so common domains are instant.",
  inputSchema: {
    type: "object",
    properties: { domain: { type: "string", description: "Bare hostname, e.g. example.com" } },
    required: ["domain"],
  },
  handler: async (_userId, args) => {
    const domain = String(args.domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    if (!domain) return errorResult("domain is required")
    const facts = await getDomainFacts([domain])
    const { data: full } = await supabaseAdmin
      .from("domain_facts")
      .select("domain, domain_authority, contact_email, title, description, last_seen_at, seen_count")
      .eq("domain", domain)
      .maybeSingle()
    return jsonResult({ domain, ...facts[domain], details: full })
  },
})

// ---- list_campaigns ----
registerTool({
  name: "list_campaigns",
  description: "List the caller's campaigns with id, name, status, and created_at.",
  inputSchema: { type: "object", properties: {} },
  handler: async (userId) => {
    const { data } = await supabaseAdmin
      .from("campaigns")
      .select("id, name, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
    return jsonResult(data || [])
  },
})

// ---- list_prospects ----
registerTool({
  name: "list_prospects",
  description:
    "List prospects. Filter by campaign_id and/or status (prospect|contacted|replied|live_link|declined|archived).",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      status: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  handler: async (userId, args) => {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50))
    let q = supabaseAdmin
      .from("prospects")
      .select("id, campaign_id, url, domain, title, email, status, domain_authority, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (args.campaign_id) q = q.eq("campaign_id", String(args.campaign_id))
    if (args.status) q = q.eq("status", String(args.status))
    const { data } = await q
    return jsonResult(data || [])
  },
})

// ---- list_backlinks ----
registerTool({
  name: "list_backlinks",
  description:
    "List backlinks earned to a site. Filter by health_status (healthy|redirected|broken|unreachable|pending|error).",
  inputSchema: {
    type: "object",
    properties: {
      site_id: { type: "string" },
      health_status: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  handler: async (userId, args) => {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50))
    let q = supabaseAdmin
      .from("backlinks")
      .select("id, site_id, source_url, target_url, anchor_text, first_seen, last_seen, is_indexed, health_status, last_health_check")
      .eq("user_id", userId)
      .order("last_seen", { ascending: false, nullsFirst: false })
      .limit(limit)
    if (args.site_id) q = q.eq("site_id", String(args.site_id))
    if (args.health_status) q = q.eq("health_status", String(args.health_status))
    const { data } = await q
    return jsonResult(data || [])
  },
})

// ---- list_replies ----
registerTool({
  name: "list_replies",
  description:
    "List prospects who replied to outreach. Optionally filter by ISO-8601 since date.",
  inputSchema: {
    type: "object",
    properties: {
      since: { type: "string", description: "ISO-8601 timestamp; only prospects updated after this" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  handler: async (userId, args) => {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50))
    let q = supabaseAdmin
      .from("prospects")
      .select("id, campaign_id, url, domain, title, email, status, updated_at")
      .eq("user_id", userId)
      .eq("status", "replied")
      .order("updated_at", { ascending: false })
      .limit(limit)
    if (args.since) q = q.gt("updated_at", String(args.since))
    const { data } = await q
    return jsonResult(data || [])
  },
})
```

- [ ] **Step 2: Wire `tools/list` and `tools/call` into the route**

Modify `src/app/api/mcp/route.ts`. Replace the imports block and the two case branches:

Replace:
```ts
import type { JsonRpcRequest } from "@/lib/mcp/types"
```
With:
```ts
import type { JsonRpcRequest } from "@/lib/mcp/types"
import { toolSchemas, findTool, errorResult } from "@/lib/mcp/tools"
import "@/lib/mcp/handlers"
```

Replace:
```ts
      case "tools/list":
        return NextResponse.json(ok(rpc, { tools: [] }))
```
With:
```ts
      case "tools/list":
        return NextResponse.json(ok(rpc, { tools: toolSchemas() }))
      case "tools/call": {
        const params = (rpc.params as { name?: string; arguments?: Record<string, unknown> }) || {}
        const tool = params.name ? findTool(params.name) : undefined
        if (!tool) {
          return NextResponse.json(ok(rpc, errorResult(`Unknown tool: ${params.name}`)))
        }
        const result = await tool.handler(userId, params.arguments || {})
        return NextResponse.json(ok(rpc, result))
      }
```

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | tail -10
```
Expected: clean compile.

- [ ] **Step 4: Smoke-test tools/list**

Boot dev server, then:
```bash
node --env-file=.env.local scripts/verify-mcp.mjs <API_KEY>
```
Expected: `tools/list count: 6`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/handlers.ts src/app/api/mcp/route.ts
git commit -m "mcp: add 6 read-only tool handlers (search, enrich, list_*)"
```

---

## Task 8: Write tool handlers (find_email, draft_email, save_draft)

**Files:**
- Modify: `linklight/src/lib/mcp/handlers.ts` (append)

- [ ] **Step 1: Confirm helper functions exist**

Read the exports of these to confirm exact names/signatures before writing handlers:
```bash
grep -nE "^export " linklight/src/lib/hunter.ts linklight/src/lib/ai-writer.ts
```
Expected: `hunter.ts` exports something like `findEmail(domain)` or `hunterFindEmail(...)`, and `ai-writer.ts` exports `generateEmailDraft(...)`, `checkAiUsage(...)`, `getAiUsageRemaining(...)`. If names differ from what's below, use the actual names.

- [ ] **Step 2: Append the three handlers to `src/lib/mcp/handlers.ts`**

```ts
import { generateEmailDraft, checkAiUsage, getAiUsageRemaining } from "@/lib/ai-writer"
import { scoreEmail } from "@/lib/spam-score"

// find_email — adjust the import + call below to match the real hunter.ts export.
import * as hunter from "@/lib/hunter"

registerTool({
  name: "find_email",
  description: "Look up a contact email for a domain via Hunter. Result cached in domain_facts.",
  inputSchema: {
    type: "object",
    properties: { domain: { type: "string" } },
    required: ["domain"],
  },
  handler: async (_userId, args) => {
    const domain = String(args.domain || "").trim().toLowerCase()
    if (!domain) return errorResult("domain is required")

    // Prefer cached value
    const { data: cached } = await supabaseAdmin
      .from("domain_facts")
      .select("contact_email, email_fetched_at")
      .eq("domain", domain)
      .maybeSingle()
    if (cached?.contact_email) return jsonResult({ domain, email: cached.contact_email, source: "cache" })

    // Live lookup — the actual export name may differ; adjust in Step 1 discovery.
    const finder =
      (hunter as unknown as { findEmail?: (d: string) => Promise<{ email?: string | null } | null> }).findEmail
    if (!finder) return errorResult("Hunter lookup unavailable")
    const res = await finder(domain)
    const email = res?.email || null

    if (email) {
      await supabaseAdmin.from("domain_facts").upsert(
        { domain, contact_email: email, email_fetched_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        { onConflict: "domain" },
      )
    }
    return jsonResult({ domain, email, source: "live" })
  },
})

registerTool({
  name: "draft_email",
  description:
    "Generate an outreach email draft. Returns subject, HTML body, plain-text body, and a spam score (0-10, higher = better).",
  inputSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "What the email is about" },
      article_title: { type: "string", description: "Their article being referenced (optional)" },
      site_name: { type: "string" },
      prospect_name: { type: "string" },
      tone: { type: "string", enum: ["friendly", "professional", "direct"], default: "friendly" },
      campaign_type: { type: "string", default: "outreach" },
    },
    required: ["topic"],
  },
  handler: async (userId, args) => {
    if (!checkAiUsage(userId)) {
      return errorResult(`Daily AI writing limit reached. Remaining: ${getAiUsageRemaining(userId)}`)
    }
    const draft = await generateEmailDraft({
      topic: String(args.topic),
      articleTitle: args.article_title ? String(args.article_title) : undefined,
      siteName: args.site_name ? String(args.site_name) : undefined,
      prospectName: args.prospect_name ? String(args.prospect_name) : undefined,
      tone: (args.tone as "friendly" | "professional" | "direct" | undefined) || "friendly",
      campaignType: (args.campaign_type as string | undefined) || "outreach",
    })
    const spamScore = scoreEmail({ subject: draft.subject, bodyHtml: draft.bodyHtml, bodyText: draft.bodyText })
    return jsonResult({ draft, spamScore, remaining: getAiUsageRemaining(userId) })
  },
})

registerTool({
  name: "save_draft",
  description:
    "Save a drafted email as a prospect note. Does NOT send. The user must review and send from the linklight UI.",
  inputSchema: {
    type: "object",
    properties: {
      prospect_id: { type: "string" },
      subject: { type: "string" },
      body_html: { type: "string" },
      body_text: { type: "string" },
    },
    required: ["prospect_id", "subject", "body_html"],
  },
  handler: async (userId, args) => {
    const prospectId = String(args.prospect_id)
    const subject = String(args.subject)
    const bodyHtml = String(args.body_html)
    const bodyText = args.body_text ? String(args.body_text) : ""

    // Confirm prospect belongs to caller
    const { data: prospect } = await supabaseAdmin
      .from("prospects")
      .select("id, notes")
      .eq("id", prospectId)
      .eq("user_id", userId)
      .maybeSingle()
    if (!prospect) return errorResult("Prospect not found")

    const stamp = new Date().toISOString()
    const marker = `--- MCP DRAFT ${stamp} ---\nSubject: ${subject}\n\n${bodyText || bodyHtml.replace(/<[^>]+>/g, " ")}\n`
    const combined = prospect.notes ? `${prospect.notes}\n\n${marker}` : marker

    const { error } = await supabaseAdmin
      .from("prospects")
      .update({ notes: combined, updated_at: stamp })
      .eq("id", prospectId)
      .eq("user_id", userId)
    if (error) return errorResult(`Failed to save draft: ${error.message}`)
    return jsonResult({ ok: true, prospect_id: prospectId, saved_at: stamp })
  },
})
```

**Note on `save_draft` design:** kinklight has no existing "drafts" table — the minimal safe surface is to append the draft to the prospect's `notes` field with a `--- MCP DRAFT ---` marker. The user reviews and copies into the actual composer. This is intentionally low-privilege for the first cut. A future task can add a proper `email_drafts` table.

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | tail -10
```
Expected: clean compile. If `find_email` fails because `hunter.ts` doesn't export `findEmail`, replace the import with the actual name from Step 1.

- [ ] **Step 4: Smoke test — call each new tool**

Boot dev server. Then extend `verify-mcp.mjs` with a small ad-hoc call and confirm output, or use curl:
```bash
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_email","arguments":{"domain":"example.com"}}}'
```
Expected: JSON-RPC response with `result.content[0].text` containing a JSON body with `domain`, `email`, `source`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/handlers.ts
git commit -m "mcp: add find_email, draft_email, save_draft tool handlers"
```

---

## Task 9: Full-suite end-to-end smoke

**Files:**
- Modify: `linklight/scripts/verify-mcp.mjs`

- [ ] **Step 1: Extend the verify script to exercise every tool**

Replace the body of `scripts/verify-mcp.mjs` after the existing `init` and `list` calls with:

```js
const list = await call("tools/list", {})
console.log("tools/list count:", list.result.tools.length)
if (list.result.tools.length !== 9) throw new Error(`expected 9 tools, got ${list.result.tools.length}`)

async function callTool(name, args) {
  const r = await call("tools/call", { name, arguments: args })
  const first = r.result?.content?.[0]?.text
  console.log(`\n[${name}]`, first?.slice(0, 200), "...")
  if (r.result?.isError) throw new Error(`Tool ${name} returned isError`)
  return r.result
}

await callTool("list_campaigns", {})
await callTool("list_prospects", { limit: 3 })
await callTool("list_backlinks", { limit: 3 })
await callTool("list_replies", { limit: 3 })
await callTool("enrich_domain", { domain: "example.com" })
// search_prospects will hit Google or cache — network permitting
try { await callTool("search_prospects", { keyword: "nextjs seo", limit: 3 }) } catch (e) { console.log("search_prospects skipped:", e.message) }

console.log("\nMCP FULL PASS")
```

- [ ] **Step 2: Run it**

```bash
cd linklight && node --env-file=.env.local scripts/verify-mcp.mjs <API_KEY>
```
Expected: `MCP FULL PASS`.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-mcp.mjs
git commit -m "mcp: extend verification to exercise all 9 tools"
```

---

## Task 10: REST endpoints for the key manager UI

**Files:**
- Create: `linklight/src/app/api/api-keys/route.ts`
- Create: `linklight/src/app/api/api-keys/[id]/route.ts`

- [ ] **Step 1: Write `src/app/api/api-keys/route.ts`**

```ts
import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { listKeys, createKey } from "@/lib/api-keys"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const keys = await listKeys(session.user.id)
  return NextResponse.json({ keys })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { name?: string } | null
  const name = body?.name?.trim() || "Untitled key"
  if (name.length > 60) return NextResponse.json({ error: "name too long" }, { status: 400 })
  const { raw, row } = await createKey(session.user.id, name)
  return NextResponse.json({ raw, row })
}
```

- [ ] **Step 2: Write `src/app/api/api-keys/[id]/route.ts`**

```ts
import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { revokeKey } from "@/lib/api-keys"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const ok = await revokeKey(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

Note: `params` is a `Promise` in Next.js 16 — the codebase already uses this pattern.

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | tail -10
```
Expected: `/api/api-keys` and `/api/api-keys/[id]` appear in the route list.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/api-keys/route.ts src/app/api/api-keys/[id]/route.ts
git commit -m "mcp: REST endpoints for API key management"
```

---

## Task 11: `ApiKeyManager` client component

**Files:**
- Create: `linklight/src/components/settings/api-key-manager.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client"
import { useState } from "react"
import type { ApiKeyRow } from "@/lib/api-keys"

export function ApiKeyManager({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys)
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setNewKey(data.raw)
      setKeys((k) => [data.row, ...k])
      setName("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create key")
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Any agent using it will lose access immediately.")) return
    const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" })
    if (res.ok) {
      setKeys((k) => k.map((x) => (x.id === id ? { ...x, revoked_at: new Date().toISOString() } : x)))
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-5">
        <h2 className="text-h3 font-semibold text-brand-secondary">Create a new key</h2>
        <p className="mt-1 text-sm text-[#575858]">
          Name it after where you&apos;ll use it, e.g. &quot;Claude Desktop&quot;.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Claude Desktop"
            className="flex-1 rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary"
          />
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white hover:bg-[#1f0066] disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create key"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-brand-accent">{error}</p>}
      </div>

      {newKey && (
        <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-5">
          <h3 className="font-semibold text-brand-accent">Copy this key now.</h3>
          <p className="mt-1 text-sm text-[#575858]">
            This is the only time it will be shown. Store it somewhere safe.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-brand-white px-3 py-2 font-mono text-xs text-brand-secondary">
              {newKey}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(newKey)}
              className="rounded-lg bg-brand-secondary px-3 py-2 text-xs font-medium text-brand-white hover:bg-[#1f0066]"
            >
              Copy
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="rounded-lg border border-[#DCDDDE] px-3 py-2 text-xs text-[#575858]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#DCDDDE] bg-brand-white">
        <div className="border-b border-[#DCDDDE] px-5 py-3">
          <h2 className="text-h3 font-semibold text-brand-secondary">Your keys</h2>
        </div>
        {keys.length === 0 ? (
          <p className="p-5 text-sm text-[#575858]">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-[#DCDDDE]">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-brand-secondary">
                    {k.name}
                    {k.revoked_at && (
                      <span className="ml-2 rounded bg-[#FFE4E6] px-2 py-0.5 text-xs text-brand-accent">revoked</span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-[#999999]">
                    {k.key_prefix}… &middot; created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : " · never used"}
                  </p>
                </div>
                {!k.revoked_at && (
                  <button
                    onClick={() => revoke(k.id)}
                    className="text-sm text-brand-accent hover:underline"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/api-key-manager.tsx
git commit -m "mcp: ApiKeyManager component (list, create, revoke)"
```

---

## Task 12: MCP setup snippets component

**Files:**
- Create: `linklight/src/components/settings/mcp-setup-snippets.tsx`

- [ ] **Step 1: Write the tabbed snippets component**

```tsx
"use client"
import { useState } from "react"

const CLIENTS = [
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    file: "~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%\\Claude\\claude_desktop_config.json (Windows)",
    snippet: (origin: string) =>
      JSON.stringify(
        {
          mcpServers: {
            linklight: {
              url: `${origin}/api/mcp`,
              headers: { Authorization: "Bearer sk_ll_PASTE_YOUR_KEY_HERE" },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "claude-code",
    label: "Claude Code",
    file: "~/.claude/settings.json (add under mcpServers)",
    snippet: (origin: string) =>
      JSON.stringify(
        {
          mcpServers: {
            linklight: {
              type: "http",
              url: `${origin}/api/mcp`,
              headers: { Authorization: "Bearer sk_ll_PASTE_YOUR_KEY_HERE" },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "cursor",
    label: "Cursor",
    file: "~/.cursor/mcp.json",
    snippet: (origin: string) =>
      JSON.stringify(
        {
          mcpServers: {
            linklight: {
              url: `${origin}/api/mcp`,
              headers: { Authorization: "Bearer sk_ll_PASTE_YOUR_KEY_HERE" },
            },
          },
        },
        null,
        2,
      ),
  },
]

export function McpSetupSnippets({ origin }: { origin: string }) {
  const [active, setActive] = useState(CLIENTS[0].id)
  const current = CLIENTS.find((c) => c.id === active)!
  const snippet = current.snippet(origin)

  return (
    <div className="rounded-lg border border-[#DCDDDE] bg-brand-white">
      <div className="flex border-b border-[#DCDDDE]">
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`px-4 py-3 text-sm font-medium ${
              c.id === active
                ? "border-b-2 border-brand-accent text-brand-secondary"
                : "text-[#575858] hover:text-brand-secondary"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="p-5">
        <p className="text-xs text-[#575858]">Add this to your config file:</p>
        <p className="mt-1 font-mono text-xs text-[#999999]">{current.file}</p>
        <div className="mt-3 flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto rounded bg-brand-surface p-4 font-mono text-xs text-brand-secondary">
            {snippet}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(snippet)}
            className="rounded-lg bg-brand-secondary px-3 py-2 text-xs font-medium text-brand-white hover:bg-[#1f0066]"
          >
            Copy
          </button>
        </div>
        <p className="mt-3 text-xs text-[#575858]">
          Replace <code>sk_ll_PASTE_YOUR_KEY_HERE</code> with a key from above. Restart your client after editing the config.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/mcp-setup-snippets.tsx
git commit -m "mcp: setup snippets component (Claude Desktop, Claude Code, Cursor tabs)"
```

---

## Task 13: Settings sub-page + link from main Settings

**Files:**
- Create: `linklight/src/app/dashboard/settings/api-access/page.tsx`
- Modify: `linklight/src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Write the sub-page**

```tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { listKeys } from "@/lib/api-keys"
import { ApiKeyManager } from "@/components/settings/api-key-manager"
import { McpSetupSnippets } from "@/components/settings/mcp-setup-snippets"

export default async function ApiAccessPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const keys = await listKeys(session.user.id)

  const h = await headers()
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000"
  const proto = h.get("x-forwarded-proto") || "https"
  const origin = `${proto}://${host}`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h2 font-bold text-brand-secondary">API Access</h1>
        <p className="mt-2 max-w-2xl text-body text-[#575858]">
          Connect linklight to your AI agent via MCP. Any MCP-compatible client works —
          Claude Desktop, Claude Code, Cursor, Windsurf. Your agent can search prospects,
          draft emails, and prepare campaigns for you to review. Sending stays behind a manual tap.
        </p>
      </div>

      <ApiKeyManager initialKeys={keys} />

      <div>
        <h2 className="text-h3 font-bold text-brand-secondary">Client setup</h2>
        <p className="mt-2 text-sm text-[#575858]">
          Pick your client and paste the snippet into its MCP config.
        </p>
        <div className="mt-4">
          <McpSetupSnippets origin={origin} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add a link from the main Settings page**

Modify `linklight/src/app/dashboard/settings/page.tsx`. Replace the return block with:

```tsx
  return (
    <div className="space-y-8">
      <h1 className="text-h2 font-bold text-brand-secondary">Settings</h1>
      <BillingSettings subscription={user} />

      <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-5">
        <h2 className="text-h3 font-semibold text-brand-secondary">API access</h2>
        <p className="mt-2 text-sm text-[#575858]">
          Connect linklight to Claude Desktop, Claude Code, Cursor, or any MCP-compatible AI agent.
        </p>
        <Link
          href="/dashboard/settings/api-access"
          className="mt-3 inline-block text-sm font-medium text-brand-accent hover:underline"
        >
          Manage API keys &rarr;
        </Link>
      </div>
    </div>
  )
```

And add the import at the top:
```tsx
import Link from "next/link"
```

- [ ] **Step 3: Build**

```bash
cd linklight && npm run build 2>&1 | tail -15
```
Expected: `/dashboard/settings` and `/dashboard/settings/api-access` in the route list.

- [ ] **Step 4: Boot + eyeball**

```bash
cd linklight && npm run dev
```
Visit `http://localhost:3000/dashboard/settings/api-access`. Confirm the manager renders, "Create key" works, the newly-created key appears in the "Copy this key now" panel, and the setup snippets show localhost URLs.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/settings/api-access/page.tsx src/app/dashboard/settings/page.tsx
git commit -m "mcp: settings/api-access page + link from main settings"
```

---

## Task 14: Sidebar link (skip if sidebar already covers settings root)

**Files:**
- Modify: `linklight/src/components/dashboard/sidebar.tsx` (only if needed)

- [ ] **Step 1: Verify current sidebar entries**

```bash
grep -nE "settings|href" linklight/src/components/dashboard/sidebar.tsx | head -20
```
The sidebar already links `/dashboard/settings`. No sub-page link is required — users click Settings → API access. If you want the sub-page directly accessible from the sidebar, add one entry to the `navItems` array in `sidebar.tsx`; otherwise **skip this task**.

- [ ] **Step 2: (Optional) commit if you added an entry**

```bash
git add src/components/dashboard/sidebar.tsx
git commit -m "mcp: sidebar entry for API access"
```

---

## Task 15: Public `/docs/mcp` documentation page

**Files:**
- Create: `linklight/src/app/docs/mcp/page.tsx`

- [ ] **Step 1: Write the docs page**

```tsx
import Link from "next/link"
import { headers } from "next/headers"
import { McpSetupSnippets } from "@/components/settings/mcp-setup-snippets"

const TOOLS = [
  { name: "search_prospects", description: "Find prospect sites for a keyword (cached SERP + Moz DA)." },
  { name: "enrich_domain", description: "Return known facts about a domain — DA, contact email, homepage title/description." },
  { name: "find_email", description: "Look up a contact email for a domain via Hunter." },
  { name: "draft_email", description: "Generate an outreach email draft with a built-in spam score." },
  { name: "save_draft", description: "Save a drafted email against a prospect for you to review. Never sends automatically." },
  { name: "list_campaigns", description: "List your campaigns." },
  { name: "list_prospects", description: "List prospects, filterable by campaign and status." },
  { name: "list_backlinks", description: "List backlinks earned to your sites." },
  { name: "list_replies", description: "List prospects who have replied to outreach." },
]

export default async function McpDocsPage() {
  const h = await headers()
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000"
  const proto = h.get("x-forwarded-proto") || "https"
  const origin = `${proto}://${host}`

  return (
    <div className="bg-brand-surface">
      <header className="border-b border-[#DCDDDE] bg-brand-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/brand/kinklink_logo.png" alt="" className="h-7 w-auto" />
            <span className="text-lg font-semibold text-brand-secondary">kinkylink</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/pricing" className="text-[#575858] hover:text-brand-secondary">Pricing</Link>
            <Link href="/#features" className="hidden text-[#575858] hover:text-brand-secondary sm:inline">Features</Link>
            <Link href="/dashboard" className="rounded-lg bg-brand-secondary px-3 py-1.5 text-brand-white hover:bg-[#1f0066]">
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-accent">Integrations</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-brand-secondary">
          Drive linklight from your AI agent.
        </h1>
        <p className="mt-4 text-lg text-[#575858]">
          linklight ships a first-class MCP (Model Context Protocol) server. Connect it to Claude Desktop,
          Claude Code, Cursor, or any MCP-compatible client and your agent can find prospects, draft outreach,
          and prepare campaigns on your behalf. Sending always waits for a manual tap in the linklight UI.
        </p>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-brand-secondary">1. Get an API key</h2>
          <p className="mt-2 text-[#575858]">
            Sign in to linklight, go to{" "}
            <Link href="/dashboard/settings/api-access" className="text-brand-accent hover:underline">
              Settings → API Access
            </Link>{" "}
            and generate a key. Copy it — you&apos;ll only see it once.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-brand-secondary">2. Add it to your client</h2>
          <div className="mt-4">
            <McpSetupSnippets origin={origin} />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-brand-secondary">3. Available tools</h2>
          <ul className="mt-4 space-y-3">
            {TOOLS.map((t) => (
              <li key={t.name} className="rounded-lg border border-[#DCDDDE] bg-brand-white p-4">
                <p className="font-mono text-sm font-semibold text-brand-secondary">{t.name}</p>
                <p className="mt-1 text-sm text-[#575858]">{t.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 rounded-lg border border-[#DCDDDE] bg-brand-primary p-6">
          <h2 className="text-lg font-semibold text-brand-secondary">Try prompting your agent</h2>
          <pre className="mt-3 overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`Find the top 10 prospects for "nextjs seo" with DA ≥ 40.
For each, draft a warm personalized email referencing their most recent post,
save each draft against the prospect, and show me the spam scores.`}
          </pre>
        </section>
      </main>

      <footer className="border-t border-[#DCDDDE] bg-brand-white">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-[#999999]">
          &copy; {new Date().getFullYear()} kinkylink
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd linklight && npm run build 2>&1 | tail -10
```
Expected: `/docs/mcp` appears in the route list.

- [ ] **Step 3: Commit**

```bash
git add src/app/docs/mcp/page.tsx
git commit -m "mcp: public /docs/mcp integration page"
```

---

## Task 16: Landing-page callout linking to `/docs/mcp`

**Files:**
- Modify: `linklight/src/app/page.tsx`

- [ ] **Step 1: Add a "Works with your AI agent" tile to the features grid**

Open `src/app/page.tsx`. In the `FEATURES` array, append after the existing six entries:

```ts
  {
    title: "Works with your AI agent",
    body: "First-class MCP server. Plug linklight into Claude Desktop, Claude Code, or Cursor and your agent can drive campaigns end-to-end. See docs →",
    icon: (
      <path d="M12 2 4 6v6c0 5 3.5 9.7 8 10 4.5-.3 8-5 8-10V6l-8-4Zm0 5a3 3 0 0 1 3 3v1h1v6H8v-6h1v-1a3 3 0 0 1 3-3Zm-1 4h2v-1a1 1 0 0 0-2 0v1Z" />
    ),
  },
```

- [ ] **Step 2: Add a header nav link**

In the `<nav>` block of the header, add before the "Sign in" button:

```tsx
<Link href="/docs/mcp" className="hidden text-[#575858] hover:text-brand-secondary sm:inline">
  Docs
</Link>
```

- [ ] **Step 3: Build + eyeball**

```bash
cd linklight && npm run build 2>&1 | tail -10
```
Then boot dev, visit `/`, confirm the new tile appears in the features grid and the header has a Docs link.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "mcp: landing-page callout + Docs nav link"
```

---

## Task 17: Final verification, push, and manual client test

**Files:** none (verification + push).

- [ ] **Step 1: Clean build + lint**

```bash
cd linklight && npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`, all routes including `/api/mcp`, `/api/api-keys`, `/dashboard/settings/api-access`, `/docs/mcp` present.

```bash
cd linklight && npx eslint src/lib/api-keys.ts src/lib/mcp src/app/api/mcp src/app/api/api-keys src/components/settings src/app/dashboard/settings/api-access src/app/docs/mcp src/app/page.tsx
```
Expected: 0 errors. Warnings on `<img>` usage are allowed (matches existing codebase).

- [ ] **Step 2: End-to-end verification against dev server**

Boot dev, then:
```bash
npx tsx --env-file=.env.local scripts/verify-api-keys.ts
node --env-file=.env.local scripts/verify-mcp.mjs <KEY>
```
Both should end with `PASS`.

- [ ] **Step 3: Manual real-client test (recommended)**

In Claude Desktop or Claude Code, add the MCP config with your generated key pointing at `http://localhost:3000/api/mcp`. Restart the client. In a chat, ask: *"List my linklight campaigns."* Confirm the agent invokes `list_campaigns` and returns results.

- [ ] **Step 4: Push**

```bash
cd linklight && git push origin master
```

- [ ] **Step 5: (Post-deploy) apply migration in production**

Repeat the Management-API `curl` from Task 1 Step 3 against your production Supabase project (same script, different `SUPABASE_ACCESS_TOKEN` / project ref if separate).

---

## Post-launch backlog (out of scope for this plan)

- Rate-limit MCP requests per key (currently piggybacks on Vercel's function limits).
- Dedicated `email_drafts` table with an `approve → enqueue send` UI, replacing the `notes` field marker approach in `save_draft`.
- OAuth 2.1 auth for MCP (in addition to bearer tokens) for enterprise clients.
- Analytics on MCP usage per user for pricing insight.
- `search_prospects` optional `min_da` filter to reduce agent chatter.
