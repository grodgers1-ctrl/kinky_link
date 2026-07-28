import { auth } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { PricingCards } from "@/components/billing/pricing-cards"

export default async function PricingPage() {
  const session = await auth()
  let subscriptionStatus = "none"

  if (session?.user) {
    const { data: user } = await supabase
      .from("users")
      .select("subscription_status")
      .eq("id", session.user.id)
      .single()
    subscriptionStatus = user?.subscription_status || "none"
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-h2 font-bold text-brand-secondary">Simple, transparent pricing</h1>
        <p className="mt-2 text-body text-[#575858]">Start free for 7 days. No credit card required.</p>
      </div>
      <PricingCards subscriptionStatus={subscriptionStatus} />
    </div>
  )
}
