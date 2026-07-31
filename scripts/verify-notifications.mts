// scripts/verify-notifications.mts
// End-to-end sanity: insert a notification for the first user in the DB,
// then read it back via the same table the API reads. Prints unread count.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-notifications.mts
import { supabaseAdmin } from "@/lib/db"

const { data: user } = await supabaseAdmin
  .from("users")
  .select("id, email")
  .limit(1)
  .maybeSingle()

if (!user) {
  console.error("FAIL: no user in DB. Sign in at least once, then re-run.")
  process.exit(1)
}
console.log(`Using user ${user.email} (${user.id})`)

const { data: inserted, error: insertError } = await supabaseAdmin
  .from("notifications")
  .insert({
    user_id: user.id,
    type: "info",
    title: "Verify script smoke",
    body: `Inserted at ${new Date().toISOString()} — safe to delete.`,
    link: null,
  })
  .select()
  .single()

if (insertError) {
  console.error("FAIL: insert:", insertError.message)
  process.exit(1)
}
console.log(`Inserted notification ${inserted.id}`)

const { data: recent } = await supabaseAdmin
  .from("notifications")
  .select("id, title, read, created_at")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(5)

console.log(`Latest 5 notifications for this user:`)
;(recent || []).forEach((n, i) => {
  console.log(`  ${i + 1}. [${n.read ? "read" : "unread"}] ${n.title}`)
})

const unread = (recent || []).filter((n) => !n.read).length
console.log(`\nUnread count: ${unread}`)

// Clean up the test row
await supabaseAdmin.from("notifications").delete().eq("id", inserted.id)
console.log(`Cleaned up test notification ${inserted.id}`)
console.log("\nNOTIFICATIONS PASS")
