import { getStripe } from "@/lib/stripe"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(req: NextRequest) {
  const bodyText = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 })

  let event: any
  try {
    event = getStripe().webhooks.constructEvent(bodyText, signature, STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const eventData = event.data.object as Record<string, any>
  const userId = eventData.metadata?.userId

  if (!userId) return NextResponse.json({}, { status: 200 })

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const sub = await getStripe().subscriptions.retrieve(eventData.subscription) as any

        await supabaseAdmin
          .from("users")
          .update({
            stripe_customer_id: eventData.customer,
            subscription_status: sub.status,
            subscription_plan: sub.items?.data?.[0]?.price?.recurring?.interval || "monthly",
            subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            trial_end: new Date(sub.trial_end * 1000).toISOString(),
          })
          .eq("id", userId)
        break
      }

      case "customer.subscription.updated": {
        await supabaseAdmin
          .from("users")
          .update({
            subscription_status: eventData.status,
            subscription_current_period_end: new Date(eventData.current_period_end * 1000).toISOString(),
          })
          .eq("stripe_customer_id", eventData.customer)
        break
      }

      case "customer.subscription.deleted": {
        await supabaseAdmin
          .from("users")
          .update({ subscription_status: "canceled", subscription_plan: "none" })
          .eq("stripe_customer_id", eventData.customer)
        break
      }

      case "invoice.payment_failed": {
        await supabaseAdmin
          .from("users")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", eventData.customer)
        break
      }
    }
  } catch (error) {
    console.error("Stripe webhook error:", error)
  }

  return NextResponse.json({ received: true })
}
