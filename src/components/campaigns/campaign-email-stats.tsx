"use client"
import { useState, useEffect } from "react"

export function CampaignEmailStats({ campaignId }: { campaignId: string }) {
  const [stats, setStats] = useState<{
    sent: number
    uniqueOpens: number
    openRate: number
    totalClicks: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/stats`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); setStats(null) }
        else { setStats(d); setError("") }
      })
      .catch(() => setError("Failed to load stats"))
      .finally(() => setLoading(false))
  }, [campaignId])

  if (error) {
    return <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-3 text-sm text-brand-accent">{error}</div>
  }

  if (loading || !stats) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-brand-surface" />
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
