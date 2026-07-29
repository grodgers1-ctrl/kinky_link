// scripts/verify-api-keys.ts
// Verifies generate/hash/verify roundtrip against the real DB.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-api-keys.ts
import {
  generateKey,
  hashKey,
  verifyKey,
  createKey,
  revokeKey,
  listKeys,
} from "@/lib/api-keys"
import { supabaseAdmin } from "@/lib/db"

const { raw, hash, prefix } = generateKey()
console.log("generateKey:", { rawLen: raw.length, prefix, hashLen: hash.length })
if (hashKey(raw) !== hash) throw new Error("hashKey mismatch")

const { data: users } = await supabaseAdmin.from("users").select("id").limit(1)
if (!users?.length) {
  console.log("SKIP DB roundtrip: no users in DB")
  process.exit(0)
}
const userId = users[0].id as string

const { raw: created, row } = await createKey(userId, "verify-script")
console.log("createKey:", { id: row.id, prefix: row.key_prefix })

const verified = await verifyKey(created)
if (verified !== userId) throw new Error(`verifyKey returned ${verified}, expected ${userId}`)
console.log("verifyKey: OK")

const wrong = await verifyKey("sk_ll_notarealkey")
if (wrong !== null) throw new Error("verifyKey should reject fake keys")
console.log("verifyKey (bad key): OK")

const revoked = await revokeKey(userId, row.id)
if (!revoked) throw new Error("revokeKey failed")
const afterRevoke = await verifyKey(created)
if (afterRevoke !== null) throw new Error("verifyKey should reject revoked keys")
console.log("revokeKey: OK")

const keys = await listKeys(userId)
console.log("listKeys count:", keys.length)
console.log("\nALL PASS")
