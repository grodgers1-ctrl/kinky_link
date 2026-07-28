"use client"
import { useEffect, useState } from "react"
import Link from "next/link"

export function BacklinksWidget() {
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    fetch("/api/backlinks")
      .then(r => r.json())
      .then(d => setSummary(d.summary))
      .catch(() => {})
  }, [])

  if (!summary) {
    return <div className="mt-2 h-16 animate-pulse rounded bg-gray-100" />
  }

  return (
    <div className="mt-4 grid grid-cols-3 gap-3">
      <div>
        <p className="text-2xl font-semibold text-brand-secondary">{summary.total}</p>
        <p className="text-sm text-[#777777]">Total</p>
      </div>
      <div>
        <p className="text-2xl font-semibold text-green-600">{summary.healthy}</p>
        <p className="text-sm text-[#777777]">Healthy</p>
      </div>
      <div>
        <p className="text-2xl font-semibold text-red-600">{summary.broken}</p>
        <p className="text-sm text-[#777777]">Broken</p>
      </div>
    </div>
  )
}
