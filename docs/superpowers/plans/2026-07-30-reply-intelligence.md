# Reply Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a prospect who replied into an actionable next step. Add an MCP tool `classify_reply(prospect_id)` that reads the reply, classifies it as `interested | needs_info | declined | out_of_office | other`, extracts 1-3 key points the sender made, and returns a suggested follow-up draft. Under the hood: the Gmail webhook that already ingests replies grows one line to also store the plain-text body in `email_events.metadata.body_text`; a new `src/lib/reply-classifier.ts` runs a single OpenAI call to structure the reply; the MCP handler reads the latest reply for a prospect, classifies once (cached on the event row), and returns everything an agent needs to write the next email.

**Architecture:** No schema migration — reply bodies land in the existing `email_events.metadata` JSONB column. Webhook enhancement is 3 lines: fetch the message in `format: "full"` instead of `"metadata"`, walk the payload for the text/plain part, base64-decode, store in `metadata.body_text`. Classifier is a thin `generateEmailDraft`-style wrapper over `gpt-4o-mini` with a JSON-schema response format. MCP tool caches the classification back into `metadata.classification` so repeated calls are free. Suggested-response draft reuses `generateEmailDraft` from Tier 3 with the classification driving `tone` and `campaign_type` selection.

**Tech Stack:** Same as prior plans — Next.js 16, Supabase (`supabaseAdmin`), TypeScript strict, no test framework. Verification via `npm run build` + `npx eslint` on touched files + one `verify-reply-classifier.mts` smoke script + curl-against-MCP. Reuses `OPENAI_API_KEY` (already prod), existing `generateEmailDraft`, existing Gmail OAuth credentials.

**Conventions to preserve:**
- No `any` — narrow interfaces for the Gmail message payload
- Classifier never throws — returns null on any failure so the MCP tool degrades to "raw reply body only"
- Commit style: `webhook:`, `classifier:`, `mcp:`

**Scope split — what's in and what's out:**

**In (this plan, ~1-2 hours):**
- Reply body ingestion at webhook time
- Backfill script for existing replies (fetches body for any `event_type=reply` row missing `metadata.body_text`)
- AI classifier lib
- MCP `classify_reply` tool with caching
- Follow-up draft suggestion built into the tool response

**Out (deferred to post-launch backlog):**
- Dashboard UI badge showing classification on `/dashboard/prospects?status=replied`
- Bulk `classify_all_pending_replies` MCP tool
- Auto-classify on webhook ingest (right now classify happens on first MCP call — fine for launch, saves OpenAI cost until the agent asks)
- Sentiment scoring beyond the 5 categories

---

## File Structure

```
linklight/
├── src/app/api/webhooks/gmail/route.ts    [Task 1 — fetch body, store in metadata.body_text]
├── src/lib/
│   ├── reply-classifier.ts                [Task 2 — NEW OpenAI classifier]
│   └── mcp/handlers.ts                    [Task 3 — NEW classify_reply tool]
└── scripts/
    ├── backfill-reply-bodies.mts          [Task 1 — pull bodies for existing reply events]
    └── verify-reply-classifier.mts        [Task 2 — smoke]
```

**File responsibilities:**
- `webhooks/gmail/route.ts` — extract the payload, walk MIME parts looking for `text/plain` (fall back to `text/html` with tag strip), base64-decode, truncate to 8000 chars, store as `metadata.body_text`. Otherwise identical to current behavior.
- `backfill-reply-bodies.mts` — one-off: find every `email_events` row where `event_type=reply` AND `metadata->>'body_text' IS NULL`, load the row's associated user's Google account credentials, refetch each Gmail message in `full` format, write bodies. Idempotent — safe to re-run.
- `reply-classifier.ts` — one exported function `classifyReply(bodyText, context?): Promise<ReplyClassification | null>`. `ReplyClassification` = `{ classification: "interested"|"needs_info"|"declined"|"out_of_office"|"other", confidence: "high"|"medium"|"low", keyPoints: string[], summary: string }`. Handles OpenAI failure by returning null.
- `mcp/handlers.ts` — new `registerTool` for `classify_reply`. Takes `prospect_id`, reads the latest `email_events` row where `prospect_id = ? AND event_type = 'reply'`. If `metadata.classification` already set, returns it. Otherwise: reads `metadata.body_text`, runs `classifyReply`, writes result back to `metadata.classification`, calls `generateEmailDraft` with classification-appropriate defaults, returns everything.

