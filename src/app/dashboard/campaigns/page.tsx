import { auth } from "@/lib/auth"
import { supabaseAdmin as supabase } from "@/lib/db"
import { redirect } from "next/navigation"
import { CampaignList } from "@/components/dashboard/campaign-list"
import { CreateCampaignDialog } from "@/components/dashboard/create-campaign-dialog"

export default async function CampaignsPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*, sites(url)")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  const { data: sites } = await supabase
    .from("sites")
    .select("id, url")
    .eq("user_id", session.user.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h2 font-bold text-brand-secondary">Campaigns</h1>
        <CreateCampaignDialog sites={sites || []} />
      </div>
      <CampaignList campaigns={campaigns || []} />
    </div>
  )
}
