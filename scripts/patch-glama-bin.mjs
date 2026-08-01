// scripts/patch-glama-bin.mjs
// Installs glama-next-wrapper.mjs as the `next` CLI entrypoint inside the
// Glama Docker image, so `npx next start` starts Next in the background and
// bridges stdio<->HTTP. The real Next CLI is preserved as `next.orig`.
// Run AFTER `npm run build` as the last build step.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next")
const nextOrig = path.join(root, "node_modules", "next", "dist", "bin", "next.orig")
const wrapper = path.join(root, "scripts", "glama-next-wrapper.mjs")

if (!fs.existsSync(nextBin)) {
  console.error(`patch-glama-bin: next bin not found at ${nextBin}`)
  process.exit(1)
}
if (!fs.existsSync(wrapper)) {
  console.error(`patch-glama-bin: wrapper not found at ${wrapper}`)
  process.exit(1)
}

// Preserve the real CLI (idempotent: don't re-rename if already done)
if (!fs.existsSync(nextOrig)) {
  fs.copyFileSync(nextBin, nextOrig)
  fs.chmodSync(nextOrig, 0o755)
}

const shim = `#!/usr/bin/env node
import { pathToFileURL } from "node:url"
await import(pathToFileURL(${JSON.stringify(wrapper)}).href)
`

fs.writeFileSync(nextBin, shim)
fs.chmodSync(nextBin, 0o755)
console.log("patch-glama-bin: installed stdio bridge as `next` entrypoint (real CLI at next.orig)")