---

## Task 1: Reply body ingestion + backfill

**Files:**
- Modify: `linklight/src/app/api/webhooks/gmail/route.ts`
- Create: `linklight/scripts/backfill-reply-bodies.mts`

- [ ] **Step 1: Fetch full message in webhook + extract text**

Open `src/app/api/webhooks/gmail/route.ts`. The current webhook calls `gmail.users.messages.get` with `format: "metadata"` — we need the body. Two changes are needed.

First, add a helper at the top of the file, just after the imports (before `export async function POST`):

```ts
interface GmailPayloadPart {
  mimeType?: string
  filename?: string
  body?: { data?: string; size?: number }
  parts?: GmailPayloadPart[]
}

function stripTags(s: string): string {
  return s.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function decodeGmailBody(data: string): string {
  // Gmail returns URL-safe base64 without padding
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "===".slice((normalized.length + 3) % 4)
  return Buffer.from(padded, "base64").toString("utf-8")
}

function extractPlainText(part: GmailPayloadPart | undefined): string | null {
  if (!part) return null
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeGmailBody(part.body.data)
  }
  if (part.parts) {
    for (const child of part.parts) {
      const found = extractPlainText(child)
      if (found) return found
    }
    // No text/plain part found — fall back to text/html with tags stripped
    for (const child of part.parts) {
      if (child.mimeType === "text/html" && child.body?.data) {
        return stripTags(decodeGmailBody(child.body.data))
      }
    }
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return stripTags(decodeGmailBody(part.body.data))
  }
  return null
}
```

Second, replace the `messageDetail = await gmail.users.messages.get(...)` call (currently around lines 46-51) with:

```ts
        const messageDetail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        })
```

Third, extract the body just after that (before the `headers = ...` line). Add:

```ts
        const bodyText = extractPlainText(messageDetail.data.payload as GmailPayloadPart)
        const bodyTruncated = bodyText ? bodyText.slice(0, 8000) : null
```

Fourth, update the `metadata` field in the `.insert(...)` call (currently around line 80) to include the body:

```ts
          metadata: {
            threadId: messageDetail.data.threadId,
            inReplyTo,
            body_text: bodyTruncated,
          },
```

