import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { getStripe, MONTHLY_PRICE_ID, YEARLY_PRICE_ID } from "@/lib/stripe"
import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { plan } = body
    const priceId = plan === "yearly" ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("stripe_customer_id")
      .eq("id", session.user.id)
      .single()

    const idLabel = `lightlinks_${crypto.randomUUID().slice(0, 8)}`

    const stripeSession = await getStripe().checkout.sessions.create({
      customer: user?.stripe_customer_id || undefined,
      customer_email: user?.stripe_customer_id ? undefined : session.user.email,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { userId: session.user.id },
      },
      metadata: { userId: session.user.id },
      integration_identifier: idLabel,
      success_url: `${process.env.AUTH_URL}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.AUTH_URL}/pricing`,
    })

    return NextResponse.json({ url: stripeSession.url })
  } catch (error: any) {
    console.error("Checkout error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
