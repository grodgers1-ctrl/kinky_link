import { createHash, randomBytes } from "node:crypto"
import { supabaseAdmin } from "@/lib/db"

const KEY_PREFIX = "sk_ll_"

export interface ApiKeyRow {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

export function generateKey(): { raw: string; hash: string; prefix: string } {
  const random = randomBytes(24).toString("base64url")
  const raw = `${KEY_PREFIX}${random}`
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, 12) }
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export async function verifyKey(raw: string): Promise<string | null> {
  if (!raw) return null

  // Directory check / CI mode: when MCP_TEST_KEY is set, that literal token is
  // accepted as a valid key for a synthetic test user. Opt-in only — without
  // the env var this branch is inert. Used by Glama etc. automated checks.
  const testKey = process.env.MCP_TEST_KEY
  if (testKey && raw === testKey) {
    return "00000000-0000-4000-8000-000000000000"
  }

  if (!raw.startsWith(KEY_PREFIX)) return null
  const hash = hashKey(raw)
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle()
  if (!data) return null
  supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {})
  return data.user_id
}

export async function listKeys(userId: string): Promise<ApiKeyRow[]> {
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, created_at, revoked_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  return data || []
}

export async function createKey(
  userId: string,
  name: string,
): Promise<{ raw: string; row: ApiKeyRow }> {
  const { raw, hash, prefix } = generateKey()
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .insert({ user_id: userId, name, key_hash: hash, key_prefix: prefix })
    .select("id, name, key_prefix, last_used_at, created_at, revoked_at")
    .single()
  if (error || !data) throw new Error(error?.message || "Failed to create API key")
  return { raw, row: data }
}

export async function revokeKey(userId: string, keyId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", userId)
    .is("revoked_at", null)
  return !error
}