**Notes:**
- `format: "full"` is a bigger response but Gmail counts it the same against your quota as `metadata`. No cost change.
- `text/plain` is preferred over `text/html` — most well-formed emails send both. Fall through to HTML with tag strip only if no plain part exists.
- 8000 char cap keeps the JSONB row lean and comfortably fits any reasonable reply (that's ~1500 words).

- [ ] **Step 2: Write the backfill script**

Create `linklight/scripts/backfill-reply-bodies.mts`:

```ts
// scripts/backfill-reply-bodies.mts
// One-off: for every email_events row where event_type='reply' and no body_text
// is stored, refetch the message from Gmail and populate metadata.body_text.
// Idempotent. Skips rows whose owning user has revoked Google access.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/backfill-reply-bodies.mts
import { supabaseAdmin } from "@/lib/db"
import { google } from "googleapis"

interface GmailPayloadPart {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: GmailPayloadPart[]
}

function decodeGmailBody(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "===".slice((normalized.length + 3) % 4)
  return Buffer.from(padded, "base64").toString("utf-8")
}

function stripTags(s: string): string {
  return s.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractPlainText(part: GmailPayloadPart | undefined): string | null {
  if (!part) return null
  if (part.mimeType === "text/plain" && part.body?.data) return decodeGmailBody(part.body.data)
  if (part.parts) {
    for (const c of part.parts) {
      const f = extractPlainText(c)
      if (f) return f
    }
    for (const c of part.parts) {
      if (c.mimeType === "text/html" && c.body?.data) return stripTags(decodeGmailBody(c.body.data))
    }
  }
  if (part.mimeType === "text/html" && part.body?.data) return stripTags(decodeGmailBody(part.body.data))
  return null
}

const { data: rows } = await supabaseAdmin
  .from("email_events")
  .select("id, user_id, gmail_message_id, metadata")
  .eq("event_type", "reply")
  .not("gmail_message_id", "is", null)

const targets = (rows || []).filter((r) => !r.metadata?.body_text)
console.log(`Found ${rows?.length || 0} reply events, ${targets.length} need backfill.`)

let ok = 0
let skipped = 0

for (const row of targets) {
  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("access_token, refresh_token")
    .eq("user_id", row.user_id)
    .eq("provider", "google")
    .single()

  if (!account?.access_token) {
    skipped++
    continue
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.AUTH_GOOGLE_ID,
      process.env.AUTH_GOOGLE_SECRET,
    )
    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    })
    const gmail = google.gmail({ version: "v1", auth: oauth2Client })
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: row.gmail_message_id!,
      format: "full",
    })

    const bodyText = extractPlainText(msg.data.payload as GmailPayloadPart)
    if (!bodyText) {
      skipped++
      continue
    }

    await supabaseAdmin
      .from("email_events")
      .update({ metadata: { ...row.metadata, body_text: bodyText.slice(0, 8000) } })
      .eq("id", row.id)
    ok++
  } catch (e) {
    console.error(`  skip ${row.id}: ${(e as Error).message}`)
    skipped++
  }
}

console.log(`\nBackfilled: ${ok} — skipped: ${skipped}`)
console.log("BACKFILL DONE")
```

- [ ] **Step 3: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/app/api/webhooks/gmail/route.ts scripts/backfill-reply-bodies.mts
```
Expected: clean build; lint exits 0.

- [ ] **Step 4: Run backfill (safe — read-only for user data, only writes metadata)**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/backfill-reply-bodies.mts
```
Expected: `BACKFILL DONE` with a non-zero `Backfilled` count IF there are existing reply events. If the DB has no reply events yet, count will be 0 and script exits cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/gmail/route.ts scripts/backfill-reply-bodies.mts
git commit -m "webhook: capture reply body text into email_events.metadata + backfill script"
```

---

## Task 2: Reply classifier

**Files:**
- Create: `linklight/src/lib/reply-classifier.ts`
- Create: `linklight/scripts/verify-reply-classifier.mts`

- [ ] **Step 1: Write the classifier**

Create `src/lib/reply-classifier.ts`:

```ts
import OpenAI from "openai"

let _openai: OpenAI | null = null
function getOpenai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured")
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export type ReplyClass =
  | "interested"
  | "needs_info"
  | "declined"
  | "out_of_office"
  | "other"

export interface ReplyClassification {
  classification: ReplyClass
  confidence: "high" | "medium" | "low"
  keyPoints: string[]
  summary: string
  suggestedNextStep: "send_followup" | "wait" | "close_won" | "close_lost" | "human_review"
}

const SYSTEM = `You classify outreach email replies for a link-building tool. Reply with a strict JSON object matching the schema. Do not include commentary.`

const USER_PROMPT_TEMPLATE = (body: string, sentSubject: string | null) => `Classify this reply.

The email we originally sent had subject: "${sentSubject || "(unknown)"}"

Their reply body:
"""
${body}
"""

Return JSON with this exact shape:
{
  "classification": "interested" | "needs_info" | "declined" | "out_of_office" | "other",
  "confidence": "high" | "medium" | "low",
  "keyPoints": ["1-3 short bullet points of what they actually said"],
  "summary": "one sentence, under 25 words",
  "suggestedNextStep": "send_followup" | "wait" | "close_won" | "close_lost" | "human_review"
}

Guidance:
- "interested" = they want to engage, ask a question, or agree in principle. Suggest send_followup or close_won.
- "needs_info" = they're on the fence and asking for details, pricing, examples. Suggest send_followup.
- "declined" = polite or blunt no. Suggest close_lost.
- "out_of_office" = auto-reply. Suggest wait.
- "other" = spam, wrong recipient, unclear. Suggest human_review.
- keyPoints must quote or paraphrase specific claims from THEIR text — do not invent.`

export async function classifyReply(
  bodyText: string,
  sentSubject: string | null = null,
): Promise<ReplyClassification | null> {
  if (!bodyText || bodyText.trim().length < 5) return null

  try {
    const response = await getOpenai().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: USER_PROMPT_TEMPLATE(bodyText.slice(0, 4000), sentSubject) },
      ],
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
    })

    const content = response.choices[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content) as Partial<ReplyClassification>
    if (
      !parsed.classification ||
      !["interested", "needs_info", "declined", "out_of_office", "other"].includes(
        parsed.classification,
      )
    ) {
      return null
    }

    return {
      classification: parsed.classification as ReplyClass,
      confidence: (parsed.confidence || "medium") as "high" | "medium" | "low",
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 3) : [],
      summary: parsed.summary || "",
      suggestedNextStep:
        parsed.suggestedNextStep && ["send_followup", "wait", "close_won", "close_lost", "human_review"].includes(parsed.suggestedNextStep)
          ? (parsed.suggestedNextStep as ReplyClassification["suggestedNextStep"])
          : "human_review",
    }
  } catch (error) {
    console.error("classifyReply error:", error)
    return null
  }
}
```

- [ ] **Step 2: Write the smoke script**

Create `linklight/scripts/verify-reply-classifier.mts`:

```ts
// scripts/verify-reply-classifier.mts
// Runs the classifier against four realistic reply shapes so it's obvious the
// mapping to classes matches expectations.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-reply-classifier.mts
import { classifyReply } from "@/lib/reply-classifier"

