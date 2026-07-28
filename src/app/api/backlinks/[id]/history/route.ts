import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const { data } = await supabaseAdmin
      .from("backlink_history")
      .select("*")
      .eq("backlink_id", id)
      .order("checked_at", { ascending: false })
      .limit(20)

    return NextResponse.json({ history: data || [] })
  } catch (error) {
    console.error("History fetch error:", error)
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 })
  }
}
