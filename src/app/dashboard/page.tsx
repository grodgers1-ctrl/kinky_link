import { auth } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { ConnectSitePrompt } from "@/components/dashboard/connect-site-card"

export default async function DashboardPage() {
  const session = await auth()

  const { data: sites } = await supabase
    .from("sites")
    .select("*")
    .eq("user_id", session?.user?.id)

  if (!sites || sites.length === 0) {
    return (
      <div>
        <h1 className="text-h2 font-bold text-brand-secondary">
          Welcome, {session?.user?.name}
        </h1>
        <p className="mt-2 text-body text-[#575858]">
          Connect your site to get started finding prospects and building links.
        </p>
        <ConnectSitePrompt />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h2 font-bold text-brand-secondary">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Clicks" value="—" />
        <StatCard label="Total Impressions" value="—" />
        <StatCard label="Avg CTR" value="—" />
        <StatCard label="Avg Position" value="—" />
      </div>

      {sites.map((site) => (
        <p key={site.id} className="text-sm text-[#575858]">
          Site connected: {site.url}
        </p>
      ))}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-4">
      <p className="text-sm text-[#777777]">{label}</p>
      <p className="mt-1 text-h2 font-semibold text-brand-secondary">{value}</p>
    </div>
  )
}