const cases: { name: string; body: string; expected: string }[] = [
  {
    name: "interested",
    body: "Thanks for reaching out! I'd love to see the article you mentioned. Can you send me a link?",
    expected: "interested",
  },
  {
    name: "needs_info",
    body: "Interesting pitch. What kind of traffic does your site get? And what's the anchor text you'd propose?",
    expected: "needs_info",
  },
  {
    name: "declined",
    body: "Thanks but we're not accepting external links right now. Best of luck with your project.",
    expected: "declined",
  },
  {
    name: "out_of_office",
    body: "I'm out of the office until Monday, October 14th. I'll respond to your email when I return.",
    expected: "out_of_office",
  },
]

let ok = 0
for (const c of cases) {
  const res = await classifyReply(c.body, "Your recent post on link building")
  if (!res) {
    console.log(`  ${c.name.padEnd(15)} FAIL (null)`)
    continue
  }
  const match = res.classification === c.expected ? "OK  " : "MISS"
  const status = res.classification === c.expected ? (ok++, "OK") : "MISS"
  console.log(`  ${c.name.padEnd(15)} ${status} → got ${res.classification} (${res.confidence}) — ${res.summary}`)
  if (status !== "OK") {
    console.log(`    key points: ${JSON.stringify(res.keyPoints)}`)
  }
}

