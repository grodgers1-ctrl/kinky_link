import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { checkUrlIndexedSimple } from "@/lib/index-checker"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const { data: backlink } = await supabaseAdmin
      .from("backlinks")
      .select("*")
      .eq("id", id)
      .eq("user_id", session.user.id)
      .single()

    if (!backlink) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const result = await checkUrlIndexedSimple(backlink.source_url)
    const isIndexed = result === "indexed" ? true : result === "not_indexed" ? false : null

    await supabaseAdmin
      .from("backlinks")
      .update({ is_indexed: isIndexed, updated_at: new Date().toISOString() })
      .eq("id", id)

    return NextResponse.json({ result, indexed: isIndexed })
  } catch (error) {
    console.error("Index check error:", error)
    return NextResponse.json({ error: "Index check failed" }, { status: 500 })
  }
}
