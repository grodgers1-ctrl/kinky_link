import { auth } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { BacklinkDetail } from "@/components/backlinks/backlink-detail"

export default async function BacklinkDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { id } = await params

  const { data: backlink } = await supabase
    .from("backlinks")
    .select("*, sites(url)")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .single()

  if (!backlink) notFound()

  return (
    <div className="space-y-6">
      <BacklinkDetail backlink={backlink} />
    </div>
  )
}
