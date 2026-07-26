import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

interface ProspectInput {
  url: string
  title?: string
  domain?: string
  description?: string
  domainAuthority?: number | null
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { campaignId, prospects } = body as {
      campaignId?: string
      prospects?: ProspectInput[]
    }

    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 })
    }
    if (!prospects?.length || prospects.length > 50) {
      return NextResponse.json({ error: "1-50 prospects required" }, { status: 400 })
    }

    const rows = prospects.map((p) => ({
      user_id: session.user.id,
      campaign_id: campaignId,
      url: p.url,
      title: p.title || null,
      domain: p.domain || null,
      description: p.description || null,
      domain_authority: p.domainAuthority || null,
      status: "prospect" as const,
    }))

    const { data, error } = await supabaseAdmin.from("prospects").insert(rows).select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ prospects: data })
  } catch (error) {
    console.error("Batch insert error:", error)
    return NextResponse.json({ error: "Failed to add prospects" }, { status: 500 })
  }
}
