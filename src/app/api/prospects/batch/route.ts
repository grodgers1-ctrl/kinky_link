import { auth } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { campaignId, prospects } = body

  if (!campaignId || !prospects?.length) {
    return NextResponse.json({ error: "Campaign ID and prospects required" }, { status: 400 })
  }

  const rows = prospects.map((p: any) => ({
    user_id: session.user.id,
    campaign_id: campaignId,
    url: p.url,
    title: p.title || null,
    domain: p.domain || null,
    description: p.description || null,
    domain_authority: p.domainAuthority || null,
    status: "prospect",
  }))

  const { data, error } = await supabase.from("prospects").insert(rows).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prospects: data })
}
