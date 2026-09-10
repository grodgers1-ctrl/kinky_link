// scripts/import-cc-graph.mts
// Quarterly import of Common Crawl's public DOMAIN-level web graph, filtered
// to the competitor domains users actually query (cc_targets). Free data:
// https://data.commoncrawl.org/projects/hyperlinkgraph/<release>/domain/
//
//   vertices:  id<TAB>reversed_domain<TAB>host_count   (ids sequential, sorted)
//   edges:     from_id<TAB>to_id
//
// Strategy: 3 streaming passes — (1) find target node ids in vertices,
// (2) scan edges for links INTO those ids, (3) resolve source ids back to
// domains in a second vertices pass. Only filtered edges touch Supabase.
// Downloads are resumable (Range-append); ~11.5 GB total, expect 15-60 min
// depending on bandwidth. Run it locally, NOT inside Vercel.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/import-cc-graph.mts                # full import
//   npx tsx --env-file=.env.local scripts/import-cc-graph.mts --self-test    # validate live file formats (no DB writes)
//   npx tsx --env-file=.env.local scripts/import-cc-graph.mts --fixture      # synthetic parse→match→upsert roundtrip (cleans up)
//   npx tsx --env-file=.env.local scripts/import-cc-graph.mts --release cc-main-2026-may-jun-jul

import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, stat } from "node:fs/promises"
import { createGunzip } from "node:zlib"
import path from "node:path"
import { supabaseAdmin } from "@/lib/db"

const DEFAULT_RELEASE = "cc-main-2026-may-jun-jul"
const BASE = "https://data.commoncrawl.org/projects/hyperlinkgraph"
const WORK_DIR = path.join(process.cwd(), "tmp", "cc-graph")
const UPSERT_BATCH = 1000
const MAX_SOURCES_PER_TARGET = 250_000

// --- small utils -------------------------------------------------------------

function reversedName(domain: string): string {
  // example.com → com.example (CC domain graph notation; www already stripped upstream)
  return domain.toLowerCase().split(".").reverse().join(".")
}

function unreversedName(rev: string): string {
  return rev.split(".").reverse().join(".")
}

async function headSize(url: string): Promise<number> {
  const res = await fetch(url, { method: "HEAD" })
  if (!res.ok) throw new Error(`HEAD ${url} → ${res.status}`)
  return Number(res.headers.get("content-length") || 0)
}

/** Download url → dest with resume. Returns final path. */
async function downloadResumable(url: string, dest: string, label: string): Promise<string> {
  const total = await headSize(url)
  let have = 0
  try {
    have = (await stat(dest)).size
  } catch {
    // no partial file yet
  }
  if (have === total) {
    console.log(`${label}: already complete (${(total / 1e9).toFixed(2)} GB)`)
    return dest
  }
  if (have > total) throw new Error(`${label}: local file larger than remote — delete ${dest}`)

  console.log(`${label}: downloading ${(total / 1e9).toFixed(2)} GB${have ? ` (resuming at ${(have / 1e9).toFixed(2)} GB)` : ""}...`)
  const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {} })
  if (!res.ok || !res.body) throw new Error(`GET ${url} → ${res.status}`)

  const out = createWriteStream(dest, { flags: "a" })
  const reader = res.body.getReader()
  let written = have
  let lastLog = Date.now()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.write(value)
    written += value.byteLength
    if (Date.now() - lastLog > 10_000) {
      console.log(`  ${label}: ${((written / total) * 100).toFixed(1)}%`)
      lastLog = Date.now()
    }
  }
  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve())
    out.on("error", reject)
  })
  if (written !== total) throw new Error(`${label}: incomplete (${written}/${total}) — rerun to resume`)
  return dest
}

/** Stream a gz file line by line. */
async function* streamLines(gzPath: string): AsyncGenerator<string> {
  const gunzip = createGunzip()
  const stream = createReadStream(gzPath).pipe(gunzip)
  let buffer = ""
  for await (const chunk of stream) {
    buffer += chunk.toString("utf-8")
    let idx: number
    while ((idx = buffer.indexOf("\n")) !== -1) {
      yield buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
    }
  }
  if (buffer.length > 0) yield buffer
}

// --- pipeline pieces (shared by fixture + full run) --------------------------

/** Pass 1: find node ids for target domains in a vertices line stream. */
async function matchTargets(
  lines: AsyncGenerator<string>,
  targets: string[],
): Promise<Map<number, string>> {
  const byReversed = new Map(targets.map((t) => [reversedName(t), t]))
  const found = new Map<number, string>()
  let n = 0
  for await (const line of lines) {
    n++
    const tab1 = line.indexOf("\t")
    if (tab1 === -1) continue
    const tab2 = line.indexOf("\t", tab1 + 1)
    const name = line.slice(tab1 + 1, tab2 === -1 ? undefined : tab2)
    const target = byReversed.get(name)
    if (target) found.set(Number(line.slice(0, tab1)), target)
  }
  console.log(`  pass 1: scanned ${n.toLocaleString()} vertices, matched ${found.size}/${targets.length} targets`)
  return found
}

