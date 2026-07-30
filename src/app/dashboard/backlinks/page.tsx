import { auth } from "@/lib/auth"
import { supabaseAdmin as supabase } from "@/lib/db"
import { redirect } from "next/navigation"
import { BacklinksView } from "@/components/backlinks/backlinks-view"
import { SyncButton } from "@/components/backlinks/sync-button"

export default async function BacklinksPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: sites } = await supabase
    .from("sites")
    .select("id, url")
    .eq("user_id", session.user.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h2 font-bold text-brand-secondary">Backlinks</h1>
        <SyncButton />
      </div>
      <BacklinksView sites={sites || []} />
    </div>
  )
}
