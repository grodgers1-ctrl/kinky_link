import { auth } from "@/lib/auth"
import { supabaseAdmin as supabase } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { BillingSettings } from "@/components/billing/billing-settings"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: user } = await supabase
    .from("users")
    .select("subscription_status, subscription_plan, trial_end, subscription_current_period_end")
    .eq("id", session.user.id)
    .single()

  return (
    <div className="space-y-8">
      <h1 className="text-h2 font-bold text-brand-secondary">Settings</h1>
      <BillingSettings subscription={user} />

      <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-5">
        <h2 className="text-h3 font-semibold text-brand-secondary">API access</h2>
        <p className="mt-2 text-sm text-[#575858]">
          Connect linklight to Claude Desktop, Claude Code, Cursor, or any MCP-compatible AI agent.
        </p>
        <Link
          href="/dashboard/settings/api-access"
          className="mt-3 inline-block text-sm font-medium text-brand-accent hover:underline"
        >
          Manage API keys &rarr;
        </Link>
      </div>
    </div>
  )
}
