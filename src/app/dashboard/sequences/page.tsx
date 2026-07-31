import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { redirect } from "next/navigation"
import { SequencesList } from "@/components/sequences/sequences-list"

export default async function SequencesPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: sequences } = await supabaseAdmin
    .from("sequences")
    .select("id, name, campaign_id, created_at, sequence_steps(id, step_order, delay_days, subject)")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  const { data: campaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id, name")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  const enrichedSequences = await Promise.all(
    (sequences || []).map(async (s) => {
      const { count: enrolledCount } = await supabaseAdmin
        .from("sequence_progress")
        .select("*", { count: "exact", head: true })
        .eq("sequence_id", s.id)
      return { ...s, enrolledCount: enrolledCount || 0 }
    }),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-brand-secondary">Sequences</h1>
        <p className="mt-1 text-body text-[#575858]">
          Multi-step outreach with delays between sends. Enrolled prospects get each
          step sent by the daily cron.
        </p>
      </div>
      <SequencesList sequences={enrichedSequences} campaigns={campaigns || []} />
    </div>
  )
}