/** Pass 2: collect source ids linking into target ids from an edges stream. */
async function collectEdges(
  lines: AsyncGenerator<string>,
  targetIds: Map<number, string>,
): Promise<Map<string, Set<number>>> {
  const sources = new Map<string, Set<number>>()
  let n = 0
  let lastLog = Date.now()
  for await (const line of lines) {
    n++
    if (Date.now() - lastLog > 30_000) {
      console.log(`  pass 2: ${n.toLocaleString()} edges scanned...`)
      lastLog = Date.now()
    }
    const tab = line.indexOf("\t")
    if (tab === -1) continue
    const target = targetIds.get(Number(line.slice(tab + 1)))
    if (!target) continue
    let set = sources.get(target)
    if (!set) {
      set = new Set()
      sources.set(target, set)
    }
    if (set.size < MAX_SOURCES_PER_TARGET) set.add(Number(line.slice(0, tab)))
  }
  console.log(`  pass 2: ${n.toLocaleString()} edges scanned`)
  return sources
}

/** Pass 3a: resolve source ids to (still reversed) domain names. */
async function resolveNames(
  lines: AsyncGenerator<string>,
  sources: Map<string, Set<number>>,
): Promise<Map<number, string>> {
  const wanted = new Set<number>()
  for (const ids of sources.values()) for (const id of ids) wanted.add(id)
  const idToRevName = new Map<number, string>()
  for await (const line of lines) {
    const tab1 = line.indexOf("\t")
    if (tab1 === -1) continue
    const id = Number(line.slice(0, tab1))
    if (!wanted.has(id)) continue
    const tab2 = line.indexOf("\t", tab1 + 1)
    idToRevName.set(id, line.slice(tab1 + 1, tab2 === -1 ? undefined : tab2))
  }
  return idToRevName
}

/**
 * Pass 3b: harmonic-centrality rank per reversed domain name, from the ranks
 * file (columns: hc_pos, hc_val, pr_pos, pr_val, host_rev, n_hosts).
 */
async function resolveRanks(
  lines: AsyncGenerator<string>,
  revNames: Set<string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for await (const line of lines) {
    if (line.startsWith("#")) continue
    const parts = line.split("\t")
    if (parts.length < 5) continue
    if (revNames.has(parts[4])) out.set(parts[4], Number(parts[1]))
  }
  return out
}

/** Keep at most this many best-ranked sources per target in the table. */
const TOP_STORE_PER_TARGET = 5_000

/** Store sources per target, best-ranked first, capped at TOP_STORE_PER_TARGET. */
async function storeRanked(
  sources: Map<string, Set<number>>,
  idToRevName: Map<number, string>,
  nameToRank: Map<string, number>,
  crawlId: string,
  dryRun: boolean,
): Promise<number> {
  let stored = 0
  let batch: { target_domain: string; source_domain: string; crawl_id: string; source_rank: number | null }[] = []
  const flush = async () => {
    if (batch.length === 0) return
    if (!dryRun) {
      const { error } = await supabaseAdmin
        .from("cc_link_graph")
        .upsert(batch, { onConflict: "target_domain,source_domain,crawl_id", ignoreDuplicates: false })
      if (error) throw new Error(`cc_link_graph upsert failed: ${error.message}`)
    }
    stored += batch.length
    batch = []
  }

  for (const [target, ids] of sources) {
    const rows: { target_domain: string; source_domain: string; crawl_id: string; source_rank: number | null }[] = []
    for (const id of ids) {
      const rev = idToRevName.get(id)
      if (!rev) continue
      rows.push({
        target_domain: target,
        source_domain: unreversedName(rev),
        crawl_id: crawlId,
        source_rank: nameToRank.get(rev) ?? null,
      })
    }
    rows.sort((a, b) => (b.source_rank ?? -1) - (a.source_rank ?? -1))
    for (const row of rows.slice(0, TOP_STORE_PER_TARGET)) {
      batch.push(row)
      if (batch.length >= UPSERT_BATCH) await flush()
    }
  }
  await flush()
  return stored
}

// --- modes -------------------------------------------------------------------

