import { auth } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { redirect } from "next/navigation"
import { ProspectSearch } from "@/components/prospects/prospect-search"

export default async function ProspectsPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("user_id", session.user.id)

  return (
    <div className="space-y-6">
      <h1 className="text-h2 font-bold text-brand-secondary">Prospect Search</h1>
      <ProspectSearch campaigns={campaigns || []} />
    </div>
  )
}
