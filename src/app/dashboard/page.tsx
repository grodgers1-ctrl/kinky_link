import { auth } from "@/lib/auth"
import { supabaseAdmin as supabase } from "@/lib/db"
import { redirect } from "next/navigation"
import { ConnectSitePrompt } from "@/components/dashboard/connect-site-card"
import { GscSummary } from "@/components/dashboard/gsc-summary"
import { EmailStats } from "@/components/dashboard/email-stats"
import { BacklinksWidget } from "@/components/dashboard/backlinks-widget"
import { NextActionsWidget } from "@/components/dashboard/next-actions-widget"
import Link from "next/link"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: sites } = await supabase
    .from("sites")
    .select("*")
    .eq("user_id", session.user.id)

  const { count: campaignCount } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
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
        <div className="mt-4 text-center">
          <Link href="/onboarding" className="text-sm text-brand-accent hover:underline">
            Or use the onboarding wizard &rarr;
          </Link>
        </div>
      </div>
    )
  }

  if (!campaignCount) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-brand-accent bg-brand-primary p-4 text-center">
          <p className="text-sm text-brand-secondary">
            Your sites are connected.{" "}
            <Link href="/onboarding" className="font-medium text-brand-accent hover:underline">
              Complete the onboarding wizard
            </Link>{" "}
            to create your first campaign.
          </p>
        </div>
        {sites.map((site) => (
          <div key={site.id} className="space-y-2">
            <h2 className="text-h3 font-semibold text-brand-secondary">{site.url}</h2>
            <GscSummary siteId={site.id} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-h2 font-bold text-brand-secondary">Dashboard</h1>

      <NextActionsWidget userId={session.user.id} sites={sites} />

      {sites.map((site) => (
        <div key={site.id} className="space-y-2">
          <h2 className="text-h3 font-semibold text-brand-secondary">{site.url}</h2>
          <GscSummary siteId={site.id} />
        </div>
      ))}

      <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-brand-secondary">Backlinks</h2>
          <Link href="/dashboard/backlinks" className="text-sm text-brand-accent hover:underline">View all</Link>
        </div>
        <BacklinksWidget />
      </div>

      <section>
        <h2 className="text-h3 font-bold text-brand-secondary">Email Performance</h2>
        <div className="mt-3">
          <EmailStats />
        </div>
      </section>
    </div>
  )
}
