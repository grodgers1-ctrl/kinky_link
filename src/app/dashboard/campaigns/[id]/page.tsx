import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { redirect } from "next/navigation"
import { CampaignEmailStats } from "@/components/campaigns/campaign-email-stats"
import { CampaignEmailActions } from "@/components/campaigns/campaign-email-actions"
import { CampaignProspectsTable } from "@/components/campaigns/campaign-prospects-table"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("*, sites(url)")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .single()

  if (!campaign) return <div className="p-6 text-[#575858]">Campaign not found.</div>

  const { data: prospects } = await supabaseAdmin
    .from("prospects")
    .select("id, url, domain, title, status, email, tags")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })

  const { data: sequences } = await supabaseAdmin
    .from("sequences")
    .select("id, name")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-brand-secondary">{campaign.name}</h1>
        <p className="mt-1 text-sm text-[#575858]">
          {campaign.sites?.url || "No site"} &middot; {campaign.status}
        </p>
      </div>

      <section>
        <h2 className="text-h3 font-bold text-brand-secondary">
          Prospects ({prospects?.length || 0})
        </h2>
        <CampaignProspectsTable
          prospects={prospects || []}
          sequences={sequences || []}
        />
      </section>

      <section>
        <h2 className="text-h3 font-bold text-brand-secondary">Email Performance</h2>
        <div className="mt-3">
          <CampaignEmailStats campaignId={id} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-bold text-brand-secondary">Email Finder</h2>
          <CampaignEmailActions campaignId={id} />
        </div>
      </section>
    </div>
  )
}
