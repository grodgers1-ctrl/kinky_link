"use client"
import { useState, useEffect } from "react"

interface GscRow {
  keys: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

export function GscSummary({ siteId }: { siteId: string }) {
  const [rows, setRows] = useState<GscRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    setLoading(true)
    setError("")
    fetch(`/api/sites/${siteId}/performance`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error)
          setRows([])
        } else {
          setRows(d.rows || [])
        }
      })
      .catch(() => setError("Failed to load performance data"))
      .finally(() => setLoading(false))
  }, [siteId])

  if (error) {
    return (
      <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-4 text-sm text-brand-accent">
        {error}
      </div>
    )
  }

  const totalClicks = rows.reduce((s, r) => s + (r.clicks || 0), 0)
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0)
  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : "—"
  const avgPosition = rows.length > 0
    ? (rows.reduce((s, r) => s + (r.position || 0), 0) / rows.length).toFixed(1)
    : "—"

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Clicks" value={loading ? "..." : totalClicks.toLocaleString()} />
        <StatCard label="Impressions" value={loading ? "..." : totalImpressions.toLocaleString()} />
        <StatCard label="CTR" value={loading ? "..." : `${avgCtr}%`} />
        <StatCard label="Position" value={loading ? "..." : avgPosition} />
      </div>

      {loading ? (
        <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-4 text-sm text-[#777777]">
          Loading top queries...
        </div>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[#DCDDDE] bg-brand-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#DCDDDE] text-[#777777]">
                <th className="px-4 py-3 font-medium">Query</th>
                <th className="px-4 py-3 font-medium">Clicks</th>
                <th className="px-4 py-3 font-medium">Impressions</th>
                <th className="px-4 py-3 font-medium">CTR</th>
                <th className="px-4 py-3 font-medium">Position</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-[#DCDDDE] text-brand-secondary last:border-0">
                  <td className="max-w-xs truncate px-4 py-3">{row.keys?.[0] || "—"}</td>
                  <td className="px-4 py-3">{row.clicks ?? "—"}</td>
                  <td className="px-4 py-3">{row.impressions ?? "—"}</td>
                  <td className="px-4 py-3">{row.ctr != null ? `${(row.ctr * 100).toFixed(1)}%` : "—"}</td>
                  <td className="px-4 py-3">{row.position != null ? row.position.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-4 text-sm text-[#777777]">
          No performance data available for this site.
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-4">
      <p className="text-sm text-[#777777]">{label}</p>
      <p className="mt-1 text-h3 font-semibold text-brand-secondary">{value}</p>
    </div>
  )
}
