// scripts/test-glama-bridge.mjs
// Simulates Glama's mcp-proxy: spawns `npx next start` (our shimmed wrapper),
// sends JSON-RPC over stdio, reads responses. Run from repo root.
import { spawn } from "node:child_process"
import readline from "node:readline"

const PORT = process.env.PORT || "3000"
const child = spawn("node", ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", PORT], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, MCP_TEST_KEY: "sk_ll_glama_test" },
})

const rl = readline.createInterface({ input: child.stdout })
const responses = []
rl.on("line", (line) => {
  responses.push(line)
  try {
    const msg = JSON.parse(line)
    if (msg.id === 2) {
      const tools = msg.result?.tools || []
      console.log(`initialize ok: protocol ${msg.result?.protocolVersion}`)
      console.log(`tools/list: ${tools.length} tools`)
      console.log(`has find_competitor_backlinks: ${tools.some((t) => t.name === "find_competitor_backlinks")}`)
      child.kill()
      process.exit(0)
    }
  } catch {
    // ignore non-JSON banner lines
  }
})

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "glama-test", version: "1" },
  },
}
const list = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }

child.stdout.on("data", () => {}) // keep stream flowing
setTimeout(() => {
  child.stdin.write(`${JSON.stringify(init)}\n`)
  setTimeout(() => child.stdin.write(`${JSON.stringify(list)}\n`), 3000)
}, 8000)

setTimeout(() => {
  console.error("TIMEOUT — no responses received")
  child.kill()
  process.exit(1)
}, 45000)

