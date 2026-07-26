"use client"
import { useState, useEffect } from "react"

export function EmailStats() {
  const [stats, setStats] = useState<{
    sent: number
    uniqueOpens: number
    totalOpens: number
    openRate: number
    totalClicks: number
    clickRate: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/stats/email")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); setStats(null) }
        else { setStats(d); setError("") }
      })
      .catch(() => setError("Failed to load stats"))
      .finally(() => setLoading(false))
  }, [])

  if (error) {
    return (
      <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-4 text-sm text-brand-accent">
        {error}
      </div>
    )
  }

  if (loading || !stats) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    )
  }

  if (stats.sent === 0) {
    return (
      <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-6 text-center text-sm text-[#575858]">
        No emails sent yet. Start sending to see stats.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MiniStat label="Sent" value={stats.sent.toString()} />
      <MiniStat label="Opens" value={`${stats.uniqueOpens} (${stats.openRate}%)`} />
      <MiniStat label="Total Opens" value={stats.totalOpens.toString()} />
      <MiniStat label="Clicks" value={`${stats.totalClicks} (${stats.clickRate}%)`} />
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
