import { auth } from "@/lib/auth"
import { supabaseAdmin as supabase } from "@/lib/db"
import { redirect } from "next/navigation"
import { ProspectSearch } from "@/components/prospects/prospect-search"
import { ProspectsView } from "@/components/prospects/prospects-view"

export default async function ProspectsPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("user_id", session.user.id)

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-h2 font-bold text-brand-secondary">Search Prospects</h1>
        <p className="mt-1 text-body text-[#575858]">Find link-building prospects by keyword.</p>
        <div className="mt-4">
          <ProspectSearch campaigns={campaigns || []} />
        </div>
      </section>

      <hr className="border-[#DCDDDE]" />

      <section>
        <h2 className="text-h2 font-bold text-brand-secondary">My Prospects</h2>
        <p className="mt-1 text-body text-[#575858]">View, filter, and manage your prospect list.</p>
        <div className="mt-4">
          <ProspectsView campaigns={campaigns || []} />
        </div>
      </section>
    </div>
  )
}
