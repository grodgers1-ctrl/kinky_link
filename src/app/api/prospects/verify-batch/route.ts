import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { hunterVerifyEmail } from "@/lib/hunter"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { prospectIds } = body

    if (!prospectIds?.length) {
      return NextResponse.json({ error: "No prospects specified" }, { status: 400 })
    }

    const { data: prospects } = await supabaseAdmin
      .from("prospects")
      .select("id, email")
      .in("id", prospectIds)
      .eq("user_id", session.user.id)
      .not("email", "is", null)

    if (!prospects) return NextResponse.json({ verified: 0, total: 0 })

    let verified = 0
    for (const prospect of prospects) {
      const result = await hunterVerifyEmail(prospect.email)
      if (result.status !== "unknown") {
        await supabaseAdmin
          .from("prospects")
          .update({ email_verified: result.status === "valid", updated_at: new Date().toISOString() })
          .eq("id", prospect.id)
        if (result.status === "valid") verified++
      }
    }

    return NextResponse.json({ verified, total: prospects.length })
  } catch (error) {
    console.error("Batch verify error:", error)
    return NextResponse.json({ error: "Failed to verify emails" }, { status: 500 })
  }
}
