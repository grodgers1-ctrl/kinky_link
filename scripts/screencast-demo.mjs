// scripts/screencast-demo.mjs
// Drives the live site with Playwright (installed Edge), captures frames while
// scrolling through public pages, and assembles an animated GIF.
// Usage: node scripts/screencast-demo.mjs
// Output: public/demos/lightlinks-screencast.gif
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import GIFEncoder from "gif-encoder-2"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = "https://www.lightlinks.dev"
const outPath = path.resolve(__dirname, "../public/demos/lightlinks-screencast.gif")

const W = 480
const H = 300
const STEP_MS = 180
const SCROLL_STEP = 70
const HOLD_FRAMES = 8

const encoder = new GIFEncoder(W, H, "neuquant")
encoder.setDelay(STEP_MS)
encoder.setRepeat(0)
encoder.start()

const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms)),
  ])

const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: W, height: H } })

let captured = 0
async function capture() {
  try {
    const png = await withTimeout(page.screenshot({ type: "png" }), 5000, "shot")
    const rgba = await withTimeout(
      page.evaluate(async (b64) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const canvas = document.createElement("canvas")
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext("2d")
        ctx.drawImage(img, 0, 0)
        return Array.from(ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data)
      }, png.toString("base64")),
      5000,
      "decode",
    )
    encoder.addFrame(new Uint8Array(rgba))
    captured++
    if (captured % 8 === 0) process.stdout.write(` ${captured}`)
  } catch (e) {
    process.stdout.write(` x`)
  }
}

async function visitAndScroll(url, extraPause = 0) {
  await withTimeout(
    page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }),
    20000,
    "goto",
  ).catch(() => {})
  await page.waitForTimeout(700)
  const maxY = await withTimeout(
    page.evaluate(() => Math.max(0, document.body.scrollHeight - window.innerHeight)),
    3000,
    "scrollheight",
  ).catch(() => 0)
  let y = 0
  while (y < maxY) {
    await capture()
    y = Math.min(maxY, y + SCROLL_STEP)
    await page.evaluate((s) => window.scrollTo(0, s), y).catch(() => {})
    await page.waitForTimeout(STEP_MS)
  }
  for (let i = 0; i < HOLD_FRAMES + extraPause; i++) {
    await capture()
    await page.waitForTimeout(STEP_MS)
  }
}

console.log("landing")
await visitAndScroll(`${BASE}/`, 6)
console.log("\npricing")
await visitAndScroll(`${BASE}/pricing`, 6)
console.log("\ndocs/mcp")
await visitAndScroll(`${BASE}/docs/mcp`, 8)

await browser.close()
encoder.finish()
const bytes = encoder.out.getData()
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, bytes)
console.log(`\nDone: ${captured} frames -> ${outPath} (${(bytes.length / 1024).toFixed(1)} KB)`)