console.log(`\nCLASSIFIER: ${ok}/${cases.length} matched expected class`)
if (ok < cases.length - 1) {
  console.error("FAIL: too many miscategorizations")
  process.exit(1)
}
console.log("CLASSIFIER PASS")
```

**Notes:**
- Tolerates 1 miss out of 4 (small LLMs occasionally slip on "declined" vs "other" for very polite refusals). If it consistently misses more, the system prompt needs tightening — flag in commit.

- [ ] **Step 3: Run the smoke**

```bash
cd linklight && npx tsx --env-file=.env.local scripts/verify-reply-classifier.mts
```
Expected: `CLASSIFIER PASS` with at least 3/4 matches.

- [ ] **Step 4: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/reply-classifier.ts
```
Expected: clean build; lint exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reply-classifier.ts scripts/verify-reply-classifier.mts
git commit -m "classifier: classifyReply — 5-class labels + key points + next step"
```

---

## Task 3: MCP `classify_reply` tool

**Files:**
- Modify: `linklight/src/lib/mcp/handlers.ts`
- Modify: `linklight/src/app/docs/mcp/page.tsx`

- [ ] **Step 1: Add imports**

Open `src/lib/mcp/handlers.ts`. Add near the other lib imports at the top:

```ts
import { classifyReply, type ReplyClassification } from "@/lib/reply-classifier"
```

- [ ] **Step 2: Append the `classify_reply` tool**

At the end of `src/lib/mcp/handlers.ts` (after the last `registerTool({...})` block), append:

```ts
registerTool({
  name: "classify_reply",
  description:
    "Read the latest reply from a prospect, classify it (interested / needs_info / declined / out_of_office / other), extract 1-3 key points from what they said, and generate a suggested follow-up draft appropriate to the class. Cached — subsequent calls for the same reply return the stored classification without re-running the LLM.",
  inputSchema: {
    type: "object",
    properties: {
      prospect_id: { type: "string", description: "UUID of the prospect whose reply to classify" },
      force_reclassify: {
        type: "boolean",
        description: "If true, ignore cached classification and re-run the LLM.",
        default: false,
      },
    },
    required: ["prospect_id"],
  },
  handler: async (userId, args) => {
    const prospectId = String(args.prospect_id || "").trim()
    if (!prospectId) return errorResult("prospect_id is required")

    // Find the most recent reply event for this prospect belonging to the caller
    const { data: replyRow } = await supabaseAdmin
      .from("email_events")
      .select("id, prospect_id, subject, metadata, created_at")
      .eq("user_id", userId)
      .eq("prospect_id", prospectId)
      .eq("event_type", "reply")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!replyRow) {
      return jsonResult({
        prospect_id: prospectId,
        error: "no_reply_found",
        message: "No reply event on record for this prospect.",
      })
    }

    const metadata = (replyRow.metadata as Record<string, unknown>) || {}
    const bodyText = typeof metadata.body_text === "string" ? metadata.body_text : ""

    if (!bodyText) {
      return jsonResult({
        prospect_id: prospectId,
        reply_event_id: replyRow.id,
        error: "no_body_text",
        message:
          "Reply is recorded but body_text has not been ingested for this event. Run scripts/backfill-reply-bodies.mts on the server, or wait for the next reply after the webhook fix has been deployed.",
      })
    }

    // Return cached classification unless force_reclassify is true
    const cached = metadata.classification as ReplyClassification | undefined
    let classification = cached
    if (!classification || args.force_reclassify) {
      // Look up the original outbound event's subject so the classifier has thread context
      let sentSubject: string | null = null
      const inReplyTo = typeof metadata.inReplyTo === "string" ? metadata.inReplyTo : null
      if (inReplyTo) {
        const { data: original } = await supabaseAdmin
          .from("email_events")
          .select("subject")
          .eq("user_id", userId)
          .eq("event_type", "sent")
          .or(`gmail_message_id.eq.${inReplyTo},message_id.eq.${inReplyTo}`)
          .maybeSingle()
        sentSubject = original?.subject || null
      }

      const result = await classifyReply(bodyText, sentSubject)
      if (!result) {
        return jsonResult({
          prospect_id: prospectId,
          reply_event_id: replyRow.id,
          error: "classifier_failed",
          message: "The LLM classifier returned no result. Try force_reclassify: true later.",
        })
      }
      classification = result

      // Cache back into the event row
      await supabaseAdmin
        .from("email_events")
        .update({ metadata: { ...metadata, classification } })
        .eq("id", replyRow.id)
    }

    // Build a suggested follow-up draft tuned to the classification
    let suggestedDraft: { subject: string; bodyText: string; bodyHtml: string } | null = null
    if (
      classification.suggestedNextStep === "send_followup" ||
      classification.suggestedNextStep === "close_won"
    ) {
      const tone =
        classification.classification === "interested" ? "friendly" : "professional"
      const followupTopic =
        classification.classification === "needs_info"
          ? `answer their questions: ${classification.keyPoints.join("; ")}`
          : `follow up on their reply: ${classification.summary}`

      const draft = await generateEmailDraft({
        topic: followupTopic,
        recentSnippet: bodyText.slice(0, 500),
        tone,
        campaignType: "outreach",
      })
      suggestedDraft = draft
    }

    return jsonResult({
      prospect_id: prospectId,
      reply_event_id: replyRow.id,
      classification: classification.classification,
      confidence: classification.confidence,
      key_points: classification.keyPoints,
      summary: classification.summary,
      suggested_next_step: classification.suggestedNextStep,
      cached: !!cached && !args.force_reclassify,
      suggested_draft: suggestedDraft,
    })
  },
})
```

**Notes:**
- The tool is idempotent — first call runs the LLM and caches; subsequent calls return `cached: true` and the same result at zero cost.
- The suggested draft is only generated for `send_followup` and `close_won` next-steps — no point drafting a reply to an out-of-office autoresponder.
- The suggested draft reuses `generateEmailDraft` from Tier 3 (which now takes `recentSnippet`) — the classifier's summary of the reply becomes the "topic," and the actual reply text becomes the recent snippet the drafter references.

- [ ] **Step 3: Extend the `/docs/mcp` TOOLS list**

Open `src/app/docs/mcp/page.tsx`. Find the `TOOLS` const array. Append this entry:

```ts
  { name: "classify_reply", description: "Read the latest reply from a prospect, classify it (interested / needs_info / declined / out_of_office / other), extract key points, and generate a suggested follow-up. Cached — free on repeat calls." },
