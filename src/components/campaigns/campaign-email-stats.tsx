"use client"
import { useState, useEffect } from "react"

export function CampaignEmailStats({ campaignId }: { campaignId: string }) {
  const [stats, setStats] = useState<{
    sent: number
    uniqueOpens: number
    openRate: number
    totalClicks: number
  } | null>(null)

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null))
  }, [campaignId])

  if (!stats) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MiniStat label="Sent" value={stats.sent.toString()} />
      <MiniStat label="Opens" value={stats.uniqueOpens.toString()} />
      <MiniStat label="Open Rate" value={`${stats.openRate}%`} />
      <MiniStat label="Clicks" value={stats.totalClicks.toString()} />
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-3">
      <p className="text-xs text-[#777777]">{label}</p>
      <p className="mt-1 text-h3 font-semibold text-brand-secondary">{value}</p>
    </div>
  )
}
