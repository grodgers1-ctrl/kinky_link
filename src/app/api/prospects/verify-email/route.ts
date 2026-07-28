import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { hunterVerifyEmail } from "@/lib/hunter"
import { heuristicVerify } from "@/lib/email-finder"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { prospectId, email } = body

    if (!prospectId || !email) {
      return NextResponse.json({ error: "prospectId and email required" }, { status: 400 })
    }

    const heuristic = heuristicVerify(email)
    const hunterResult = await hunterVerifyEmail(email)

    const verified = hunterResult.status === "valid"

    await supabaseAdmin
      .from("prospects")
      .update({ email_verified: verified, updated_at: new Date().toISOString() })
      .eq("id", prospectId)
      .eq("user_id", session.user.id)

    return NextResponse.json({
      email,
      verified,
      score: hunterResult.score,
      status: hunterResult.status,
      heuristicConfidence: heuristic.confidence,
    })
  } catch (error) {
    console.error("Verify email error:", error)
    return NextResponse.json({ error: "Failed to verify email" }, { status: 500 })
  }
}
