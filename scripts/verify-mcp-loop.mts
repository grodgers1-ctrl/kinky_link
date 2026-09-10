// scripts/verify-mcp-loop.mts
// Phase 2 acceptance: prove the outreach loop closes end-to-end via MCP tools
// with no UI steps, dedupe works, budgets record, and ownership is enforced.
// Uses the synthetic test user — zero paid API calls (no Tavily/OpenAI/Hunter).
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-mcp-loop.mts
import { supabaseAdmin } from "@/lib/db"
import "@/lib/mcp/handlers"
import { findTool } from "@/lib/mcp/tools"
import { checkBudget, recordUsage } from "@/lib/usage"

const TEST_USER = "00000000-0000-4000-8000-000000000000"
let failures = 0

function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!cond) failures++
}

async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  const tool = findTool(name)
  if (!tool) throw new Error(`tool not registered: ${name}`)
  const result = await tool.handler(TEST_USER, args)
  const text = result.content?.[0]?.type === "text" ? result.content[0].text : "{}"
  if (result.isError) return { __error: text }
  try {
    return JSON.parse(text)
  } catch {
    return { __raw: text }
  }
}

// --- Setup: synthetic user + throwaway campaign ------------------------------
await supabaseAdmin
  .from("users")
  .upsert(
    { id: TEST_USER, email: "mcp-test@linklight.local", name: "MCP Test (synthetic)" },
    { onConflict: "id" },
  )

const { data: campaign, error: campaignErr } = await supabaseAdmin
  .from("campaigns")
  .insert({ user_id: TEST_USER, name: `mcp-loop-test ${Date.now()}`, status: "active" })
  .select("id")
  .single()
if (campaignErr || !campaign) {
  console.error("setup failed: could not create test campaign:", campaignErr?.message)
  process.exit(1)
}
const campaignId = campaign.id as string
console.log(`test campaign: ${campaignId}\n`)

try {
  // --- 1. create_prospect --------------------------------------------------
  const p1 = await callTool("create_prospect", {
    campaign_id: campaignId,
    url: "https://example-blog.com/best-seo-tools",
    title: "Best SEO Tools",
  })
  check("create_prospect creates", !p1.__error && p1.prospect?.id && p1.deduped === false,
    p1.__error || `id=${p1.prospect?.id} status=${p1.prospect?.status}`)

  // --- 2. dedupe on same domain, different page ----------------------------
  const p2 = await callTool("create_prospect", {
    campaign_id: campaignId,
    url: "https://www.example-blog.com/another-post",
  })
  check("create_prospect dedupes by domain", p2.deduped === true && p2.prospect?.id === p1.prospect?.id,
    `deduped=${p2.deduped} sameId=${p2.prospect?.id === p1.prospect?.id}`)

  // --- 3. ownership enforcement ---------------------------------------------
  const p3 = await callTool("create_prospect", {
    campaign_id: "00000000-0000-0000-0000-000000000000",
    url: "https://evil.example.com/x",
  })
  check("create_prospect rejects foreign campaign", p3.__error === "Campaign not found", p3.__error)

  // --- 4. bulk_create_prospects ---------------------------------------------
  const bulk = await callTool("bulk_create_prospects", {
    campaign_id: campaignId,
    prospects: [
      { url: "https://new-site.org/resources", title: "Resources" },
      { url: "https://example-blog.com/third-post" }, // dup of #1
      { url: "not-a-url" },
    ],
  })
  check("bulk: 1 created / 1 deduped / 1 failed",
    bulk.created === 1 && bulk.deduped === 1 && bulk.failed === 1,
    `created=${bulk.created} deduped=${bulk.deduped} failed=${bulk.failed}`)

  // --- 5. save_draft on the created prospect --------------------------------
  const draft = await callTool("save_draft", {
    prospect_id: p1.prospect.id,
    subject: "Quick question about your SEO tools post",
    body_html: "<p>Hi — loved the roundup...</p>",
  })
  check("save_draft stores draft on prospect", draft.ok === true, draft.__error)

  // --- 6. list_prospects shows the campaign contents -------------------------
  const list = await callTool("list_prospects", { campaign_id: campaignId })
  check("list_prospects returns 2 prospects",
    Array.isArray(list) && list.length === 2,
    `count=${Array.isArray(list) ? list.length : "?"}`)

  // --- 7. budget accounting ---------------------------------------------------
  const before = await checkBudget(TEST_USER, "find_email")
  await recordUsage(TEST_USER, "find_email")
  const after = await checkBudget(TEST_USER, "find_email")
  check("budget records usage and decrements remaining",
    before.remaining != null && after.remaining === before.remaining - 1,
    `remaining ${before.remaining} → ${after.remaining}`)
} finally {
  // --- Cleanup (prospects first: campaign delete is SET NULL, not cascade) ---
  await supabaseAdmin.from("prospects").delete().eq("campaign_id", campaignId)
  await supabaseAdmin.from("campaigns").delete().eq("id", campaignId)
  console.log("\ncleaned up test campaign + prospects")
}

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`)
  process.exit(1)
}
console.log("\nMCP LOOP PASS")
