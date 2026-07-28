import { auth } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { redirect } from "next/navigation"
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
    </div>
  )
}
