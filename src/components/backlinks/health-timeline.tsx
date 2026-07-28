"use client"
import { useEffect, useState } from "react"

export function HealthTimeline({ backlinkId }: { backlinkId: string }) {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/backlinks/${backlinkId}/history`)
      .then(r => r.json())
      .then(d => { setHistory(d.history || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [backlinkId])

  if (loading) return null
  if (history.length === 0) return null

  return (
    <div className="rounded-lg border border-[#DCDDDE] bg-white p-4">
      <h3 className="text-sm font-medium text-[#777777]">Health History</h3>
      <div className="mt-3 space-y-2">
        {history.map((h: any) => (
          <div key={h.id} className="flex items-center gap-2 text-sm">
            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-[#575858]">
              {h.health_status}
            </span>
            <span className="text-[#999999]">{new Date(h.checked_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
