"use client"
import { useState } from "react"

export function PricingCards({ subscriptionStatus }: { subscriptionStatus: string }) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleSubscribe = async (plan: string) => {
    setLoading(plan)

    if (!subscriptionStatus || subscriptionStatus === "none") {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } else {
      const res = await fetch("/api/billing/portal")
      const data = await res.json()
      if (data.url) window.location.href = data.url
    }

    setLoading(null)
  }

  const isSubscribed = subscriptionStatus !== "none"

  return (
    <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
      <div className={`rounded-2xl border p-8 shadow-sm ${isSubscribed ? "border-brand-accent" : "border-[#DCDDDE]"} bg-white`}>
        <h3 className="text-xl font-semibold text-brand-secondary">Monthly</h3>
        <p className="mt-4">
          <span className="text-4xl font-bold text-brand-secondary">$19</span>
          <span className="text-[#575858]">/month</span>
        </p>
        <ul className="mt-6 space-y-3 text-sm text-[#575858]">
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> Unlimited prospects</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> Unlimited email sequences</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> Gmail + GSC integration</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> Backlink monitoring</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> AI email writing (5/day)</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> Email finder + verifier</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> 7-day free trial</li>
        </ul>
        <button
          onClick={() => handleSubscribe("monthly")}
          disabled={loading === "monthly"}
          className="mt-8 w-full rounded-lg bg-brand-accent py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading === "monthly" ? "Redirecting..." : isSubscribed ? "Manage Subscription" : "Start Free Trial"}
        </button>
      </div>

      <div className={`rounded-2xl border-2 p-8 shadow-md ${isSubscribed ? "border-brand-accent" : "border-brand-accent"} bg-white`}>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-brand-secondary">Yearly</h3>
          <span className="rounded-full bg-brand-primary px-3 py-1 text-xs font-medium text-brand-secondary">Save 17%</span>
        </div>
        <p className="mt-4">
          <span className="text-4xl font-bold text-brand-secondary">$190</span>
          <span className="text-[#575858]">/year ($15.83/mo)</span>
        </p>
        <ul className="mt-6 space-y-3 text-sm text-[#575858]">
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> Everything in Monthly</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> 2 months free</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> Priority support</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> Early access to new features</li>
          <li className="flex items-center gap-2"><span className="text-green-600">&#10003;</span> 7-day free trial</li>
        </ul>
        <button
          onClick={() => handleSubscribe("yearly")}
          disabled={loading === "yearly"}
          className="mt-8 w-full rounded-lg bg-brand-accent py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading === "yearly" ? "Redirecting..." : isSubscribed ? "Manage Subscription" : "Start Free Trial"}
        </button>
      </div>
    </div>
  )
}
