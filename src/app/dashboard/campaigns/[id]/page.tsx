import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { redirect } from "next/navigation"
import { CampaignEmailStats } from "@/components/campaigns/campaign-email-stats"

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
    .select("*")
    .eq("campaign_id", id)
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
        <h2 className="text-h3 font-bold text-brand-secondary">Email Performance</h2>
        <div className="mt-3">
          <CampaignEmailStats campaignId={id} />
        </div>
      </section>

      <section>
        <h2 className="text-h3 font-bold text-brand-secondary">
          Prospects ({prospects?.length || 0})
        </h2>
        {prospects && prospects.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[#DCDDDE] bg-brand-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#DCDDDE] text-[#777777]">
                  <th className="px-4 py-3 font-medium">Domain</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <tr key={p.id} className="border-b border-[#DCDDDE] text-brand-secondary last:border-0">
                    <td className="px-4 py-3 font-medium">{p.domain || p.url}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs text-brand-secondary">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#575858]">{p.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-[#DCDDDE] bg-brand-white p-6 text-center text-sm text-[#575858]">
            No prospects in this campaign.
          </div>
        )}
      </section>
    </div>
  )
}