```

- [ ] **Step 4: Build + lint**

```bash
cd linklight && npm run build 2>&1 | grep -E "✓ Compiled|error|Error" | head -3
cd linklight && npx eslint src/lib/mcp/handlers.ts src/app/docs/mcp/page.tsx
```
Expected: clean build; lint exits 0.

- [ ] **Step 5: Local smoke via MCP**

Boot dev, then:
```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts 2>&1 | tail -1)

# Tool should now be listed
curl -sS -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); names=[t['name'] for t in d['result']['tools']]; print('tools:', len(names)); print('has classify_reply:', 'classify_reply' in names)"

# Call it against a real prospect (find one with a reply first)
PROSPECT_ID=$(cd linklight && npx tsx --env-file=.env.local -e 'import { supabaseAdmin } from "@/lib/db"; const { data } = await supabaseAdmin.from("email_events").select("prospect_id").eq("event_type","reply").not("prospect_id","is",null).limit(1).maybeSingle(); console.log(data?.prospect_id || "")')

if [ -n "$PROSPECT_ID" ]; then
  curl -sS -X POST http://localhost:3000/api/mcp \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"classify_reply\",\"arguments\":{\"prospect_id\":\"$PROSPECT_ID\"}}}" \
    --max-time 90 \
    | python -c "import json,sys; d=json.load(sys.stdin); r=json.loads(d['result']['content'][0]['text']); print('classification:', r.get('classification')); print('confidence:', r.get('confidence')); print('summary:', r.get('summary')); print('next_step:', r.get('suggested_next_step')); print('cached:', r.get('cached'))"
