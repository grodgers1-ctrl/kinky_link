import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { getStripe, MONTHLY_PRICE_ID, YEARLY_PRICE_ID } from "@/lib/stripe"
import { NextRequest, NextResponse } from "next/server"

const BASE_URL = process.env.AUTH_URL || "http://localhost:3000"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { plan } = body
    if (plan !== "monthly" && plan !== "yearly") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }
    const priceId = plan === "yearly" ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("stripe_customer_id, subscription_status")
      .eq("id", session.user.id)
      .single()

    const isReturning = user?.stripe_customer_id && user?.subscription_status !== "none"

    const sessionOptions: any = {
      customer: user?.stripe_customer_id || undefined,
      customer_email: user?.stripe_customer_id ? undefined : session.user.email,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { userId: session.user.id },
      },
      metadata: { userId: session.user.id },
      success_url: `${BASE_URL}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/pricing`,
    }

    if (!isReturning) {
      sessionOptions.subscription_data.trial_period_days = 7
    }

    const stripeSession = await getStripe().checkout.sessions.create(sessionOptions)

    return NextResponse.json({ url: stripeSession.url })
  } catch (error: any) {
    console.error("Checkout error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
