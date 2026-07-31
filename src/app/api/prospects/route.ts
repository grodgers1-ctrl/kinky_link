import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get("campaignId")
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    let query = supabaseAdmin
      .from("prospects")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })

    if (campaignId) query = query.eq("campaign_id", campaignId)
    if (status) query = query.eq("status", status)
    if (search) query = query.ilike("title", `%${search}%`)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const prospects = data || []
    const domains = Array.from(
      new Set(prospects.map((p) => p.domain).filter((d): d is string => !!d)),
    )

    const factsByDomain: Record<
      string,
      { title: string | null; description: string | null; contact_email: string | null; domain_authority: number | null }
    > = {}
    if (domains.length > 0) {
      const { data: facts } = await supabaseAdmin
        .from("domain_facts")
        .select("domain, title, description, contact_email, domain_authority")
        .in("domain", domains)
      for (const f of facts || []) {
        factsByDomain[f.domain] = {
          title: f.title,
          description: f.description,
          contact_email: f.contact_email,
          domain_authority: f.domain_authority,
        }
      }
    }

    const enriched = prospects.map((p) => {
      const facts = p.domain ? factsByDomain[p.domain] : undefined
      return {
        ...p,
        homepageTitle: facts?.title ?? null,
        homepageDescription: facts?.description ?? null,
        resolvedEmail: p.email ?? facts?.contact_email ?? null,
        resolvedDA: p.domain_authority ?? facts?.domain_authority ?? null,
      }
    })

    return NextResponse.json({ prospects: enriched })
  } catch (error) {
    console.error("Prospects list error:", error)
    return NextResponse.json({ error: "Failed to load prospects" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("prospects")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", session.user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 })
    }
    return NextResponse.json({ prospect: data })
  } catch (error) {
    console.error("Prospect update error:", error)
    return NextResponse.json({ error: "Failed to update prospect" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("prospects")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data?.length) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Prospect delete error:", error)
    return NextResponse.json({ error: "Failed to delete prospect" }, { status: 500 })
  }
}
