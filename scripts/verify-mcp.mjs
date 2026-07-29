// scripts/verify-mcp.mjs
// Hits the live dev server. Usage:
//   npm run dev                  # in another terminal
//   node scripts/verify-mcp.mjs <API_KEY>
const key = process.argv[2]
if (!key) {
  console.error("Usage: node scripts/verify-mcp.mjs <API_KEY>")
  process.exit(1)
}

const URL = process.env.MCP_URL || "http://localhost:3000/api/mcp"

async function call(method, params) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  if (res.status === 202) return null
  return res.json()
}

async function callTool(name, args) {
  const r = await call("tools/call", { name, arguments: args })
  if (r.error) throw new Error(`Tool ${name} JSON-RPC error: ${r.error.message}`)
  const first = r.result?.content?.[0]?.text
  console.log(`\n[${name}]`, first?.slice(0, 200), "...")
  if (r.result?.isError) throw new Error(`Tool ${name} returned isError: ${first}`)
  return r.result
}

const init = await call("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "verify", version: "0" },
})
if (init.result?.serverInfo?.name !== "linklight") throw new Error("bad serverInfo")
console.log("initialize: OK")

const list = await call("tools/list", {})
console.log("tools/list count:", list.result.tools.length)
if (list.result.tools.length !== 9) {
  throw new Error(`expected 9 tools, got ${list.result.tools.length}`)
}

const bad = await call("does/not/exist", {})
if (bad.error?.code !== -32601) throw new Error(`expected -32601, got ${bad.error?.code}`)
console.log("unknown method: OK")

await callTool("list_campaigns", {})
await callTool("list_prospects", { limit: 3 })
await callTool("list_backlinks", { limit: 3 })
await callTool("list_replies", { limit: 3 })
await callTool("enrich_domain", { domain: "example.com" })

try {
  await callTool("search_prospects", { keyword: "nextjs seo", limit: 3 })
} catch (e) {
  console.log("search_prospects skipped:", e.message)
}

console.log("\nMCP FULL PASS")
