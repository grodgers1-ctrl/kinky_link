// scripts/glama-next-wrapper.mjs
// Replaces `node_modules/next/dist/bin/next` in the Glama image so that
// `npx next start` (which Glama wraps with mcp-proxy in stdio mode) actually
// does the right thing:
//   1. starts the real Next.js HTTP server on :3000 in the background
//   2. runs the stdio<->HTTP MCP bridge on stdin/stdout
// The real Next CLI is preserved at node_modules/next/dist/bin/next.orig by
// scripts/patch-glama-bin.mjs and spawned from here.
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || "3000"
const REAL_BIN = path.join(__dirname, "..", "node_modules", "next", "dist", "bin", "next.orig")

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  return new Promise((resolve) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { method: "GET" })
        if (res.ok) return resolve(true)
      } catch {
        // not up yet
      }
      if (Date.now() - start > timeoutMs) return resolve(false)
      setTimeout(tick, 300)
    }
    tick()
  })
}

const server = spawn(process.execPath, [REAL_BIN, "start", "-H", "0.0.0.0", "-p", PORT], {
  stdio: ["ignore", "inherit", "inherit"],
})

server.on("exit", (code) => {
  process.exit(code ?? 0)
})

const ready = await waitForServer(`http://127.0.0.1:${PORT}/api/mcp`)
if (!ready) {
  process.stderr.write(`glama-wrapper: Next.js server did not become ready on :${PORT}\n`)
  process.exit(1)
}

// Bridge stdio -> HTTP (blocks until stdin closes)
await import("./mcp-stdio-bridge.mjs")