async function selfTest(release: string) {
  console.log(`self-test against live ${release} domain graph files`)
  for (const kind of ["vertices", "edges"] as const) {
    const url = `${BASE}/${release}/domain/${release}-domain-${kind}.txt.gz`
    const res = await fetch(url, { headers: { Range: "bytes=0-65535" } })
    if (!res.ok || !res.body) throw new Error(`${kind}: HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    // partial gzip: stream-decompress what we can, ignore the truncated tail
    const zlib = await import("node:zlib")
    const text = await new Promise<string>((resolve) => {
      const gunzip = zlib.createGunzip()
      let acc = ""
      gunzip.on("data", (c) => (acc += c.toString()))
      gunzip.on("end", () => resolve(acc))
      gunzip.on("error", () => resolve(acc)) // expected: truncated stream
      gunzip.end(buf)
    })
    const firstLine = text.split("\n")[0] || ""
    const parts = firstLine.split("\t")
    const okShape =
      kind === "vertices"
        ? parts.length >= 2 && /^\d+$/.test(parts[0]) && parts[1].includes(".")
        : parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])
    console.log(`  ${kind}: first line "${firstLine.slice(0, 60)}" → ${okShape ? "FORMAT OK" : "FORMAT MISMATCH"}`)
    if (!okShape) process.exit(1)
  }
  console.log("SELF-TEST PASS (formats match; no DB writes)")
}

async function fixture(release: string) {
  const target = `fixture-${Date.now()}.example`
  console.log(`fixture pipeline test with target ${target}`)
  await supabaseAdmin.from("cc_targets").upsert({ target_domain: target }, { onConflict: "target_domain" })

  async function* fixtureLines(kind: "vertices" | "edges"): AsyncGenerator<string> {
    const v = ["0\tcom.example\t1", `1\t${reversedName(target)}\t1`, "2\tcom.linker-one\t3", "3\tcom.linker-two\t1"]
    const e = ["2\t1", "3\t1", "2\t0"] // linker-one → target, linker-two → target, linker-one → other
    for (const line of kind === "vertices" ? v : e) yield line
  }

  const targetIds = await matchTargets(fixtureLines("vertices"), [target])
  if (targetIds.size !== 1) {
    console.error("FAIL: fixture target not matched")
    process.exit(1)
  }
  const sources = await collectEdges(fixtureLines("edges"), targetIds)
  const idToRevName = await resolveNames(fixtureLines("vertices"), sources)
  const stored = await storeRanked(sources, idToRevName, new Map(), `${release}-fixture`, false)
  console.log(`  stored ${stored} fixture edges`)

  const { data } = await supabaseAdmin
    .from("cc_link_graph")
    .select("source_domain")
    .eq("target_domain", target)
  const domains = (data || []).map((r) => r.source_domain).sort()
  const ok = domains.length === 2 && domains[0] === "linker-one.com" && domains[1] === "linker-two.com"

  await supabaseAdmin.from("cc_link_graph").delete().eq("target_domain", target)
  await supabaseAdmin.from("cc_targets").delete().eq("target_domain", target)
  console.log(`  cleaned up fixture rows → ${ok ? "FIXTURE PASS" : "FIXTURE FAIL"} (${domains.join(", ")})`)
  if (!ok) process.exit(1)
}

async function fullImport(release: string) {
  const { data: targets, error } = await supabaseAdmin
    .from("cc_targets")
    .select("target_domain")
    .order("query_count", { ascending: false })
  if (error) throw new Error(`cc_targets read failed: ${error.message}`)
  const list = (targets || []).map((t) => t.target_domain as string)
  if (list.length === 0) {
    console.log("No rows in cc_targets — nothing to import. Run find_competitor_backlinks first.")
    return
  }
  console.log(`importing release ${release} for ${list.length} target(s): ${list.join(", ")}`)

  await mkdir(WORK_DIR, { recursive: true })
  const vPath = await downloadResumable(
    `${BASE}/${release}/domain/${release}-domain-vertices.txt.gz`,
    path.join(WORK_DIR, `${release}-vertices.txt.gz`),
    "vertices",
  )
  const ePath = await downloadResumable(
    `${BASE}/${release}/domain/${release}-domain-edges.txt.gz`,
    path.join(WORK_DIR, `${release}-edges.txt.gz`),
    "edges",
  )
  const rPath = await downloadResumable(
    `${BASE}/${release}/domain/${release}-domain-ranks.txt.gz`,
    path.join(WORK_DIR, `${release}-ranks.txt.gz`),
    "ranks",
  )

  console.log("pass 1: matching targets in vertices...")
  const targetIds = await matchTargets(streamLines(vPath), list)
  if (targetIds.size === 0) {
    console.error("No targets found in the graph. Nothing to import.")
    return
  }

  console.log("pass 2: scanning edges (this is the long one)...")
  const sources = await collectEdges(streamLines(ePath), targetIds)

  console.log("pass 3a: resolving source names...")
  const idToRevName = await resolveNames(streamLines(vPath), sources)

  console.log("pass 3b: resolving harmonic-centrality ranks...")
  const nameToRank = await resolveRanks(streamLines(rPath), new Set(idToRevName.values()))

  console.log("pass 3c: storing best-ranked sources...")
  const stored = await storeRanked(sources, idToRevName, nameToRank, release, false)
  for (const [target, ids] of sources) {
    console.log(`  ${target}: ${ids.size.toLocaleString()} linking domains found, top ${Math.min(ids.size, TOP_STORE_PER_TARGET).toLocaleString()} stored`)
  }
  console.log(`\nIMPORT DONE — ${stored.toLocaleString()} edges stored for crawl ${release}`)
}

// --- entry -------------------------------------------------------------------

const args = process.argv.slice(2)
const releaseIdx = args.indexOf("--release")
const release = releaseIdx !== -1 ? args[releaseIdx + 1] : DEFAULT_RELEASE

if (args.includes("--self-test")) await selfTest(release)
else if (args.includes("--fixture")) await fixture(release)
else await fullImport(release)
