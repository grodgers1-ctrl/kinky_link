"use client"
import { useState } from "react"

export function BillingSettings({ subscription }: { subscription: any }) {
  const [loading, setLoading] = useState(false)

  const handleManage = async () => {
    setLoading(true)
    const res = await fetch("/api/billing/portal")
    const data = await res.json()
    if (data.url) window.location.href = data.url
    setLoading(false)
  }

  const isActive = subscription?.subscription_status === "active" || subscription?.subscription_status === "trialing"
  const daysLeft = subscription?.trial_end
    ? Math.max(0, Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / 86400000))
    : 0

  return (
    <div className="rounded-lg border border-[#DCDDDE] bg-white p-6">
      <h2 className="text-lg font-semibold text-brand-secondary">Billing</h2>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[#777777]">Status</span>
          <span className="font-medium text-brand-secondary">
            {subscription?.subscription_status || "none"}
          </span>
        </div>
        {subscription?.subscription_plan && (
          <div className="flex items-center justify-between">
            <span className="text-[#777777]">Plan</span>
            <span className="font-medium text-brand-secondary">{subscription.subscription_plan}</span>
          </div>
        )}
        {daysLeft > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[#777777]">Trial ends in</span>
            <span className="font-medium text-brand-secondary">{daysLeft} days</span>
          </div>
        )}
      </div>

      <button
        onClick={handleManage}
        disabled={loading}
        className="mt-6 rounded-lg bg-brand-secondary px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Loading..." : isActive ? "Manage Subscription" : "Subscribe"}
      </button>
    </div>
  )
}
