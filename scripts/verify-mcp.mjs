// scripts/verify-mcp.mjs
// Hits the live dev server. Usage:
//   npm run dev                  # in another terminal
//   node scripts/verify-mcp.mjs <API_KEY>
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  if (res.status === 202) return null
  return res.json()
}

const init = await call("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "verify", version: "0" },
})
console.log("initialize:", JSON.stringify(init.result, null, 2))
if (init.result?.serverInfo?.name !== "linklight") throw new Error("bad serverInfo")

const list = await call("tools/list", {})
console.log("tools/list count:", list.result.tools.length)

const bad = await call("does/not/exist", {})
if (bad.error?.code !== -32601) throw new Error(`expected -32601, got ${bad.error?.code}`)
console.log("unknown method: OK")

console.log("\nMCP PASS")
