import { auth } from "@/lib/auth"
import { supabaseAdmin as supabase } from "@/lib/db"
import { redirect } from "next/navigation"
import { KeywordsView } from "@/components/keywords/keywords-view"

export default async function KeywordsPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: sites } = await supabase
    .from("sites")
    .select("id, url")
    .eq("user_id", session.user.id)

  return (
    <div className="space-y-6">
      <h1 className="text-h2 font-bold text-brand-secondary">Keyword Research</h1>
      <KeywordsView sites={sites || []} />
    </div>
  )
}
