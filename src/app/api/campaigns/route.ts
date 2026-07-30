import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(v: string): boolean {
  return UUID_RE.test(v)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, siteId, siteUrl } = body as {
      name?: string
      siteId?: string
      siteUrl?: string
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    let resolvedSiteId: string | null = null

    if (siteId && typeof siteId === "string" && isUuid(siteId)) {
      resolvedSiteId = siteId
    } else if (siteUrl && typeof siteUrl === "string") {
      const { data: site } = await supabaseAdmin
        .from("sites")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("url", siteUrl)
        .maybeSingle()
      resolvedSiteId = site?.id ?? null
    }

    const { data, error } = await supabaseAdmin
      .from("campaigns")
      .insert({
        user_id: session.user.id,
        name: name.trim(),
        site_id: resolvedSiteId,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ campaign: data })
  } catch (error) {
    console.error("Campaign create error:", error)
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("campaigns")
      .select("*, sites(url)")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ campaigns: data || [] })
  } catch (error) {
    console.error("Campaign list error:", error)
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 })
  }
}
