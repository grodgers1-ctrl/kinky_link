// Create one API key for smoke testing. Prints the raw key on stdout.
// Run: npx tsx --env-file=.env.local scripts/create-test-key.mts
import { createKey } from "@/lib/api-keys"
import { supabaseAdmin } from "@/lib/db"

const { data: users } = await supabaseAdmin.from("users").select("id").limit(1)
if (!users?.length) {
  console.error("No users in DB — sign in via the app first")
  process.exit(1)
}
const { raw } = await createKey(users[0].id as string, "mcp-smoke-test")
process.stdout.write(raw)
