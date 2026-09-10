// scripts/apply-migration.mts
// Applies a migration SQL file to the linked Supabase project via the
// Management API (uses SUPABASE_ACCESS_TOKEN + project ref from
// NEXT_PUBLIC_SUPABASE_URL). Secrets stay in .env.local.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/apply-migration.mts <migration-file.sql>
import { readFileSync } from "node:fs"

const file = process.argv[2]
if (!file) {
  console.error("usage: apply-migration.mts <migration-file.sql>")
  process.exit(1)
}

const token = process.env.SUPABASE_ACCESS_TOKEN
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const ref = url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1]
if (!token || !ref) {
  console.error("SUPABASE_ACCESS_TOKEN or project ref missing/unparseable.")
  process.exit(1)
}

const sql = readFileSync(file, "utf-8")
console.log(`Applying ${file} to project ${ref} (${sql.length} bytes of SQL)...`)

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
})

if (!res.ok) {
  console.error(`FAILED ${res.status}: ${(await res.text()).slice(0, 500)}`)
  process.exit(1)
}
console.log("Migration applied OK.")
