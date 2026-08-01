// scripts/mcp-stdio-bridge.mjs
// MCP over stdio <-> HTTP bridge. Reads newline-delimited JSON-RPC from stdin,
// forwards each request to the local Next.js /api/mcp endpoint, writes the
// response back on stdout. Used by glama-next-wrapper.mjs.
import readline from "node:readline"

const PORT = process.env.PORT || "3000"
const ENDPOINT = `http://127.0.0.1:${PORT}/api/mcp`
const TOKEN = process.env.LINKLIGHT_API_KEY || process.env.MCP_TEST_KEY || ""

async function forward(line) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: line,
  })
  const text = await res.text()
  process.stdout.write(`${text}\n`)
}

const rl = readline.createInterface({ input: process.stdin })
rl.on("line", (line) => {
  if (!line.trim()) return
  forward(line).catch((e) => {
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(e?.message || e) } })}\n`,
    )
  })
})
rl.on("close", () => process.exit(0))
