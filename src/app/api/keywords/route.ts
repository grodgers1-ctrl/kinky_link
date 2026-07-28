import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { data } = await supabaseAdmin
      .from("keywords")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("saved", true)
      .order("created_at", { ascending: false })

    return NextResponse.json({ keywords: data || [] })
  } catch (error) {
    console.error("Keywords list error:", error)
    return NextResponse.json({ error: "Failed to load keywords" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { keyword, siteId, source } = body

    const { data, error } = await supabaseAdmin
      .from("keywords")
      .upsert({
        user_id: session.user.id,
        keyword,
        site_id: siteId || null,
        source: source || "manual",
        saved: true,
      }, { onConflict: "user_id, keyword" })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ keyword: data })
  } catch (error) {
    console.error("Keyword save error:", error)
    return NextResponse.json({ error: "Failed to save keyword" }, { status: 500 })
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

    await supabaseAdmin
      .from("keywords")
      .update({ saved: false })
      .eq("id", id)
      .eq("user_id", session.user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Keyword remove error:", error)
    return NextResponse.json({ error: "Failed to remove keyword" }, { status: 500 })
  }
}
