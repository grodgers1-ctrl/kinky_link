import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { getStripe } from "@/lib/stripe"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("stripe_customer_id")
      .eq("id", session.user.id)
      .single()

    if (!user?.stripe_customer_id) {
      return NextResponse.json({ error: "No subscription found" }, { status: 400 })
    }

    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.AUTH_URL}/dashboard/settings`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error: any) {
    console.error("Portal error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
