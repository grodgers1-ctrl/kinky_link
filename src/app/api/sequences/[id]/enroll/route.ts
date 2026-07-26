import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const { prospectIds } = body

    if (!prospectIds?.length) {
      return NextResponse.json({ error: "Prospect IDs required" }, { status: 400 })
    }

    const progressRows = prospectIds.map((pid: string) => ({
      sequence_id: id,
      prospect_id: pid,
      current_step: 1,
      next_send_at: new Date().toISOString(),
      status: "pending",
    }))

    const { error } = await supabaseAdmin.from("sequence_progress").insert(progressRows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ enrolled: prospectIds.length })
  } catch (error) {
    console.error("Enroll error:", error)
    return NextResponse.json({ error: "Failed to enroll prospects" }, { status: 500 })
  }
}
