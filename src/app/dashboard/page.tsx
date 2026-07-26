import { auth } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { redirect } from "next/navigation"
import { ConnectSitePrompt } from "@/components/dashboard/connect-site-card"
import { GscSummary } from "@/components/dashboard/gsc-summary"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: sites } = await supabase
    .from("sites")
    .select("*")
    .eq("user_id", session.user.id)

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
      <h1 className="text-h2 font-bold text-brand-secondary">Dashboard</h1>

      {sites.map((site) => (
        <div key={site.id} className="space-y-2">
          <h2 className="text-h3 font-semibold text-brand-secondary">{site.url}</h2>
          <GscSummary siteId={site.id} />
        </div>
      ))}
    </div>
  )
}