else
  echo "No reply events in DB yet — skip live call, tool count check is enough."
fi
```
Expected: `tools: 15` (was 14), `has classify_reply: True`. If there's a reply on record, the classification block prints; otherwise the "No reply events" branch triggers and that's fine.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/handlers.ts src/app/docs/mcp/page.tsx
git commit -m "mcp: classify_reply — labels the reply + drafts a follow-up"
```

---

## Task 4: Final verify + push + prod smoke

**Files:** none.

- [ ] **Step 1: Clean sweep**

```bash
cd linklight && npm run build 2>&1 | tail -5
cd linklight && npx eslint \
  src/app/api/webhooks/gmail/route.ts \
  src/lib/reply-classifier.ts \
  src/lib/mcp/handlers.ts \
  src/app/docs/mcp/page.tsx \
  2>&1 | tail -5
```
Expected: clean build; 0 lint errors.

- [ ] **Step 2: Push**

```bash
cd linklight && git push origin master
```

- [ ] **Step 3: Wait for prod auto-deploy, then run backfill against prod DB**

Wait ~2 min for Vercel. Backfill uses the same `.env.local` credentials — it runs against the prod Supabase either way:

```bash
cd linklight && npx tsx --env-file=.env.local scripts/backfill-reply-bodies.mts
```
Expected: `BACKFILL DONE` — reports how many replies had their body filled in.

- [ ] **Step 4: Prod MCP smoke**

```bash
KEY=$(cd linklight && npx tsx --env-file=.env.local scripts/create-test-key.mts 2>&1 | tail -1)

curl -sS -X POST https://www.lightlinks.dev/api/mcp \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); names=[t['name'] for t in d['result']['tools']]; print('prod tools:', len(names)); print('has classify_reply:', 'classify_reply' in names)"
```
Expected: `prod tools: 15`, `has classify_reply: True`.

---

## Post-launch backlog

- **Auto-classify on webhook ingest.** Right now `classify_reply` lazily invokes the LLM on first call. Move the classifier call into the webhook so `email_events.metadata.classification` is populated at ingest time — the MCP tool then serves from cache 100% of the time. Trade-off: one OpenAI call per inbound reply whether or not the agent ever asks. Cost is minor at current scale but tips the equation once user count grows.
- **Dashboard classification badges.** On `/dashboard/prospects?status=replied`, show each row's classification as a colored chip (green=interested, yellow=needs_info, red=declined, grey=out_of_office/other) sourced from `email_events.metadata.classification`. Click-through opens the reply + suggested follow-up in a modal. Highest-leverage UI add — turns the current "here's a list of replies" page into a workflow.
- **`classify_all_pending_replies()` MCP tool.** Batch version — grab up to N unclassified replies and process them in parallel. Enables the classic agent prompt "classify everything that came in overnight and tell me what needs my attention today."
- **Reply notification on webhook.** When a reply is classified as `interested` or `close_won`, insert a `notifications` row (that infra exists from Tier 3) so the bell in the top nav lights up. Instant "someone replied YES" signal for humans.
- **Two-way threading.** Right now the suggested_draft is generated but never sent — the operator/agent has to manually paste it into a new email. Add a `send_followup(prospect_id, draft?)` MCP tool that either sends the AI's draft or a custom one via Gmail, respecting the "MCP never sends without human approval" boundary by requiring the draft to be pre-approved in the UI first.
- **Confidence-weighted routing.** When confidence is `low`, always suggest `human_review` — never `close_lost`. Prevents the classifier from prematurely killing a warm lead due to an ambiguous reply.
- **Multilingual.** Classifier is English-only right now. `gpt-4o-mini` handles other languages fine; add a `detected_language` field to the response and translate `summary` to English for the caller if the reply is in another language.
